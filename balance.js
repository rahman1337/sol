const fs = require("fs");
const { Connection, PublicKey, clusterApiUrl } = require("@solana/web3.js");
const bs58 = require("bs58");

const RPC = "https://solana-rpc.publicnode.com"; // or use clusterApiUrl('mainnet-beta')
const connection = new Connection(RPC);

const hits = fs.readFileSync("hits.txt", "utf8").split("\n").filter(Boolean);

async function checkBalance(address, privKey) {
    try {
        const pubkey = new PublicKey(address);
        const balanceLamports = await connection.getBalance(pubkey);
        const balanceSOL = balanceLamports / 1e9;

        if (balanceSOL === 0) {
            console.log(`${address} 0`);
        } else {
            console.log(`${address} ${balanceSOL}`);
            console.log(`Key : ${privKey}`);
        }
    } catch (e) {
        console.log(`[ERROR] ${address}`);
    }
}

(async () => {
    for (const line of hits) {
        const [address, privKey] = line.split(",");
        await checkBalance(address, privKey);
    }
})();
