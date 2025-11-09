const fs = require("fs");
const bs58 = require("bs58");
const bip39 = require("bip39");
const { Keypair } = require("@solana/web3.js");
const { derivePath } = require("ed25519-hd-key");

const words = fs.readFileSync("bip39.txt", "utf8")
    .replace(/\r/g, "")
    .toLowerCase()
    .split("\n");

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

async function loop() {
    try {
        const mnemonic = gen12(words);
        const keypair = solanaFromMnemonic(mnemonic);
        if (!keypair) return setImmediate(loop);

        const address = keypair.publicKey.toBase58();
        const privKey = bs58.encode(keypair.secretKey);
        fs.appendFileSync("hits.txt", `${address},${privKey}\n`);
        process.stdout.write("+");
    } catch (e) {}
    process.stdout.write("-");
    setImmediate(loop);
}

loop();
