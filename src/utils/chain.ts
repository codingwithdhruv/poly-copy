import { ethers } from 'ethers';
import { GLOBAL_CONFIG } from '../config';

const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (PoS)
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

/**
 * Fetches the USDC.e balance for a given address on Polygon.
 * @param address Wallet address
 * @returns Balance in USDC (number)
 */
export async function getUsdcBalance(address: string): Promise<number> {
    if (!address || !ethers.utils.isAddress(address)) {
        console.warn(`[CHAIN] Invalid address provided for balance check: ${address}`);
        return 0;
    }

    try {
        const provider = new ethers.providers.JsonRpcProvider(GLOBAL_CONFIG.RPC_URL);
        const contract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

        const rawBalance = await contract.balanceOf(address);
        const decimals = await contract.decimals();
        const balance = Number(ethers.utils.formatUnits(rawBalance, decimals));

        return balance;
    } catch (e) {
        console.error(`[CHAIN] Error fetching USDC balance for ${address}:`, e);
        return 0; // Safe default
    }
}
