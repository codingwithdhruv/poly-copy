import { StrategyConfig, SizingRule } from '../config/types';
import { fetchMarketData, MarketData } from '../utils/market';
import { getTraderPortfolioValue } from '../utils/portfolio';
import { getUsdcBalance } from '../utils/chain';
import { RtdsTrade } from '../clients/monitor';

// FIX 1: Market-level exposure aggregation store
const MARKET_EXPOSURE: Record<string, {
    buyUsd: number;
    sellUsd: number;
    firstSeen: number;
}> = {};

// FIX 2: Deduplication set
const PROCESSED_TRADES = new Set<string>();

// FIX 3: Execution Latch
export const EXECUTED_MARKETS = new Set<string>();

export interface StrategyDecision {
    shouldExecute: boolean;
    sizeUsd?: number;
    reason?: string;
    marketData?: MarketData;
}

export class StrategyEngine {

    private lastCleanupTime = 0;

    constructor() { }

    public async evaluate(trade: RtdsTrade, config: StrategyConfig): Promise<StrategyDecision> {
        // Cleanup Stale Markets (Throttle: 5 mins)
        if (Date.now() - this.lastCleanupTime > 300000) { // 5 minutes
            const cutoff = 2 * 60 * 60 * 1000; // 2 hours
            const now = Date.now();
            let cleaned = 0;
            for (const [id, m] of Object.entries(MARKET_EXPOSURE)) {
                if (now - m.firstSeen > cutoff) {
                    delete MARKET_EXPOSURE[id];
                    cleaned++;
                }
            }
            if (cleaned > 0) {
                console.log(`[STRATEGY] Memory Cleanup: Removed ${cleaned} stale markets.`);
            }
            this.lastCleanupTime = now;
        }

        // 1. Fetch Context
        const marketData = await fetchMarketData(trade.conditionId);
        if (!marketData) {
            return { shouldExecute: false, reason: 'Market Data Not Found' };
        }

        // ----------------------------------------------------------------
        // FIX 1: Market-level exposure aggregation
        // ----------------------------------------------------------------

        // FIX 2: Deduplication Check
        if (PROCESSED_TRADES.has(trade.transactionHash)) {
            return { shouldExecute: false, reason: 'Duplicate trade' };
        }
        PROCESSED_TRADES.add(trade.transactionHash);

        const usd = trade.size * trade.price;

        if (!MARKET_EXPOSURE[trade.conditionId]) {
            MARKET_EXPOSURE[trade.conditionId] = {
                buyUsd: 0,
                sellUsd: 0,
                firstSeen: Date.now()
            };
        }

        if (trade.side === 'BUY') {
            MARKET_EXPOSURE[trade.conditionId].buyUsd += usd;
        } else {
            MARKET_EXPOSURE[trade.conditionId].sellUsd += usd;
        }

        const market = MARKET_EXPOSURE[trade.conditionId];

        // ----------------------------------------------------------------
        // FIX 4: Enforce time window
        // ----------------------------------------------------------------
        if (config.conditions.timeWindowMinutes) {
            const ageMinutes = (Date.now() - market.firstSeen) / 60000;
            if (ageMinutes > config.conditions.timeWindowMinutes) {
                delete MARKET_EXPOSURE[trade.conditionId];
                return { shouldExecute: false, reason: 'Conviction window expired' };
            }
        }

        // 1b. Check Time to Resolution (Existing check)
        if (config.conditions.minTimeToResolutionMinutes) {
            const endDate = new Date(marketData.endDate).getTime();
            const now = Date.now();
            const diffMinutes = (endDate - now) / 60000;
            if (diffMinutes < config.conditions.minTimeToResolutionMinutes) {
                return { shouldExecute: false, reason: `Too close to resolution (${diffMinutes.toFixed(0)}m < ${config.conditions.minTimeToResolutionMinutes}m)` };
            }
        }

        // 1c. Ignore Price Below Noise (Existing Check)
        if (config.conditions.ignorePriceBelow && trade.price < config.conditions.ignorePriceBelow) {
            return { shouldExecute: false, reason: `Price ${trade.price} below noise threshold` };
        }

        // ----------------------------------------------------------------
        // FIX 2 & 5: Check Aggregate Allocation with Safer Portfolio Estimation
        // ----------------------------------------------------------------
        let traderAllocPct = 0;

        // Calculate Net Exposure for Allocation Check
        const netExposure = Math.abs(market.buyUsd - market.sellUsd);

        // Safety: Filter tiny exposures
        if (netExposure < 25) {
            return { shouldExecute: false, reason: 'Exposure too small' };
        }

        // ALWAYS COMPUTE ALLOCATION (Removing the > 0 guard)
        const balance = await getUsdcBalance(config.traderAddress);
        const portfolioVal = await getTraderPortfolioValue(config.traderAddress);
        const totalEquity = Math.max(balance, portfolioVal);

        if (totalEquity > 1) {
            traderAllocPct = netExposure / totalEquity;
        }

        console.log(`[STRATEGY] Exposure: $${netExposure.toFixed(2)} | Equity: $${totalEquity.toFixed(2)} | Alloc: ${(traderAllocPct * 100).toFixed(2)}%`);

        if (traderAllocPct < config.conditions.minTraderPortfolioAlloc) {
            // We keep tracking but don't execute execution
            return {
                shouldExecute: false,
                reason: `Alloc ${(traderAllocPct * 100).toFixed(2)}% < Min ${(config.conditions.minTraderPortfolioAlloc * 100).toFixed(0)}%`
            };
        }

        // ----------------------------------------------------------------
        // FIX 3: Single Side Dominance
        // ----------------------------------------------------------------
        if (config.conditions.singleSideDominanceThreshold) {
            const dominance = netExposure === 0
                ? 0
                : Math.max(market.buyUsd, market.sellUsd) / (market.buyUsd + market.sellUsd);

            if (dominance < config.conditions.singleSideDominanceThreshold) {
                return { shouldExecute: false, reason: `Dominance ${dominance.toFixed(2)} < ${config.conditions.singleSideDominanceThreshold}` };
            }
        }

        // 3. Execution Count & Latch Check
        if (!config.allowMultipleExecutions && EXECUTED_MARKETS.has(trade.conditionId)) {
            return { shouldExecute: false, reason: 'Already executed for market' };
        }

        // 5. Calculate Sizing (Existing logic)
        const sizeUsd = this.calculateSize(trade, config, traderAllocPct);

        if (sizeUsd <= 0) {
            return { shouldExecute: false, reason: 'Calculated Size is 0' };
        }

        return {
            shouldExecute: true,
            sizeUsd: sizeUsd,
            reason: `Matched: Alloc ${traderAllocPct.toFixed(2)}`,
            marketData
        };
    }

    private calculateSize(trade: RtdsTrade, config: StrategyConfig, traderAllocPct: number): number {
        // Default wallet balance (Should be fetched from Executor/Wallet really, 
        // but sizing rules can be relative).
        // The sizing rules in config are "ratio of wallet"
        // so we return the RATIO here, or we need the Wallet Balance.
        // Let's assume we return a "Target Amount USD" assuming a specific wallet balance 
        // OR we return the Ratio and the Executor applies it.
        // Actually, the `evaluate` method usually prepares the order params.

        // Let's pass a mock wallet balance of 1.0 (unit) and return the ratio?
        // No, let's try to get the rule value.

        // Find matching rule
        const rule = config.sizing.rules.find(r =>
            traderAllocPct >= r.minTraderAlloc && traderAllocPct < r.maxTraderAlloc
        );

        if (!rule) return 0;

        // If defined copySizeRatio (Fixed Tiers)
        if (rule.copySizeRatio) {
            return -1 * rule.copySizeRatio; // Negative indicates "Ratio of Wallet" to Executor
        }

        // If defined copyWalletRatio (Wallet Scaled)
        if (rule.copyWalletRatio) {
            return -1 * rule.copyWalletRatio;
        }

        return 0;
    }
}
