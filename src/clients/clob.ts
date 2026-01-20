import { ClobClient } from '@polymarket/clob-client';
import { ethers, Wallet } from 'ethers';
import { GLOBAL_CONFIG } from '../config';

// Define locally to avoid import issues
export interface ApiCredentials {
    key: string;
    secret: string;
    passphrase: string;
}

// Wrapper to initialize the CLOB Client
export async function createClobClient(
    signerOrWallet: Wallet | ethers.Signer,
    creds?: ApiCredentials,
    funderAddress?: string
): Promise<ClobClient> {
    const chainId = 137; // Polygon Mainnet
    const host = "https://clob.polymarket.com";

    // Determine Signature Type
    // If a PROXY/Funder address is provided, we assume it's a Gnosis Safe (2) or PolyProxy (1).
    // The user specifically mentioned "Signature Type 2 (GNOSIS_SAFE)".
    const signatureType = funderAddress ? 2 : 0;

    console.log(`Initializing CLOB Client for host: ${host}`);
    console.log(`Auth Mode: ${signatureType === 2 ? 'PROXY (Gnosis Safe)' : 'EOA (Direct)'}`);
    if (funderAddress) console.log(`Funder: ${funderAddress}`);

    // Initial client without credentials to derive them
    const client = new ClobClient(
        host,
        chainId,
        signerOrWallet as any, // ClobClient expecting v5 Signer
        creds as any, // Cast to any 
        signatureType,
        funderAddress // Pass funder explicitly
    );

    return client;
}
