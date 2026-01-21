# Poly-Copy: Advanced Copy Trading Bot

A high-performance, institutional-grade copy trading bot for Polymarket. Designed to follow complex accumulation strategies of high-conviction whales while filtering out noise, hedging, and low-conviction flow.

## 🚀 Key Capabilities

### 1. Conviction Accumulation Engine
Unlike basic copy bots that copy every trade 1:1, Poly-Copy implements an **Aggregation Engine**.
- **Issue**: Smart whales build positions slowly (e.g., 50 small trades over 2 hours). A basic bot would trigger 50 times (over-trading) or miss the conviction (if using single trade limits).
- **Solution**: This bot tracks the target's **cumulative net exposure** per market in real-time.
- **Trigger**: It only executes when the trader's *aggregated* exposure crosses your defined threshold (e.g., >10% of their portfolio).

### 2. Smart Signal Filtering
- **Single-Side Dominance**: Ignores traders who are hedging or market making. Only copies when `dominance > 75%` (e.g., strictly buying YES).
- **Time Window Enforcement**: Tracks "Time First Seen" per market. If conviction isn't reached within `timeWindowMinutes`, the potential signal is discarded as "low conviction/stale".
- **Deduplication**: Robust protection against duplicate API events ensuring you never double-count the same trade.

### 3. Execution Control
- **Single-Shot Latch**: Options to restrict execution to exactly **one** entry per market, preventing "chasing" entries.
- **Proxy / Gnosis Safe Support**: Native support for executing trades via a Gnosis Safe proxy for enhanced security.
- **Dynamic Sizing**: Scale your entry size based on the target's conviction tier (e.g., "Tier 1 Conviction" -> 1.5% size, "God Mode Conviction" -> 5% size).

---

## 🛠️ Installation

```bash
# 1. Clone
git clone <repo-url>
cd poly-copy

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env with your keys and target trader address
```

## ⚙️ Configuration

The core strategy is controlled via `src/config/settings.ts`. This allows granular control over the logic.

### Critical Settings

| Setting | Description | Recommended |
|:---|:---|:---|
| `minTraderPortfolioAlloc` | Min % of *their* total equity they must commit to trigger a copy. | `0.05` (5%) |
| `singleSideDominanceThreshold` | Ratio of Buy/Sell to filter hedgers. | `0.75`+ |
| `timeWindowMinutes` | Max time allowed for them to build the position. | `60` |
| `allowMultipleExecutions` | `false` allows only one sniper entry per market. | `false` |

### Sizing Rules (Example)

```typescript
sizing: {
    mode: 'WALLET_SCALED',
    rules: [
        // If they bet 1% - 3%, we bet 1% of OUR wallet
        { minTraderAlloc: 0.01, maxTraderAlloc: 0.03, copySizeRatio: 0.01 },
        
        // If they bet > 3%, we bet 15% of OUR wallet (High Conviction)
        { minTraderAlloc: 0.03, maxTraderAlloc: Infinity, copySizeRatio: 0.15 }
    ]
}
```

## 🏗️ Architecture

- **Monitor (`src/clients/monitor.ts`)**: Listens to the global Polymarket/CLOB WebSocket. Filters for the target address via efficient deduplication.
- **Strategy Engine (`src/engine/strategy.ts`)**: 
    - Maintains an in-memory `MARKET_EXPOSURE` ledger.
    - Aggregates buys/sells.
    - Runs "Safety Checks" (Time Window, Dominance, Resolution Time).
    - Periodic garbage collection prevents memory leaks.
- **Executor (`src/engine/executor.ts`)**: 
    - Handles wallet management (EOA or Proxy).
    - Executes Limit Orders (FOK/IOC style).
    - Enforces hard risk limits (Max Allocation, Max Exposure).

## 🖥️ Running

### Development
```bash
npm run dev
```

### Production (VPS)
```bash
npm run build
npm start
```

## 🛡️ Risk Management
The bot includes hard-coded safety rails in `settings.ts`:
- `maxTotalOpenExposure`: Max % of wallet deployed across ALL markets.
- `maxSingleMarketExposure`: Max % of wallet in ONE market.
- `maxSingleTradeSize`: Max % of wallet in ONE trade.

---

*Disclaimer: This software is for educational purposes. Trading cryptocurrency and prediction markets involves significant risk.*
