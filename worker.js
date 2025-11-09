const fs = require('fs');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const delay = ms => new Promise(res => setTimeout(res, ms));

// Load wordlist once
const words = fs.readFileSync('bip39.txt', 'utf8')
    .replace(/\r/g, '')
    .trim()
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

// Generate 12-word mnemonic by shuffling wordlist
function gen12(words) {
    const shuffled = words.slice().sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 12).join(' ');
}

async function doCheck() {
    try {
        const mnemonic = gen12(words);

        // Attempt derivation
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
        const keypair = Keypair.fromSeed(derived.key);

        // success → append hits.txt
        const address = keypair.publicKey.toBase58();
        const secretBase58 = bs58.encode(Buffer.from(keypair.secretKey));
        fs.appendFileSync('hits.txt', `${address},${secretBase58}\n`);

        // Notify parent via IPC
        if (process.send) process.send({ type: 'hit' });

    } catch (e) {
        // derivation failed → count as try
        if (process.send) process.send({ type: 'try' });
    }

    await delay(0); // prevent call stack overflow
    setImmediate(doCheck);
}

doCheck();
