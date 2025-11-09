const { fork } = require("child_process");
const { program } = require('commander');
const colors = require('colors');
const os = require('os');

let tries = 0;
let hits = 0;
const children = [];

// CLI option for number of workers
program
    .option("-c, --count <number>", "number of processes");
const options = program.parse().opts();
const count = parseInt(options.count) || os.cpus().length;

console.log(`Starting ${count} workers (max worker my laptop can do)`.yellow);

// spawn workers
for (let i = 0; i < count; i++) {
    const worker = fork("worker.js"); // no need to set stdio
    children.push(worker);

    // Listen for stdout data from worker
    worker.stdout.setEncoding('utf8');
    worker.stdout.on("data", (data) => {
        for (const char of data) {
            if (char === '+') {
                tries++;
                hits++;
            } else if (char === '-') {
                tries++;
            }
        }
    });

    worker.on('error', err => {
        console.error(`[Worker ${i} error] ${err.stack || err}`.red);
    });

    worker.on('exit', code => {
        if (code !== 0) console.error(`[Worker ${i} exited with code ${code}]`.red);
    });
}

// handle graceful shutdown
process.on("SIGTERM", () => {
    console.log("\nShutting down workers...".yellow);
    children.forEach(w => w.kill("SIGTERM"));
    process.exit(0);
});

// live spinner & stats
import('log-update').then(mod => {
    const logUpdate = mod.default;
    const frames = ['-', '\\', '|', '/'];
    let index = 0;

    setInterval(() => {
        const frame = frames[index = ++index % frames.length];
        logUpdate(`${frame} Tried : ${tries.toLocaleString()} | Hits : ${hits.toLocaleString()} ${frame}`);
    }, 50);
});
