// start.js
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, workerData, parentPort } = require('worker_threads');

if (isMainThread) {
  const WORKERS = 12; // adjust based on your CPU
  const BIP39_FILE = path.join(__dirname, 'bip39.txt');
  const HITS_FILE = path.join(__dirname, 'hits.txt');

  if (!fs.existsSync(BIP39_FILE)) {
    console.error('bip39.txt not found. Create bip39.txt with one word per line.');
    process.exit(1);
  }

  const words = fs.readFileSync(BIP39_FILE, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .map(w => w.trim())
    .filter(Boolean);

  if (words.length < 12) {
    console.error('bip39.txt must contain at least 12 words.');
    process.exit(1);
  }

  const outStream = fs.createWriteStream(HITS_FILE, { flags: 'a' });

  let totalGenerated = 0;
  let totalHits = 0;

  console.log(`Starting ${WORKERS} workers`);

  for (let i = 0; i < WORKERS; i++) {
    const worker = new Worker(__filename, { workerData: { words } });

    worker.on('message', msg => {
      if (msg.type === 'hits') {
        totalHits += msg.hits.length;
        outStream.write(msg.hits.join('\n') + '\n');
      } else if (msg.type === 'generated') {
        totalGenerated += msg.count;
      } else if (msg.type === 'log') {
        console.error(msg.msg);
      }
    });

    worker.on('error', err => console.error('Worker error:', err));
    worker.on('exit', code => {
      if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
    });
  }

  // live console update every 200ms
  setInterval(() => {
    process.stdout.write(`\rMnemonic - Tries: ${totalGenerated} Hits: ${totalHits}`);
  }, 200);

} else {
  // Worker thread
  const bip39 = require('bip39');
  const ed25519 = require('ed25519-hd-key');
  const nacl = require('tweetnacl');
  const bs58 = require('bs58');

  const W = workerData.words;

  function randInt(max) { return Math.floor(Math.random() * max); }

  function makeMnemonicFromSeedWords(wordList) {
    const picked = new Array(12).fill(0).map(() => wordList[randInt(wordList.length)]);
    return picked.join(' ');
  }

  const BATCH_SIZE = 1000; // send 1000 hits per message
  let batch = [];
  let generatedCount = 0;

  while (true) {
    try {
      // generate mnemonic
      const indices = Array.from({ length: 12 }, () => randInt(W.length));
      const mnemonic = indices.map(i => W[i]).join(' ');
      if (!bip39.validateMnemonic(mnemonic)) continue;

      // derive Solana ed25519 key
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
      const seed32 = Buffer.from(derived.key).slice(0, 32);
      const keypair = nacl.sign.keyPair.fromSeed(seed32);

      const pubKey = bs58.encode(new Uint8Array(keypair.publicKey));
      const secretKey = bs58.encode(new Uint8Array(keypair.secretKey));

      batch.push(`${pubKey},${secretKey}`);
      generatedCount++;

      if (batch.length >= BATCH_SIZE) {
        parentPort.postMessage({ type: 'hits', hits: batch });
        parentPort.postMessage({ type: 'generated', count: generatedCount });
        batch = [];
        generatedCount = 0;
      }

    } catch (e) {
      parentPort.postMessage({ type: 'log', msg: `Worker error: ${e.message}` });
    }
  }

  // never reached but for completeness
  if (batch.length) parentPort.postMessage({ type: 'hits', hits: batch });
}
