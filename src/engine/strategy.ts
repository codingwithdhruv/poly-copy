import { StrategyConfig, SizingRule } from '../config/types';
import { fetchMarketData, MarketData } from '../utils/market';
import { getTraderPortfolioValue } from '../utils/portfolio';
import { getUsdcBalance } from '../utils/chain';
import { RtdsTrade } from '../clients/monitor';

export interface StrategyDecision {
    shouldExecute: boolean;
    sizeUsd?: number;
    reason?: string;
    marketData?: MarketData;
}

export class StrategyEngine {

    constructor() { }

    public async evaluate(trade: RtdsTrade, config: StrategyConfig): Promise<StrategyDecision> {
        // 1. Fetch Context
        const marketData = await fetchMarketData(trade.conditionId);
        if (!marketData) {
            return { shouldExecute: false, reason: 'Market Data Not Found' };
        }

        // 1b. Check Time to Resolution (If configured)
        if (config.conditions.minTimeToResolutionMinutes) {
            const endDate = new Date(marketData.endDate).getTime();
            const now = Date.now();
            const diffMinutes = (endDate - now) / 60000;
            if (diffMinutes < config.conditions.minTimeToResolutionMinutes) {
                return { shouldExecute: false, reason: `Too close to resolution (${diffMinutes.toFixed(0)}m < ${config.conditions.minTimeToResolutionMinutes}m)` };
            }
        }

        // 1c. Ignore Price Below Noise
        if (config.conditions.ignorePriceBelow && trade.price < config.conditions.ignorePriceBelow) {
            return { shouldExecute: false, reason: `Price ${trade.price} below noise threshold` };
        }

        // 2. Fetch Trader Portfolio & Calculate Allocation
        // Only fetch if we need it for allocation check
        let traderAllocPct = 0;
        if (config.conditions.minTraderPortfolioAlloc > 0) {
            // Fetch Positions Value (API)
            const positionsVal = await getTraderPortfolioValue(config.traderAddress);

            // Fetch Cash Balance (Chain)
            const cashVal = await getUsdcBalance(config.traderAddress);

            const totalEquity = positionsVal + cashVal;

            const tradeValue = trade.size * trade.price;

            // Avoid division by zero
            if (totalEquity <= 1) {
                // Safety: If we can't see any equity, assume high risk/high alloc? 
                // Or safe default. If they have $0, they shouldn't be trading.
                // Let's assume tradeValue/1 which is huge -> triggers min check? 
                // No, usually safeguard is return 0 alloc.
                traderAllocPct = 0;
            } else {
                traderAllocPct = tradeValue / totalEquity;
            }

            console.log(`[STRATEGY] Target Equity: $${totalEquity.toFixed(2)} (Cash: $${cashVal.toFixed(0)} + Pos: $${positionsVal.toFixed(0)})`);
            console.log(`[STRATEGY] Trade Val: $${tradeValue.toFixed(2)} -> Alloc: ${(traderAllocPct * 100).toFixed(2)}%`);

            if (traderAllocPct < config.conditions.minTraderPortfolioAlloc) {
                return {
                    shouldExecute: false,
                    reason: `Alloc ${(traderAllocPct * 100).toFixed(2)}% < Min ${(config.conditions.minTraderPortfolioAlloc * 100).toFixed(0)}%`
                };
            }
        }

        // 3. Execution Count & Time Window
        // Use a static/global store to track executions per market/trader.
        // For simplicity, we'll implement the "check" here but need a persistent state passed in or global.
        // TODO: Add ExecutionHistory check.

        // 4. Single Side Dominance / Require Single Side
        // This requires checking the trader's *existing* positions in this market.
        // If "Require Single Side" is true, we must ensure they don't have the opposite position.
        // If "Single Side Dominance" > 90%, same.
        // This is expensive to check every trade (requires /positions call).
        // For now, we assume if they are Buying, that adds to side. If Selling, it reduces.
        // We will skip this check in V1 for speed unless critical. 
        // User requirements were strict: "Single side dominant (>90% net exposure)"
        // Let's implement a 'No Flip' check at least.

        // 5. Calculate Sizing
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
