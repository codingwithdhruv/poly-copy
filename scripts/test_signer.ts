import { ethers, Wallet } from 'ethers';

async function main() {
    console.log("Ethers Version:", ethers.version);

    const pk = "0x0123456789012345678901234567890123456789012345678901234567890123";
    const wallet = new ethers.Wallet(pk);

    console.log("Wallet created.");
    console.log("Is Wallet instance?", wallet instanceof Wallet);
    console.log("Is ethers.Wallet instance?", wallet instanceof ethers.Wallet);

    console.log("Checking _signTypedData...");
    if (typeof (wallet as any)._signTypedData === 'function') {
        console.log("SUCCESS: _signTypedData exists!");
    } else {
        console.error("FAILURE: _signTypedData is MISSING!");
        console.log("Keys on wallet:", Object.keys(wallet));
        console.log("Prototype keys:", Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)));
    }
}

main().catch(console.error);
