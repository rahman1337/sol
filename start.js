// start.js
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread } = require('worker_threads');

if (isMainThread) {
  const WORKERS = 6; // use 6 workers as requested
  const HITS_FILE = path.join(__dirname, 'hits.txt');
  const BATCH_WRITE_FLUSH_MS = 200; // flush interval for safety (main thread)

  // open single append stream
  const outStream = fs.createWriteStream(HITS_FILE, { flags: 'a' });

  let totalTries = 0;
  let totalHits = 0;

  console.log(`Starting ${WORKERS} workers`);

  // spawn workers
  for (let i = 0; i < WORKERS; i++) {
    const w = new Worker(__filename);
    w.on('message', (msg) => {
      // { type: 'batch', tries: <n>, hits: [ ...lines ] }
      if (msg && msg.type === 'batch') {
        if (msg.tries && Number.isFinite(msg.tries)) totalTries += msg.tries;
        if (Array.isArray(msg.hits) && msg.hits.length > 0) {
          totalHits += msg.hits.length;
          outStream.write(msg.hits.join('\n') + '\n');
        }
      } else if (msg && msg.type === 'log') {
        console.error('worker log:', msg.msg);
      }
    });
    w.on('error', (err) => console.error('Worker error:', err));
    w.on('exit', (code) => {
      if (code !== 0) console.error(`Worker exited with code ${code}`);
    });
  }

  // live console print
  const refreshMs = 200;
  setInterval(() => {
    process.stdout.write(`\rMnemonic - Tries: ${totalTries} Hits ${totalHits}`);
  }, refreshMs);

  // keep stream flushed periodically (just in case)
  setInterval(() => outStream.emit('flush'), BATCH_WRITE_FLUSH_MS);

} else {
  // worker code
  const bip39 = require('bip39');
  const ed25519 = require('ed25519-hd-key');
  const nacl = require('tweetnacl');
  const bs58 = require('bs58');

  const BATCH_SIZE = 2000; // number of hits to accumulate before sending to main thread (tune for your machine)
  const TRY_SEND_INTERVAL = 1000; // fallback: send at least every TRY_SEND_INTERVAL ms
  let batch = [];
  let triesSinceLastSend = 0;
  let lastSendTs = Date.now();

  // helper to post batch to main thread
  function flushBatch() {
    if (batch.length === 0 && triesSinceLastSend === 0) return;
    const payload = {
      type: 'batch',
      tries: triesSinceLastSend,
      hits: batch.splice(0, batch.length),
    };
    triesSinceLastSend = 0;
    lastSendTs = Date.now();
    try {
      parentPort.postMessage(payload);
    } catch (e) {
      // if posting fails, re-queue tries count (best-effort)
      // try later
      triesSinceLastSend += (payload.tries || 0);
      batch = payload.hits.concat(batch);
    }
  }

  // tight generation loop; uses setImmediate to yield occasionally
  function generateLoop() {
    try {
      // generate in tight chunks to avoid too many yields
      for (let i = 0; i < 1000; i++) {
        // generateMnemonic(128) => 12 words from 128 bits (guaranteed valid)
        const mnemonic = bip39.generateMnemonic(128);
        triesSinceLastSend++;

        // derive seed and keypair
        const seed = bip39.mnemonicToSeedSync(mnemonic); // sync is fastest here
        const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
        const seed32 = Buffer.from(derived.key).slice(0, 32);
        const keypair = nacl.sign.keyPair.fromSeed(seed32);

        const pubKey = bs58.encode(new Uint8Array(keypair.publicKey));
        const secretKey = bs58.encode(new Uint8Array(keypair.secretKey));

        // collect hit line
        batch.push(`${pubKey},${secretKey}`);

        // flush if batch big enough
        if (batch.length >= BATCH_SIZE) {
          flushBatch();
        }
      }
    } catch (e) {
      // report error to main thread, but keep running
      try { parentPort.postMessage({ type: 'log', msg: e.message }); } catch {}
    }

    // time-based flush (if enough time passed without hitting BATCH_SIZE)
    if ((Date.now() - lastSendTs) > TRY_SEND_INTERVAL) {
      flushBatch();
    }

    // yield to event loop then continue
    setImmediate(generateLoop);
  }

  // start generating
  generateLoop();
}
