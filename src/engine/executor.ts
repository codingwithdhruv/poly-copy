import { ClobClient, OrderType, Side } from '@polymarket/clob-client';
import { createClobClient } from '../clients/clob';
import { StrategyConfig } from '../config/types';
import { MarketData } from '../utils/market';
import { ethers, Wallet } from 'ethers';
import { GLOBAL_CONFIG } from '../config';
import { getUsdcBalance } from '../utils/chain';

// Basic in-memory store for open positions to track exposure (since we don't scan full positions on every tick)
// In a real robust bot, this should fetch initially from API.
const EXPOSURE_STORE: Record<string, number> = {}; // MarketID -> USD Exposure
let TOTAL_SESSIONS_EXPOSURE = 0;

export class Executor {
    public client!: ClobClient; // Public for Poller access
    private walletAddress: string = "";

    constructor() { }

    public async init() {
        // 1. Setup Wallet
        const provider = new ethers.providers.JsonRpcProvider(GLOBAL_CONFIG.RPC_URL);
        const wallet = new Wallet(GLOBAL_CONFIG.PRIVATE_KEY, provider);

        // If Proxy is set, that is our "Wallet Address" for balances and funding
        const proxyAddr = GLOBAL_CONFIG.POLY_PROXY_ADDRESS;
        this.walletAddress = proxyAddr ? proxyAddr : wallet.address;

        console.log(`Executor initializing...`);
        console.log(`Signer: ${wallet.address}`);
        console.log(`Funder (Wallet): ${this.walletAddress}`);

        // 2. Init Client
        // Debug Check
        if (typeof (wallet as any)._signTypedData === 'function') {
            console.log("[EXECUTOR] Wallet check passed: _signTypedData exists.");
        } else {
            console.error("[EXECUTOR] CRITICAL TYPE ERROR: Wallet missing _signTypedData! Ethers version mismatch?");
        }

        // Pass Proxy Address if it exists
        // STEP 1: L1 Init (Always EOA, SigType 0) to derive keys
        // We DO NOT pass the proxy address here, or the SDK might try to sign as a proxy for key creation/derivation, which fails (400).
        this.client = await createClobClient(wallet);

        // 3. Drive/Create API Keys (L2 Auth)
        let creds: any = undefined; // Use any to match legacy flow or importing types

        try {
            console.log("[EXECUTOR] (L1) Attempting to DERIVE existing API Keys...");
            creds = await this.client.deriveApiKey();
            console.log("[EXECUTOR] Derived existing API Key.");
        } catch (e) {
            console.warn("[EXECUTOR] Derive failed (expected if new API key needed). Attempting to CREATE new API Key...");
            try {
                creds = await this.client.createApiKey();
                console.log("[EXECUTOR] Created new API Key.");
            } catch (createError) {
                console.error("[EXECUTOR] FATAL: Could not Create OR Derive API Key.", createError);
                // Don't throw yet, let the re-init fail if it must, or return
            }
        }

        if (creds) {
            // STEP 2: L2 Init (Proxy/Funder Mode if configured)
            // Now we re-initialize with credentials AND the Proxy Address (Funder) to enable trading.
            console.log("[EXECUTOR] Re-initializing Client with L2 Credentials...");
            this.client = await createClobClient(wallet, creds, proxyAddr || undefined);
        } else {
            console.error("[EXECUTOR] WARNING: Proceeding without L2 Credentials. Trading will fail.");
        }
    }

    private async getWalletBalance(): Promise<number> {
        return await getUsdcBalance(this.walletAddress);
    }

    public async execute(
        decision: { shouldExecute: boolean; sizeUsd?: number; marketData?: MarketData },
        config: StrategyConfig,
        side: 'BUY' | 'SELL',
        outcomeIndex: number, // 0 or 1 usually (Binary)
        price: number
    ) {
        if (!this.client) await this.init();

        if (!decision.shouldExecute || !decision.sizeUsd || !decision.marketData) {
            return;
        }

        const balance = await this.getWalletBalance();
        let tradeSizeUsd = decision.sizeUsd;

        // Handle Ratio-based sizing (negative values from Strategy Engine)
        if (tradeSizeUsd < 0) {
            const ratio = -tradeSizeUsd;
            tradeSizeUsd = balance * ratio;
        }

        console.log(`[EXECUTOR] Attempting to place order: $${tradeSizeUsd.toFixed(2)} on ${decision.marketData.question}`);

        // 1. Risk Checks
        if (tradeSizeUsd > balance * config.risk.maxSingleTradeSize) {
            console.warn(`[RISK] Trade size $${tradeSizeUsd} exceeds max single trade ratio. Capping.`);
            tradeSizeUsd = balance * config.risk.maxSingleTradeSize;
        }

        // Check Total Exposure
        if (TOTAL_SESSIONS_EXPOSURE + tradeSizeUsd > balance * config.risk.maxTotalOpenExposure) {
            console.warn(`[RISK] Total exposure limit reached. Skipping.`);
            return;
        }

        // Check Single Market Exposure
        const currentMarketExp = EXPOSURE_STORE[decision.marketData.conditionId] || 0;
        if (currentMarketExp + tradeSizeUsd > balance * config.risk.maxSingleMarketExposure) {
            console.warn(`[RISK] Single market exposure limit reached. Skipping.`);
            return;
        }

        // 2. Execution
        try {
            const tokenId = decision.marketData.tokens[outcomeIndex]?.token_id;
            if (!tokenId) {
                console.error("Token ID not found for outcome index " + outcomeIndex);
                return;
            }

            // Calculate shares
            // size USD = shares * price
            // shares = size USD / price
            const shares = tradeSizeUsd / price;

            // Rounding logic for CLOB (shares must be significant)
            if (shares < 1) { // Polylmarket min size checks might apply
                console.warn("Shares too low: " + shares);
                return;
            }

            // Fetch Market/Book Data for Tick Size & Neg Risk
            let tickSize = "0.01";
            let negRisk = false;

            try {
                // We can use getOrderBook logic or getMarket. 
                // User suggested getOrderBook.
                const book = await this.client.getOrderBook(tokenId);
                if (book) {
                    tickSize = book.tick_size || "0.01";
                    // neg_risk might not be on book object directly depending on SDK version, 
                    // but often is. If not, we default false.
                    // Checking type definition would be ideal, but assuming user snippet is correct.
                    negRisk = (book as any).neg_risk || false;
                }
            } catch (err) {
                console.warn("[EXECUTOR] Failed to fetch book params, defaulting to 0.01/false", err);
            }

            // Round Price to Tick Size
            const precision = tickSize === "0.1" ? 1 : tickSize === "0.01" ? 2 : tickSize === "0.001" ? 3 : 4;
            // Robust rounding:
            const multiplier = 1 / Number(tickSize);
            const roundedPrice = Math.round(price * multiplier) / multiplier;

            console.log(`[ORDER] Placing BUY for ${shares.toFixed(2)} shares at price ${roundedPrice} (Tick: ${tickSize}, NegRisk: ${negRisk})`);

            // Create Order
            // Side is usually BUY for copy compliance (we copy their side).
            // If they sold, we might sell if we hold it, but typically copy bots Enter when they Enter.
            // Config said "Same-side only". So if they Buy YES, we Buy YES.

            const order = await this.client?.createOrder({
                tokenID: tokenId,
                price: roundedPrice, // Limit order at observed price (or slightly better/worse?)
                side: side === 'BUY' ? Side.BUY : Side.SELL,
                size: shares,
                feeRateBps: 0,
                nonce: 0 // SDK handles this
            }, {
                tickSize: tickSize as any,
                negRisk: negRisk
            });

            if (order) {
                const resp = await this.client?.postOrder(order);
                console.log("Order Placed:", resp);

                // Update Exposure
                TOTAL_SESSIONS_EXPOSURE += tradeSizeUsd;
                EXPOSURE_STORE[decision.marketData.conditionId] = currentMarketExp + tradeSizeUsd;
            }

        } catch (e) {
            console.error("Executor Error:", e);
        }
    }
}
