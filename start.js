// worker-solana.js
const fs = require('fs');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const delay = time => new Promise(res => setTimeout(res, time));

async function genPhantomKeypair() {
  // 12 words, 128 bits (Phantom-style)
  const mnemonic = bip39.generateMnemonic(128);
  const path = "m/44'/501'/0'/0'";
  const seed = await bip39.mnemonicToSeed(mnemonic); // Buffer
  const derived = derivePath(path, seed.toString('hex')); // { key: Buffer, chainCode: Buffer }
  const keypair = Keypair.fromSeed(derived.key);
  return { mnemonic, keypair };
}

async function doLoop() {
  try {
    const { mnemonic, keypair } = await genPhantomKeypair();
    const address = keypair.publicKey.toBase58();
    const secretKeyBuf = Buffer.from(keypair.secretKey); // 64 bytes
    const secretBase58 = bs58.encode(secretKeyBuf);

    // Append as: <address>,<base58>\n
    try {
      fs.appendFileSync('hits.txt', `${address},${secretBase58}\n`);
      process.stdout.write("+"); // hit appended
    } catch (e) {
      process.stderr.write(`[APPEND ERROR] ${e.message}\n`);
    }
  } catch (e) {
    process.stderr.write(`[DERIVE ERROR] ${e.message}\n`);
  }

  await delay(0);
  process.stdout.write("-");
  setImmediate(doLoop);
}

doLoop().catch(err => {
  process.stderr.write(`[FATAL] ${err.message}\n`);
  process.exit(1);
});
