// start.js
// Generates random 12-word combinations from bip39.txt, validates mnemonic.
// If valid, derives Solana address (m/44'/501'/0'/0') and writes <address>,<base58> to hits.txt.
// Runs 6 workers and prints live counts.

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WORKERS = 6;
const WORDLIST_FILE = path.join(__dirname, 'bip39.txt');
const OUT_FILE = path.join(__dirname, 'hits.txt');

if (isMainThread) {
  if (!fs.existsSync(WORDLIST_FILE)) {
    console.error('Missing bip39.txt in this folder.');
    process.exit(1);
  }

  const wordlist = fs.readFileSync(WORDLIST_FILE, 'utf8')
    .split(/\r?\n/)
    .map(w => w.trim())
    .filter(Boolean);

  console.log(`Starting Solana mnemonic generator — ${WORKERS} workers`);
  console.log(`Wordlist size: ${wordlist.length}`);
  console.log(`Writing valid hits to ${OUT_FILE}\n`);

  const out = fs.createWriteStream(OUT_FILE, { flags: 'a' });
  let totalTries = 0;
  let totalHits = 0;
  const start = Date.now();

  for (let i = 0; i < WORKERS; i++) {
    const w = new Worker(__filename, { workerData: { id: i, wordlist } });
    w.on('message', msg => {
      if (msg.type === 'tried') totalTries += msg.count;
      else if (msg.type === 'hit') {
        out.write(`${msg.address},${msg.secretBase58}\n`);
        totalHits++;
      }
    });
    w.on('error', e => console.error(`Worker ${i} error:`, e));
  }

  setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const rate = Math.round(totalTries / elapsed);
    process.stdout.write(`\rTries: ${totalTries.toLocaleString()} | Hits: ${totalHits.toLocaleString()} | ${rate}/s     `);
  }, 1000);

} else {
  const { id, wordlist } = workerData;
  const bip39 = require('bip39');
  const ed25519 = require('ed25519-hd-key');
  const nacl = require('tweetnacl');
  const bs58 = require('bs58');
  const { PublicKey } = require('@solana/web3.js');

  const WORD_COUNT = wordlist.length;

  function randomMnemonic() {
    const words = [];
    for (let i = 0; i < 12; i++) {
      const idx = crypto.randomInt(0, WORD_COUNT);
      words.push(wordlist[idx]);
    }
    return words.join(' ');
  }

  function deriveSolana(mnemonic) {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = "m/44'/501'/0'/0'";
    const derived = ed25519.derivePath(path, seed.toString('hex'));
    const kp = nacl.sign.keyPair.fromSeed(derived.key);
    const address = new PublicKey(kp.publicKey).toBase58();
    const secretBase58 = bs58.encode(Buffer.from(kp.secretKey));
    return { address, secretBase58 };
  }

  (async () => {
    let tries = 0;
    while (true) {
      const mnemonic = randomMnemonic();
      if (!bip39.validateMnemonic(mnemonic, wordlist)) {
        tries++;
        if (tries % 500 === 0) parentPort.postMessage({ type: 'tried', count: 500 });
        continue;
      }

      const { address, secretBase58 } = deriveSolana(mnemonic);
      tries++;
      if (tries % 500 === 0) parentPort.postMessage({ type: 'tried', count: 500 });
      parentPort.postMessage({ type: 'hit', address, secretBase58 });
    }
  })();
}
