import { TradeMonitor, RtdsTrade } from './clients/monitor';
import { TradePoller } from './clients/poller';
import { StrategyEngine } from './engine/strategy';
import { Executor } from './engine/executor';
import { StrategyConfig } from './config/types';
import { GLOBAL_CONFIG } from './config';
import { ethers } from 'ethers';
import { getUsdcBalance } from './utils/chain';
import { USER_CONFIG } from './config/settings';

async function main() {
    console.log("Starting Poly-Copy Bot...");

    // 0. HEALTH CHECK
    // My Balance
    // 0. HEALTH CHECK
    // My Balance
    try {
        // v5 Wallet constructor only strictly needs private key, provider is optional
        const provider = new ethers.providers.JsonRpcProvider(GLOBAL_CONFIG.RPC_URL);
        const myWallet = new ethers.Wallet(GLOBAL_CONFIG.PRIVATE_KEY, provider);

        // Use Proxy Address if configured, otherwise EOA
        const checkAddr = GLOBAL_CONFIG.POLY_PROXY_ADDRESS || myWallet.address;

        const myBal = await getUsdcBalance(checkAddr);
        console.log(`[HEALTH] My Wallet (${checkAddr}) [${GLOBAL_CONFIG.POLY_PROXY_ADDRESS ? 'PROXY' : 'EOA'}]: $${myBal.toFixed(2)} USDC`);

        if (myBal < 5) {
            console.warn("[HEALTH] WARNING: Your balance is very low (< $5). Bot might fail to trade.");
        }
    } catch (e) {
        console.error("[HEALTH] Failed to check my wallet balance. Check PRIVATE_KEY.", e);
    }

    // Target Balance
    try {
        const targetBal = await getUsdcBalance(USER_CONFIG.traderAddress);
        console.log(`[HEALTH] Target Trader (${USER_CONFIG.traderAddress}): $${targetBal.toFixed(2)} USDC (Cash)`);
    } catch (e) {
        console.error("[HEALTH] Failed to check target balance.", e);
    }

    // 1. Initialize Components
    const strategyEngine = new StrategyEngine();
    const executor = new Executor();
    await executor.init();

    const onTrade = async (trade: RtdsTrade, config: StrategyConfig) => {
        try {
            console.log(`\n--- Processing Trade ${trade.transactionHash} ---`);
            // Evaluate
            const decision = await strategyEngine.evaluate(trade, config);

            if (decision.shouldExecute) {
                console.log(`[STRATEGY] GO: ${decision.reason} | Size: ${decision.sizeUsd}`);

                // Determine Outcome Index (0 or 1)
                // Trade payload has 'asset' (token ID). We need to match it to Market Data tokens to find Outcome Index.
                // Or we heavily rely on Market Data fetching.

                let outcomeIndex = 0; // Default
                // If we have market data, try to find which token 
                if (decision.marketData) {
                    const idx = decision.marketData.tokens.findIndex(t => t.token_id === trade.asset);
                    if (idx >= 0) outcomeIndex = idx;
                }

                // Execute
                await executor.execute(
                    decision,
                    config,
                    trade.side,
                    outcomeIndex,
                    trade.price
                );
            } else {
                console.log(`[STRATEGY] SKIP: ${decision.reason}`);
            }
        } catch (e) {
            console.error("Error in trade processing flow:", e);
        }
    };

    // 4. Poller
    // Note: User tracking via WebSocket is unreliable. We use API Polling via TradePoller.
    const pollHandler = async (trade: RtdsTrade, config: StrategyConfig) => {
        await onTrade(trade, config);
    };

    const poller = new TradePoller(pollHandler);
    poller.start();

    console.log("Bot running. Polling for signals...");
}

main().catch(e => console.error("Fatal Error:", e));
