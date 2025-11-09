// balance-solana.js
const fs = require('fs');
const { Connection, PublicKey } = require('@solana/web3.js');
require('colors');

const RPC = 'https://solana-rpc.publicnode.com';
const connection = new Connection(RPC, { commitment: 'confirmed' });

// Configure concurrency and retry behavior
const CONCURRENCY = 20;          // parallel requests (tune lower/higher depending on your observed rate limits)
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 200;     // exponential backoff base (200ms, 400ms, 800ms...)

// small throttle after processing many requests to avoid bursts
const PAUSE_EVERY = 200;         // after this many checks pause briefly
const PAUSE_MS = 250;            // ms to pause

// Read and parse hits.txt - format: <address>,<privkey> per line
const raw = fs.readFileSync('hits.txt', 'utf8');
const addresses = raw
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0)
  .map(line => {
    const parts = line.split(',');
    return { address: (parts[0] || '').trim(), privateKey: (parts[1] || '').trim(), raw: line };
  })
  .filter(obj => {
    try {
      // Validate address quickly
      if (!obj.address) return false;
      new PublicKey(obj.address); // will throw if invalid
      return true;
    } catch (e) {
      console.error(`[SKIP] invalid address: ${obj.raw}`.yellow);
      return false;
    }
  });

if (!addresses.length) {
  console.log('No valid addresses found in hits.txt'.red);
  process.exit(1);
}

let processed = 0;

// small helper sleep
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Get balance with retries and exponential backoff (returns lamports)
async function getBalanceWithRetries(pubkey, attempt = 1) {
  try {
    // This will call the RPC
    const lamports = await connection.getBalance(pubkey);
    return lamports;
  } catch (err) {
    console.error(`[ERROR RPC] ${pubkey.toBase58()} (Attempt ${attempt}) - ${err.message}`.red);
    if (attempt < MAX_RETRIES) {
      const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
      await delay(backoff);
      return getBalanceWithRetries(pubkey, attempt + 1);
    }
    // rethrow after max retries so caller knows it failed
    throw err;
  }
}

// Worker for a single item
async function worker(item) {
  const { address, privateKey } = item;
  const pubkey = new PublicKey(address);
  try {
    const lamports = await getBalanceWithRetries(pubkey);
    const sol = lamports / 1e9;

    if (lamports > 0) {
      // Non-zero hit
      console.log(address.bgGreen.black, `${sol} SOL`.bgGreen.black);
      console.log('Private Key: '.yellow, privateKey);
    } else {
      // Zero balance
      console.log(address, 0);
    }
  } catch (err) {
    // Already logged inside getBalanceWithRetries, but log a final message
    console.error(`[FAIL] ${address} - ${err.message}`.red);
  } finally {
    processed++;
    // brief throttle after many processed items to avoid bursts
    if (processed % PAUSE_EVERY === 0) {
      await delay(PAUSE_MS);
    }
  }
}

// Promise pool runner
async function runPool(items, workerFn, concurrency) {
  return new Promise((resolve) => {
    let index = 0;
    let inFlight = 0;

    function next() {
      while (inFlight < concurrency && index < items.length) {
        const item = items[index++];
        inFlight++;
        workerFn(item)
          .catch(() => {}) // worker logs errors itself
          .finally(() => {
            inFlight--;
            if (index === items.length && inFlight === 0) {
              resolve();
            } else {
              // schedule next, but give event loop a tick to avoid blocking
              setImmediate(next);
            }
          });
      }
    }

    next();
  });
}

(async () => {
  console.log(`Checking ${addresses.length} addresses with concurrency=${CONCURRENCY}`.green);
  await runPool(addresses, worker, CONCURRENCY);
  console.log('Done.'.green);
})();
