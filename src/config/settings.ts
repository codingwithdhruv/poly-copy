import { StrategyConfig } from './types';
import dotenv from 'dotenv';
dotenv.config();

// ==========================================
//      POLY-COPY BOT SETTINGS
// ==========================================
// Tweak these values to adjust the bot's behavior.
// This single file controls the entire strategy.

export const USER_CONFIG: StrategyConfig = {
    // 1. Target Trader
    traderAddress: process.env.TRADER_ADDRESS_TARGET || '',
    alias: 'DelayedConviction_Whale',
    globalWalletAllocationPct: 1.0, // Use 100% of available wallet (Set to 0.5 to use only 50%)

    // 2. Core Strategy Logic
    // 'DIVERSIFIED_COPY': Checks dominance, allows multiple trades.
    // 'CERTAINTY_SNIPER': Strict single-shot, strict time-to-resolution checks.
    strategyType: 'CERTAINTY_SNIPER',

    allowMultipleExecutions: false, // Set FALSE for strict single-shot mode

    // 3. Signal Filters (When do we copy?)
    conditions: {
        // Minimum % of THEIR portfolio they must bet to trigger a copy
        minTraderPortfolioAlloc: 0, // 0.10 = 10%

        // Ignore noise: trade price must be > 3 cents
        ignorePriceBelow: 0.10,

        // Time limits
        maxExecutionsPerMarket: 5,
        timeWindowMinutes: 615,

        // Advanced: Only copy if they are 90%+ one-sided
        singleSideDominanceThreshold: 0.85,

        // Optional: Require min time to resolution (e.g. 60 mins)
        // minTimeToResolutionMinutes: 60 
    },

    // 4. Position Sizing (How much do we bet?)
    sizing: {
        mode: 'FIXED_TIERS', // 'FIXED_TIERS' or 'WALLET_SCALED'
        rules: [
            // Rule 0: Low Alloc Tier (0% - 1%)
            {
                minTraderAlloc: 0,
                maxTraderAlloc: 0.01,
                copySizeRatio: 0.01
            },
            // Rule 1: If they bet 1% - 5%, we bet 1.5% of OUR wallet
            {
                minTraderAlloc: 0.01,
                maxTraderAlloc: 0.05,
                copySizeRatio: 0.015
            },
            // Rule 2: If they bet > 5%, we bet 2.5% of OUR wallet
            {
                minTraderAlloc: 0.05,
                maxTraderAlloc: Infinity,
                copySizeRatio: 0.025
            }
        ]
    },

    // 5. Risk Controls (Hard limits)
    risk: {
        maxTotalOpenExposure: 0.60, // Max 75% of wallet at risk total
        maxSingleMarketExposure: 0.20, // Max 22% in one market
        maxSingleTradeSize: 0.025, // Max 2% per single order
        maxOpenPositions: 6
    },

    // 6. Overrides
    overrides: {
        disableInventoryMode: true,
        disableAccumulators: true,
        disableFlipTrading: true
    }
};

console.log(`[SETTINGS] Loaded Strategy for: ${USER_CONFIG.traderAddress}`);
console.log(`[SETTINGS] Strategy Type: ${USER_CONFIG.strategyType}`);
console.log(`[SETTINGS] Min Alloc Trigger: ${USER_CONFIG.conditions.minTraderPortfolioAlloc * 100}%`);