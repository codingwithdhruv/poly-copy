
export interface SizingRule {
    minTraderAlloc: number; // e.g. 0.12 (12%)
    maxTraderAlloc: number; // e.g. 0.20 (20%)
    copySizeRatio?: number; // e.g. 0.015 (1.5% of wallet) - Used for FIXED_RATIO
    copyWalletRatio?: number; // e.g. 0.12 (12% of wallet) - Used for WALLET_SCALED
    hardHeader?: boolean; // If true, apply MAX_CAP immediately
}

export interface CopyConditions {
    minTraderPortfolioAlloc: number; // e.g. 0.12 (12%) or 0.05 (5%)
    maxExecutionsPerMarket?: number; // e.g. 3 or 5
    requireSingleSide?: boolean; // True if we only copy if trader is heavily one-sided
    minTimeToResolutionMinutes?: number; // e.g. 60
    singleSideDominanceThreshold?: number; // e.g. 0.90 (90%)
    ignorePriceBelow?: number; // e.g. 0.03
    timeWindowMinutes?: number; // Window for counting executions (e.g. 10 or 15 mins)
}

export interface RiskControls {
    maxTotalOpenExposure: number; // e.g. 0.75 (75% of wallet)
    maxSingleMarketExposure: number; // e.g. 0.22 (22%)
    maxSingleTradeSize: number; // e.g. 0.02 (2%) or 0.25 (25%)
    maxOpenPositions?: number; // e.g. 3 (for Certainty strategy)
}

export interface StrategyConfig {
    traderAddress: string;
    alias: string; // 'Trader1' or 'Trader2'
    strategyType: 'DIVERSIFIED_COPY' | 'CERTAINTY_SNIPER'; // Internal names for the two logic flows

    conditions: CopyConditions;

    allowMultipleExecutions: boolean; // Trader 1 = yes (up to 5), Trader 2 = NO (single shot usually)

    sizing: {
        mode: 'FIXED_TIERS' | 'WALLET_SCALED';
        rules: SizingRule[];
    };

    risk: RiskControls;

    overrides: {
        disableInventoryMode: boolean;
        disableAccumulators: boolean;
        disableFlipTrading: boolean;
    };
}
