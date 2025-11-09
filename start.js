const fs = require("fs");
const { fork } = require("child_process");
const { program } = require("commander");
const colors = require("colors");

program.option("-c, --count <number>", "number of workers");
const options = program.parse().opts();
const count = parseInt(options.count) || 6;

console.log(`Starting ${count} workers...`.yellow);

for (let i = 0; i < count; i++) {
    fork("worker.js");
}
