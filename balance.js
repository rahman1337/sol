// balance.js
const fs = require('fs');
const path = require('path');
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC = 'https://solana-rpc.publicnode.com';
const BATCH_SIZE = 20;      // addresses per RPC call
const MAX_RETRIES = 3;      // retry failed RPCs
const RETRY_DELAY_MS = 500; // backoff between retries

// simple sleep helper
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// fetch balances for a batch of PublicKeys with retry
async function fetchBatch(connection, pubkeys, attempt = 1) {
  try {
    const infos = await connection.getMultipleAccountsInfo(pubkeys, 'confirmed');
    return infos;
  } catch (e) {
    if (attempt >= MAX_RETRIES) throw e;
    console.error(`Batch RPC error (attempt ${attempt}): ${e.message}. Retrying...`);
    await sleep(RETRY_DELAY_MS * attempt);
    return fetchBatch(connection, pubkeys, attempt + 1);
  }
}

(async () => {
  const hitsFile = path.join(__dirname, 'hits.txt');
  if (!fs.existsSync(hitsFile)) {
    console.error('hits.txt not found.');
    process.exit(1);
  }

  const lines = fs.readFileSync(hitsFile, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    console.log('hits.txt empty.');
    process.exit(0);
  }

  const rows = lines.map(l => {
    const [address, priv] = l.split(',');
    return { address: address.trim(), priv: (priv || '').trim() };
  });

  const connection = new Connection(RPC, { commitment: 'confirmed' });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);

    // validate public keys
    const pubkeys = slice.map(r => {
      try { return new PublicKey(r.address); } catch { return null; }
    });

    const validIndexMap = [];
    const validPubkeys = [];
    pubkeys.forEach((pk, idx) => { if (pk) { validIndexMap.push(idx); validPubkeys.push(pk); } });

    let infos;
    try {
      infos = await fetchBatch(connection, validPubkeys);
    } catch (e) {
      console.error(`Failed to fetch batch starting at ${i}: ${e.message}. Skipping batch.`);
      slice.forEach(r => console.log(`[ERROR] ${r.address} - ${e.message}`));
      continue;
    }

    // map results back to slice
    for (let j = 0; j < slice.length; j++) {
      const row = slice[j];
      if (validIndexMap.includes(j)) {
        const idxInValid = validIndexMap.indexOf(j);
        const info = infos[idxInValid];
        const balance = info?.lamports || 0;
        if (balance === 0) {
          console.log(`${row.address} 0`);
        } else {
          console.log(`${row.address} ${balance / 1e9}`);
          console.log(`Privkey : ${row.priv}`);
        }
      } else {
        console.log(`${row.address} INVALID_PUBLIC_KEY`);
      }
    }
    await sleep(50); // small throttle to avoid RPC rate limits
  }
})();
