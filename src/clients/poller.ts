import axios from 'axios';
import { StrategyConfig } from '../config/types';
import { Config } from '../config';
import { RtdsTrade, TradeHandler } from './monitor'; // Reuse interface

export class TradePoller {
    private isRunning = false;
    private strategies: StrategyConfig[];
    private onTradeDetected: TradeHandler;
    private pollIntervalMs: number = 2000;
    private lastSeenTradeIds: Set<string> = new Set();
    private isFirstRun = true;

    constructor(onTradeDetected: TradeHandler) {
        // No client needed for Public API
        this.strategies = Config.getActiveStrategies();
        this.onTradeDetected = onTradeDetected;
    }

    public start() {
        if (this.strategies.length === 0) {
            console.warn("No strategies configured. Poller will not start.");
            return;
        }
        this.isRunning = true;
        console.log(`[POLLER] Starting Activity Polling for ${this.strategies.length} targets...`);
        this.poll();
    }

    public stop() {
        this.isRunning = false;
    }

    private async poll() {
        if (!this.isRunning) return;

        try {
            for (const strat of this.strategies) {
                await this.checkActivity(strat);
            }
        } catch (e) {
            console.error("[POLLER] Error during poll cycle:", e);
        }

        setTimeout(() => this.poll(), this.pollIntervalMs);
    }

    private async checkActivity(strat: StrategyConfig) {
        const target = strat.traderAddress;

        try {
            // Use Data API instead of CLOB client
            const url = `https://data-api.polymarket.com/trades?user=${target}&limit=10`;
            const response = await axios.get(url);
            const trades = response.data;

            // Log last 5 trades on first run
            if (this.isFirstRun && Array.isArray(trades) && trades.length > 0) {

                console.log(`\n══════════════════════════════════════════════════════════`);
                console.log(`📊 [DASHBOARD] Target: ${target}`);
                console.log(`   Last 5 Trades:`);
                console.log(`══════════════════════════════════════════════════════════`);

                trades.slice(0, 5).forEach((t: any, i: number) => {
                    const time = t.timestamp ? new Date(t.timestamp * 1000).toLocaleTimeString() : 'N/A';
                    const price = Number(t.price) || 0;
                    const outcome = t.outcome || 'N/A';
                    const title = t.title || 'Unknown Market';
                    const side = t.side || 'UNK';
                    const size = Number(t.size).toFixed(2);

                    console.log(`  ${i + 1}. [${side}] ${size} ${outcome} @ $${price.toFixed(3)} (${time})`);
                    console.log(`     📌 ${title}`);
                });
                console.log(`══════════════════════════════════════════════════════════\n`);
            }

            this.processTrades(trades, strat, target);

            if (this.isFirstRun) {
                this.isFirstRun = false;
                console.log(`[POLLER] Initial scan complete. Monitoring for new trades...`);
            }
        } catch (error) {
            console.error(`[POLLER] Failed to fetch activity for ${target}:`, error);
        }
    }

    private processTrades(trades: any[], strat: StrategyConfig, target: string) {
        if (!trades || trades.length === 0) return;

        // Sort by time/match_id if needed, but SDK usually returns recent first.
        // We iterate and check if processed.

        for (const raw of trades) {
            // Unique ID: use transactionHash or fallback
            const tradeId = raw.transactionHash || raw.id || raw.match_id || `${raw.asset}-${raw.timestamp}`;

            if (this.lastSeenTradeIds.has(tradeId)) {
                continue; // Already processed
            }

            // If first run, just mark as seen so we don't copy old history
            if (this.isFirstRun) {
                this.lastSeenTradeIds.add(tradeId);
                continue;
            }

            // New Trade!
            this.lastSeenTradeIds.add(tradeId);

            // Data API returns trades where the user was involved.
            // 'side' is usually the user's side (BUY/SELL).
            let mySide: 'BUY' | 'SELL' = raw.side === 'BUY' ? 'BUY' : 'SELL';

            // Optional: Filter if we care about Maker/Taker, but Data API usually implies execution.
            // For now, we copy EVERYTHING.

            console.log(`[POLLER] New Trade Detected! ${target} ${mySide} ${Number(raw.size)} ${raw.outcome} on "${raw.title}"`);

            const trade: RtdsTrade = {
                user: target,
                asset: raw.asset || '',           // Correct field from Data API
                side: mySide,
                size: Number(raw.size),
                price: Number(raw.price) || 0,
                transactionHash: raw.transactionHash || '',
                conditionId: raw.conditionId || ''    // Correct field from Data API
            };

            this.onTradeDetected(trade, strat);
        }

        // Prune Set to prevent infinite growth?
        if (this.lastSeenTradeIds.size > 1000) {
            this.lastSeenTradeIds.clear(); // Simple/Crude clear. 
            // Better: remove old ones. But safe enough for low volume.
        }
    }
}
