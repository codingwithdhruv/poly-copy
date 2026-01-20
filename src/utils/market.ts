import axios from 'axios';

const GAMMA_API = 'https://gamma-api.polymarket.com';

export interface MarketData {
    id: string;
    question: string;
    conditionId: string;
    slug: string;
    endDate: string; // ISO string
    rewards?: {
        min_size?: number;
        max_spread?: number;
    };
    tokens: {
        token_id: string;
        outcome: string;
        price: number;
    }[];
    marketMakerAddress?: string;
    questionID: string;
}

export async function fetchMarketData(conditionId: string): Promise<MarketData | null> {
    try {
        // Query by condition_id
        const url = `${GAMMA_API}/markets?condition_id=${conditionId}`;
        const resp = await axios.get(url);

        if (resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
            return resp.data[0] as MarketData;
        }
        return null;
    } catch (e) {
        console.error(`Error fetching market data for ${conditionId}:`, e);
        return null;
    }
}
