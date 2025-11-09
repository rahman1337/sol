// balance.js
const fs = require('fs');
const path = require('path');
const { Connection, PublicKey } = require('@solana/web3.js');
const chalk = require('chalk'); // for colored console output

// ---------------- CONFIG ----------------
const RPC = 'https://solana-rpc.publicnode.com';
const BATCH_SIZE = 20;   // addresses per RPC call
const WORKERS = 6;       // parallel workers
const MAX_RETRIES = 3;   // retry failed RPCs
const RETRY_DELAY_MS = 500; // backoff between retries
// ----------------------------------------

// helper sleep
async function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

// format timestamp for filenames
function timestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

// fetch balances for a batch with retry
async function fetchBatch(connection, pubkeys, attempt = 1) {
  try {
    return await connection.getMultipleAccountsInfo(pubkeys, 'confirmed');
  } catch (e) {
    if (attempt >= MAX_RETRIES) throw e;
    console.error(chalk.red(`Batch RPC error (attempt ${attempt}): ${e.message}. Retrying...`));
    await sleep(RETRY_DELAY_MS * attempt);
    return fetchBatch(connection, pubkeys, attempt + 1);
  }
}

// process one batch of rows
async function processBatch(connection, slice, startIndex, foundFile) {
  const pubkeys = slice.map(r => {
    try { return new PublicKey(r.address); } catch { return null; }
  });

  const validIndexMap = [];
  const validPubkeys = [];
  pubkeys.forEach((pk, idx) => {
    if (pk) {
      validIndexMap.push(idx);
      validPubkeys.push(pk);
    }
  });

  let infos;
  try {
    infos = await fetchBatch(connection, validPubkeys);
  } catch (e) {
    console.error(chalk.red(`Failed to fetch batch starting at ${startIndex}: ${e.message}`));
    slice.forEach(r =>
      console.log(chalk.gray(`[ERROR] ${r.address}`), chalk.red(e.message))
    );
    return;
  }

  // map results back to slice
  for (let j = 0; j < slice.length; j++) {
    const row = slice[j];
    const addressColored = chalk.gray(row.address);

    if (validIndexMap.includes(j)) {
      const idxInValid = validIndexMap.indexOf(j);
      const info = infos[idxInValid];
      const balanceLamports = info?.lamports || 0;
      const balanceSOL = balanceLamports / 1e9;

      if (balanceLamports === 0) {
        console.log(`${addressColored} ${chalk.yellow('0')}`);
      } else {
        console.log(`${addressColored} ${chalk.yellow(balanceSOL.toFixed(9))}`);
        console.log(`${chalk.green('Privkey :')} ${chalk.green(row.priv)}`);

        // append to found.txt (with timestamped filename)
        const line = `${row.address},${balanceSOL}\n${row.priv}\n`;
        fs.appendFileSync(foundFile, line);
      }
    } else {
      console.log(`${addressColored} ${chalk.red('INVALID_PUBLIC_KEY')}`);
    }
  }
}

// main async runner
(async () => {
  const hitsFile = path.join(__dirname, 'hits.txt');

  if (!fs.existsSync(hitsFile)) {
    console.error(chalk.red('hits.txt not found.'));
    process.exit(1);
  }

  const lines = fs.readFileSync(hitsFile, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    console.log(chalk.yellow('hits.txt empty.'));
    process.exit(0);
  }

  const rows = lines.map(l => {
    const [address, priv] = l.split(',');
    return { address: address.trim(), priv: (priv || '').trim() };
  });

  const connection = new Connection(RPC, { commitment: 'confirmed' });

  // dynamically create timestamped found file
  const foundFile = path.join(__dirname, `found_${timestamp()}.txt`);
  console.log(chalk.cyan(`Writing results to: ${foundFile}`));

  // split into batches
  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push({ slice: rows.slice(i, i + BATCH_SIZE), start: i });
  }

  // run batches in parallel, WORKERS at a time
  for (let i = 0; i < batches.length; i += WORKERS) {
    const chunk = batches.slice(i, i + WORKERS);
    await Promise.all(chunk.map(b => processBatch(connection, b.slice, b.start, foundFile)));
  }

  console.log(chalk.cyan('\n✅ All batches processed.'));
  console.log(chalk.green(`Results saved to ${foundFile}`));
})();
