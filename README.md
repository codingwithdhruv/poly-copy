# Poly-Copy Trading Bot

A high-frequency copy trading bot for Polymarket, built in TypeScript. 
Designed for execution on VPS instances, allowing you to follow specific high-conviction traders with customizable risk/sizing logic.

## Features

-   **High-Fidelity Copying**: Tracks trader moves via WebSocket (RTDS) for minimal latency.
-   **Smart Filters**: 
    -   Ignores noise (trades < 3 cents or small allocations).
    -   Tracks target trader's portfolio allocation % to determine conviction.
-   **Configurable Sizing**: Scales your bet size based on the target's conviction (e.g. if they bet 10% of their stack, you bet 2%).
-   **Risk Guardrails**: Hard caps on single-trade size, market exposure, and total wallet exposure.
-   **Single-Config**: All settings are tweakable in one file (`src/config/settings.ts`).

## Installation

1.  **Clone the repository**:
    ```bash
    git clone <repo-url>
    cd poly-copy
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Setup Environment**:
    Create a `.env` file in the root directory:
    ```ini
    PRIVATE_KEY=YOUR_POLYGON_PRIVATE_KEY
    POLYGON_RPC_URL=https://polygon-rpc.com
    
    # Target Trader to Copy (Address)
    TRADER_ADDRESS_TARGET=0x...
    ```

## Configuration

All strategy logic is located in `src/config/settings.ts`. You can edit this file directly to tweak behavior.

### Critical Settings
-   `traderAddress`: The address you want to copy (loaded from .env by default).
-   `conditions.minTraderPortfolioAlloc`: The minimum % of *their* portfolio they must deploy for you to copy. (Default 0.10 = 10%).
-   `sizing.rules`: Define how much to bet.
    ```typescript
    {
        minTraderAlloc: 0.10, // If they bet 10%...
        maxTraderAlloc: 0.20,
        copySizeRatio: 0.015  // You bet 1.5% of YOUR wallet
    }
    ```
-   `risk`: Hard limits to prevent blowing up your account.

## Usage

### Development / Local Run
```bash
npm run dev
```

### Production (VPS)
1.  Build the project:
    ```bash
    npm run build
    ```
2.  Start the bot:
    ```bash
    npm start
    ```

## How It Works

1.  **Monitor**: Connects to Polymarket's RTDS WebSocket and listens for trades from the `TRADER_ADDRESS_TARGET`.
2.  **Evaluating Conviction**:
    -   Fetches the target's estimated portfolio value.
    -   Calculates the trade's size relative to their portfolio.
    -   If strict criteria (allocation %, dominance) are met, proceeds.
3.  **Execution**:
    -   Calculates *your* trade size based on `settings.ts` rules.
    -   Checks your wallet balance (USDC.e on Polygon).
    -   Places a **Limit Order** via the CLOB API.

## Troubleshooting

-   **"Shares too low"**: The calculated trade size was too small for Polymarket's minimums. Increase your wallet balance or sizing ratio.
-   **"Alloc < Min"**: The target trader made a trade, but it was too small relative to their portfolio (considered "noise").
-   **"Error fetching wallet balance"**: Check your RPC URL in `.env`.

## Disclaimer
Trading involves risk. This software is provided as-is. Use at your own risk.
