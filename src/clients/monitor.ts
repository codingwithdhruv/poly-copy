import WebSocket from 'ws';
import { StrategyConfig } from '../config/types';
import { Config } from '../config';

const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

export interface RtdsTrade { // Mapped to our internal format
    user?: string; // Derived from maker_address or taker_address
    asset: string;
    side: 'BUY' | 'SELL';
    size: number;
    price: number;
    transactionHash: string;
    conditionId: string; // Might need to fetch or key off asset
}

export type TradeHandler = (trade: RtdsTrade, config: StrategyConfig) => void;

export class TradeMonitor {
    private ws: WebSocket | null = null;
    private isRunning = false;
    private strategies: StrategyConfig[];
    private onTradeDetected: TradeHandler;

    constructor(onTradeDetected: TradeHandler) {
        this.strategies = Config.getActiveStrategies();
        this.onTradeDetected = onTradeDetected;
    }

    public start() {
        if (this.strategies.length === 0) {
            console.warn("No strategies configured. Monitor will not start.");
            return;
        }
        this.isRunning = true;
        this.connect();
    }

    private connect() {
        console.log(`Connecting to CLOB WebSocket: ${CLOB_WS_URL}`);
        this.ws = new WebSocket(CLOB_WS_URL);

        this.ws.on('open', () => {
            console.log("Connected to CLOB WS.");
            this.subscribe();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', () => {
            console.warn("CLOB WS Connection closed.");
            if (this.isRunning) {
                setTimeout(() => this.connect(), 5000);
            }
        });

        this.ws.on('error', (err) => {
            console.error("CLOB WS Error:", err);
        });
    }

    private subscribe() {
        if (!this.ws) return;

        // Polylmarket CLOB WS usually expects subscription to specific assets (Token IDs).
        // Since we want to copy a trader EVERYWHERE, scanning ALL markets via WS is very expensive/noisy.
        // NOTE: The user requested correcting the URL.
        // If the user wants to scan ALL markets, we would theoretically need to subscribe to all.
        // However, we might rely on the fact that if we don't send a filter, maybe we get nothing?
        // Or maybe there is a 'trades' channel for everything?
        // Documentation is sparse on "Global Trade Feed". 
        // We will try sending a generic subscribe for 'trades' if possible, or warn.

        // For this implementation, we will try to subscribe to a wildcard or minimal set if possible.
        // BUT, given the complexity, we will implement this as a basic connection 
        // and add a TODO log that effective global monitoring might require API Polling 
        // or knowing the markets ahead of time.

        // Attempting to subscribe to recent markets or a known active one just to keep connection alive
        // and demonstrate the handshake.

        const msg = {
            type: "subscribe",
            assets: [], // Empty often means 'all' or 'none' depending on API. 
            // If 'all' is not supported, this might fail or be silent.
            channels: ["trades"]
        };

        // console.log("Sending Subscription:", JSON.stringify(msg));
        this.ws.send(JSON.stringify(msg));

        // Fallback/Warning
        console.warn("[MONITOR] Note: CLOB WS requires Asset IDs for guaranteed delivery. Global firehose might be restricted.");
        console.warn("[MONITOR] Suggestion: Use 'src/utils/poller.ts' (API Polling) for reliable tracking of specific User Addresses across ALL markets.");
    }

    private handleMessage(data: WebSocket.Data) {
        try {
            const strr = data.toString();
            if (!strr || strr.trim().length === 0) return;

            const msg = JSON.parse(strr);

            // CLOB 'trades' message structure check
            // usually: { event_type: "trade", ... } or array
            if (Array.isArray(msg)) {
                for (const m of msg) {
                    if (m.event_type === 'trade' || m.type === 'trade') {
                        this.processClobTrade(m);
                    }
                }
            } else if (msg.event_type === 'trade' || msg.type === 'trade') {
                this.processClobTrade(msg);
            }

        } catch (e) {
            console.error(`Error parsing WS message:`, e);
        }
    }

    private processClobTrade(raw: any) {
        // Map CLOB message to RtdsTrade
        // Fields: maker_address, taker_address, side, size, price, asset_id

        const maker = raw.maker_address?.toLowerCase();
        const taker = raw.taker_address?.toLowerCase();

        for (const strat of this.strategies) {
            const target = strat.traderAddress.toLowerCase();

            let matchedSide: 'BUY' | 'SELL' | null = null;

            // Logic: 
            // If Target is Maker and Side is BUY -> They placed a Buy Limit that got filled.
            // If Target is Taker and Side is BUY -> They Market Bought.

            if (maker === target) {
                // Maker matching
                matchedSide = raw.side === 'BUY' ? 'BUY' : 'SELL';
            } else if (taker === target) {
                // Taker matching
                matchedSide = raw.side === 'BUY' ? 'BUY' : 'SELL';
            }

            if (matchedSide) {
                console.log(`[MATCH] Detected CLOB trade for ${target} on asset ${raw.asset_id}`);

                const trade: RtdsTrade = {
                    user: target,
                    asset: raw.asset_id,
                    side: matchedSide,
                    size: Number(raw.size),
                    price: Number(raw.price),
                    transactionHash: raw.match_id || '',
                    conditionId: '' // Need to resolve or use asset_id
                };

                this.onTradeDetected(trade, strat);
            }
        }
    }
}
