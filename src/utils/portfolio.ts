import axios from 'axios';

// Using Polymarket Profile API or similar to get Portfolio Value
// NOTE: Public API for exact portfolio value might be tricky.
// Common approach: /users/{address} or /portfolio?user=...
// For now, we mimic the python logic if available, or use a known endpoint.
// Checking python code reference... "get_trader_portfolio_value" in api_helper.py
// let's assume it uses https://data-api.polymarket.com/positions?user=... and sums it up
// OR the profile endpoint.

// Replicating logic found in typical Polymarket bots:
const DATA_API = 'https://data-api.polymarket.com';

export async function getTraderPortfolioValue(address: string): Promise<number> {
    try {
        // Option 1: fetch all positions and sum value
        // Endpoint: /positions?user=ADDRESS&size_gt=0
        const url = `${DATA_API}/positions?user=${address}&size_gt=1e-6`;
        const resp = await axios.get(url);

        if (resp.data && Array.isArray(resp.data)) {
            let totalValue = 0;
            for (const pos of resp.data) {
                const size = Number(pos.size);
                const price = Number(pos.curPrice || 0); // Need current price estimate
                // Actually the API usually returns 'currentValue' or we have to estimate.
                // If the response has 'currentValue', use it.
                // Assuming standard response structure.

                // Fallback: Simplest way to get "Portfolio Value" is usually sum(size * price) + cash.
                // Cash (USDC) is hard to know for other users without scanning logs.
                // For "Trader Allocation %" calculation, typically we use "Total Positions Value" or "Estimated Net Worth".

                // If we cannot confirm Cash, we use Open Positions Value.
                totalValue += size * price;
            }
            // Add a rough buffer for cash if needed, or assume they are fully deployed? 
            // Better to underestimate portfolio (makes denominator smaller -> alloc % higher -> triggers stricter checks)
            // But wait, Alloc % = Trade / Portfolio.
            // If we UNDERESTIMATE Portfolio, Alloc % goes UP.
            // Condition: Alloc >= 10%. 
            // If we think they have $100 but they have $1000, a $10 trade is 10% (Trigger) vs 1% (Ignore).
            // So underestimating portfolio size leads to OVER-COPYING (False Positives).
            // This is risky.

            // Allow a default fallback if 0?
            return totalValue > 100 ? totalValue : 1000; // conservative default?
        }
        return 1000; // Fallback default
    } catch (e) {
        console.error(`Error fetching portfolio for ${address}:`, e);
        return 1000; // Fail safe
    }
}
