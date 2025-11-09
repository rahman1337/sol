const cluster = require("cluster");
const os = require("os");
const fs = require("fs");
const bs58 = require("bs58");
const bip39 = require("bip39");
const { Keypair } = require("@solana/web3.js");
const { derivePath } = require("ed25519-hd-key");
const logUpdate = require("log-update");
const colors = require("colors");

const numWorkers = 6; // 6 workers
const words = fs.readFileSync("bip39.txt", "utf8")
    .replace(/\r/g, "")
    .toLowerCase()
    .split("\n");

let totalTries = 0;
let totalHits = 0;

function gen12(words) {
    const shuffled = words.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 12).join(" ");
}

function solanaFromMnemonic(mnemonic) {
    if (!bip39.validateMnemonic(mnemonic)) return null;
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = "m/44'/501'/0'/0'";
    const derivedSeed = derivePath(path, seed.toString("hex")).key;
    return Keypair.fromSeed(derivedSeed);
}

if (cluster.isMaster) {
    console.log(colors.green(`Starting ${numWorkers} Solana workers...`));

    // Fork workers
    for (let i = 0; i < numWorkers; i++) {
        const worker = cluster.fork();
        worker.on("message", msg => {
            if (msg.type === "hit") totalHits++;
            if (msg.type === "try") totalTries++;
        });
    }

    // Real-time display
    const frames = ["-", "\\", "|", "/"];
    let index = 0;
    setInterval(() => {
        const frame = frames[index = ++index % frames.length];
        logUpdate(`${frame} tries: ${totalTries}; hits: ${totalHits} ${frame}`);
    }, 50);

} else {
    // Worker process
    async function loop() {
        process.send({ type: "try" });
        try {
            const mnemonic = gen12(words);
            const keypair = solanaFromMnemonic(mnemonic);
            if (keypair) {
                const address = keypair.publicKey.toBase58();
                const privKey = bs58.encode(keypair.secretKey);
                fs.appendFileSync("hits.txt", `${address},${privKey}\n`);
                process.send({ type: "hit" });
            }
        } catch(e) {}
        setImmediate(loop);
    }
    loop();
}
