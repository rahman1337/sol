// balance.js
const fs = require('fs');
const path = require('path');
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC = 'https://solana-rpc.publicnode.com';
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 10000;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchBatch(connection, pubkeys, attempt = 1) {
  try {
    // connection.getMultipleAccountsInfo accepts array of PublicKey
    const infos = await connection.getMultipleAccountsInfo(pubkeys, 'confirmed');
    return infos;
  } catch (e) {
    if (attempt >= MAX_RETRIES) throw e;
    console.error(`Batch RPC error (attempt ${attempt}): ${e.message}. Retrying...`);
    await sleep(500 * attempt);
    return fetchBatch(connection, pubkeys, attempt + 1);
  }
}

(async () => {
  const hitsFile = path.join(__dirname, 'hits.txt');
  if (!fs.existsSync(hitsFile)) {
    console.error('hits.txt not found.');
    process.exit(1);
  }
  const lines = fs.readFileSync(hitsFile, 'utf8').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    console.log('hits.txt empty.');
    process.exit(0);
  }

  const rows = lines.map(l => {
    const [address, priv] = l.split(',');
    return { address: address.trim(), priv: (priv || '').trim() };
  });

  const connection = new Connection(RPC, { commitment: 'confirmed', confirmTransactionInitialTimeout: TIMEOUT_MS });

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const pubkeys = slice.map(r => {
      try { return new PublicKey(r.address); } catch (e) { return null; }
    });

    // filter invalid pubkeys
    const validIndexMap = [];
    const validPubkeys = [];
    pubkeys.forEach((pk, idx) => { if (pk) { validIndexMap.push(idx); validPubkeys.push(pk); } });

    let infos;
    try {
      infos = await fetchBatch(connection, validPubkeys);
    } catch (e) {
      console.error(`Failed to fetch batch starting at ${i}: ${e.message}. Skipping batch.`);
      // print error for each in this batch
      slice.forEach(r => console.log(`[ERROR] ${r.address} - ${e.message}`));
      continue;
    }

    // infos aligns with validPubkeys; map back to slice
    let infoIdx = 0;
    for (let j = 0; j < slice.length; j++) {
      const row = slice[j];
      if (validIndexMap.includes(j)) {
        // find corresponding index in validPubkeys sequence (it is in order)
        const idxInValid = validIndexMap.indexOf(j);
        const info = infos[idxInValid];
        if (!info || !info.lamports) {
          console.log(`${row.address} 0`);
        } else {
          const sol = Number(info.lamports) / 1e9;
          console.log(`${row.address} ${sol}`);
          console.log(`Privkey : ${row.priv}`);
        }
      } else {
        // invalid pubkey in file
        console.log(`${row.address} INVALID_PUBLIC_KEY`);
      }
    }
    // small throttle to be polite with RPC
    await sleep(200);
  }
})();
