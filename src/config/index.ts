import { USER_CONFIG } from './settings';
import { StrategyConfig } from './types';
import dotenv from 'dotenv';
dotenv.config();

export const GLOBAL_CONFIG = {
    PRIVATE_KEY: process.env.PRIVATE_KEY || '',
    POLY_PROXY_ADDRESS: process.env.POLY_PROXY_ADDRESS || '',
    RPC_URL: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    RTDS_URL: 'wss://ws-live-data.polymarket.com',
};

export class Config {
    static getActiveStrategies(): StrategyConfig[] {
        if (GLOBAL_CONFIG.PRIVATE_KEY === '') {
            throw new Error("PRIVATE_KEY is missing in .env");
        }

        // Validate basic config
        if (!USER_CONFIG.traderAddress) {
            console.error("[CONFIG] Critical: 'traderAddress' is not set in src/config/settings.ts or .env");
            // We return it anyway so valid-check fails later gracefully or process exits?
            // Best to just allow it -> Monitor will complain.
        }

        return [USER_CONFIG];
    }
}

export * from './types';
export * from './settings';
