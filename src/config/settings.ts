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
    alias: 'Inventory_Trader',
    globalWalletAllocationPct: 1.0, // Use 100% of available wallet (Set to 0.5 to use only 50%)

    // 2. Core Strategy Logic
    // 'DIVERSIFIED_COPY': Checks dominance, allows multiple trades.
    // 'CERTAINTY_SNIPER': Strict single-shot, strict time-to-resolution checks.
    strategyType: 'DIVERSIFIED_COPY',

    allowMultipleExecutions: true, // Set FALSE for strict single-shot mode

    // 3. Signal Filters (When do we copy?)
    conditions: {
        // Minimum % of THEIR portfolio they must bet to trigger a copy
        minTraderPortfolioAlloc: 0.005, // 0.10 = 10%

        // Ignore noise: trade price must be > 3 cents
        ignorePriceBelow: 0.03,

        // Time limits
        maxExecutionsPerMarket: 15,
        timeWindowMinutes: 30,

        // Advanced: Only copy if they are 90%+ one-sided
        singleSideDominanceThreshold: 0.55,

        // Optional: Require min time to resolution (e.g. 60 mins)
        // minTimeToResolutionMinutes: 60 
    },

    // 4. Position Sizing (How much do we bet?)
    sizing: {
        mode: 'WALLET_SCALED', // 'FIXED_TIERS' or 'WALLET_SCALED'
        rules: [
            // Rule 1: If they bet 12% - 20%, we bet 1.5% of OUR wallet
            {
                minTraderAlloc: 0.005,
                maxTraderAlloc: 0.02,
                copySizeRatio: 0.015
            },
            // Rule 2: If they bet > 20%, we bet 2.5% of OUR wallet
            {
                minTraderAlloc: 0.02,
                maxTraderAlloc: Infinity,
                copySizeRatio: 0.02
            }
        ]
    },

    // 5. Risk Controls (Hard limits)
    risk: {
        maxTotalOpenExposure: 0.40, // Max 75% of wallet at risk total
        maxSingleMarketExposure: 0.10, // Max 22% in one market
        maxSingleTradeSize: 0.02, // Max 2% per single order
        maxOpenPositions: 20
    },

    // 6. Overrides
    overrides: {
        disableInventoryMode: false,
        disableAccumulators: false,
        disableFlipTrading: false
    }
};

console.log(`[SETTINGS] Loaded Strategy for: ${USER_CONFIG.traderAddress}`);
console.log(`[SETTINGS] Strategy Type: ${USER_CONFIG.strategyType}`);
console.log(`[SETTINGS] Min Alloc Trigger: ${USER_CONFIG.conditions.minTraderPortfolioAlloc * 100}%`);
