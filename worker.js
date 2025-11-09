// worker.js  (Solana; replace original worker.js with this)
const fs = require('fs');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const delay = time => new Promise(res => setTimeout(res, time));

// load wordlist once
const words = fs.readFileSync('bip39.txt', 'utf8')
  .replace(/\r/g, '')
  .trim()
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean);

// generate 12-word sequence by shuffling the wordlist (non-destructive)
function gen12(words) {
  const shuffled = words.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 12).join(' ');
}

async function doCheck() {
  try {
    const mnemonic = gen12(words);

    // Attempt derivation (mimic ethers behavior: invalid mnemonics don't derive)
    // We purposely don't pre-validate with bip39.validateMnemonic to mirror your "try to derive" style.
    // However derivePath + Keypair.fromSeed will be reached only if mnemonic->seed is produced.
    const seed = await bip39.mnemonicToSeed(mnemonic); // might succeed for any 12 words
    const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex')); // { key: Buffer, chainCode: Buffer }
    // Keypair.fromSeed expects a 32-byte seed; if derived.key isn't valid it will throw.
    const keypair = Keypair.fromSeed(derived.key);

    // success: append hit and print "+"
    try {
      const address = keypair.publicKey.toBase58();
      const secretBase58 = bs58.encode(Buffer.from(keypair.secretKey)); // 64 bytes -> base58
      fs.appendFileSync('hits.txt', `${address},${secretBase58}\n`);
    } catch (e) {
      // failed to append to file — keep behavior but still treat as success (so stdout "+")
      // don't print extra text to stdout
    }

    process.stdout.write('+'); // hit appended (or derivation succeeded)
  } catch (e) {
    // derivation failed (or any other error) -> do nothing visible for hit
    // This mirrors your original worker which swallowed errors.
  }

  await delay(0); // Prevent call stack overflow
  process.stdout.write('-'); // loop tick (same pattern as your original)
  // schedule next iteration
  setImmediate(doCheck);
}

// start loop
doCheck();
