// start.js
const fs = require("fs");
const path = require("path");
const { Worker, isMainThread, parentPort } = require("worker_threads");

if (isMainThread) {
  const WORKERS = 6;
  const HITS_FILE = path.join(__dirname, "hits.txt");
  const outStream = fs.createWriteStream(HITS_FILE, { flags: "a" });

  let totalTries = 0;
  let totalHits = 0;

  console.log(`Starting ${WORKERS} workers...`);

  for (let i = 0; i < WORKERS; i++) {
    const worker = new Worker(__filename);

    worker.on("message", (msg) => {
      if (msg.type === "batch") {
        totalTries += msg.tries;
        totalHits += msg.hits.length;
        if (msg.hits.length > 0)
          outStream.write(msg.hits.join("\n") + "\n");
      }
    });

    worker.on("error", (err) => console.error("Worker error:", err));
    worker.on("exit", (code) => {
      if (code !== 0)
        console.error(`Worker exited with code ${code}`);
    });
  }

  // live console update
  setInterval(() => {
    process.stdout.write(`\rMnemonic - Tries: ${totalTries} Hits: ${totalHits}`);
  }, 200);

} else {
  // Worker code
  const bip39 = require("bip39");
  const ed25519 = require("ed25519-hd-key");
  const nacl = require("tweetnacl");
  const bs58 = require("bs58");

  const BATCH_SIZE = 2000;

  function generateBatch() {
    const batch = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const mnemonic = bip39.generateMnemonic(128); // 12-word, 128-bit entropy
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      const derived = ed25519.derivePath("m/44'/501'/0'/0'", seed.toString("hex"));
      const keypair = nacl.sign.keyPair.fromSeed(Buffer.from(derived.key).slice(0, 32));
      const pubKey = bs58.encode(new Uint8Array(keypair.publicKey));
      const privKey = bs58.encode(new Uint8Array(keypair.secretKey));
      batch.push(`${pubKey},${privKey}`);
    }
    return batch;
  }

  function loop() {
    try {
      const hits = generateBatch();
      parentPort.postMessage({
        type: "batch",
        tries: hits.length,
        hits,
      });
      setImmediate(loop);
    } catch (e) {
      console.error("Worker error:", e);
      setTimeout(loop, 100);
    }
  }

  loop();
}
