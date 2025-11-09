// start.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  const WORKERS = 6; // default
  const seedFile = path.join(__dirname, 'bip39.txt');
  if (!fs.existsSync(seedFile)) {
    console.error('bip39.txt not found. Create seed.txt with one word per line.');
    process.exit(1);
  }

  const words = fs.readFileSync(seedFile, 'utf8').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
  if (words.length < 12) {
    console.error('seed.txt must contain at least 12 words.');
    process.exit(1);
  }

  // stream for appending hits quickly
  const outStream = fs.createWriteStream(path.join(__dirname, 'hits.txt'), { flags: 'a' });

  let totalGenerated = 0;
  console.log(`Starting ${WORKERS} workers`);

  for (let i = 0; i < WORKERS; i++) {
    const worker = new Worker(__filename, { workerData: { words } });
    worker.on('message', msg => {
      if (msg.type === 'hit') {
        // append line: <address>,<privkey>\n
        outStream.write(`${msg.address},${msg.privkey}\n`);
      } else if (msg.type === 'generated') {
        totalGenerated += 1;
        // live counts: prints "<address> address generated" per your spec - we'll show count
        process.stdout.write(`\r${totalGenerated} address generated`);
      } else if (msg.type === 'log') {
        console.log(msg.msg);
      }
    });
    worker.on('error', err => console.error('Worker error:', err));
    worker.on('exit', code => {
      if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
    });
  }

  // Periodic newline every 10s to keep console readable
  setInterval(() => process.stdout.write('\n'), 10000);
} else {
  // Worker thread - generate mnemonics in tight loop
  const bip39 = require('bip39');
  const ed25519 = require('ed25519-hd-key');
  const nacl = require('tweetnacl');
  const bs58 = require('bs58');

  const W = workerData.words;
  function randInt(max) { return Math.floor(Math.random() * max); }

  function makeMnemonicFromSeedWords(wordList) {
    // pick 12 words at random (allow repeats)
    const picked = new Array(12).fill(0).map(() => wordList[randInt(wordList.length)]);
    return picked.join(' ');
  }

  while (true) {
    try {
      const mnemonic = makeMnemonicFromSeedWords(W);
      if (!bip39.validateMnemonic(mnemonic)) {
        // invalid, skip
        parentPort.postMessage({ type: 'generated' }); // still count generated attempts if you want
        continue;
      }

      // derive ed25519 key for Solana: path m/44'/501'/0'/0' (standard Phantom)
      const seed = bip39.mnemonicToSeedSync(mnemonic); // 64 bytes
      const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
      const seed32 = Buffer.from(derived.key).slice(0, 32); // should be 32 bytes
      const keypair = nacl.sign.keyPair.fromSeed(seed32);
      const pubKey = bs58.encode(Buffer.from(keypair.publicKey));
      const secretKey = Buffer.from(keypair.secretKey); // 64 bytes
      const privKeyBase58 = bs58.encode(secretKey);

      // send hit (address, priv)
      parentPort.postMessage({ type: 'hit', address: pubKey, privkey: privKeyBase58 });
      parentPort.postMessage({ type: 'generated' });
    } catch (e) {
      parentPort.postMessage({ type: 'log', msg: `worker error: ${e.message}` });
    }
  }
}
