const { fork } = require("child_process");
const { program } = require('commander');
const colors = require('colors');

let tries = 0;
let hits = 0;
const children = [];

// CLI option for number of workers
program
    .option("-c, --count <number>", "number of processes");
const options = program.parse().opts();
const count = parseInt(options.count) || 10; // default 10

console.log(`Starting ${count} workers (max worker my laptop can do)`.yellow);

// spawn workers
for (let i = 0; i < count; i++) {
    // force stdout/stderr pipe so we can listen
    const worker = fork("worker.js", [], { stdio: ["pipe", "pipe", "pipe", "ipc"] });
    children.push(worker);

    // listen to worker stdout
    if (worker.stdout) {
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
    }

    // optional: log worker stderr
    if (worker.stderr) {
        worker.stderr.setEncoding('utf8');
        worker.stderr.on("data", data => console.error(`[Worker ${i} STDERR]`, data));
    }

    worker.on('error', err => {
        console.error(`[Worker ${i} error] ${err.stack || err}`.red);
    });

    worker.on('exit', code => {
        if (code !== 0) console.error(`[Worker ${i} exited with code ${code}]`.red);
    });
}

// graceful shutdown
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
