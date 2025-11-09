const fs = require("fs");
const { Keypair } = require("@solana/web3.js");
const nacl = require("tweetnacl");
const bs58 = require("bs58");

var tries = 0, hits = 0;
const delay = time => new Promise(res => setTimeout(res, time));
var words = fs.readFileSync("bip39.txt", { encoding: 'utf8', flag: 'r' })
    .replace(/(\r)/gm, "")
    .toLowerCase()
    .split("\n");

// Generate a random 12-word mnemonic from word list
function gen12(words) {
    var n = 12;
    var shuffled = words.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n).join(" ");
}

// Derive Solana keypair from 12-word mnemonic
function solanaFromMnemonic(mnemonic) {
    const { derivePath } = require("ed25519-hd-key");
    const seed = require("bip39").mnemonicToSeedSync(mnemonic);
    const path = "m/44'/501'/0'/0'"; // Solana derivation path
    const derivedSeed = derivePath(path, seed.toString("hex")).key;
    const keypair = Keypair.fromSeed(derivedSeed);
    return keypair;
}

console.log("starting....");

async function doCheck() {
    tries++;
    try {
        const mnemonic = gen12(words);
        const keypair = solanaFromMnemonic(mnemonic);
        const address = keypair.publicKey.toBase58();
        const privKey = bs58.encode(keypair.secretKey);

        fs.appendFileSync('hits.txt', `${address},${privKey}\n`);
        hits++;
        process.stdout.write("+");
    } catch (e) {
        // silently ignore
    }

    await delay(0); // Prevent Call Stack Overflow
    process.stdout.write("-");
    doCheck();
}

doCheck();
