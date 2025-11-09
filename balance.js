const fs = require('fs')
const { ethers } = require('ethers')
require('colors')

// PublicNode RPC
const provider = new ethers.providers.JsonRpcProvider('https://solana-rpc.publicnode.com')

// Read addresses
const addresses = fs
    .readFileSync('hits.txt', 'utf8')
    .split('\n')
    .map((val) => val.split(','))

const concurrency = 20 // number of parallel requests
const maxRetries = 3

async function checkBalance(address, privateKey, attempt = 1) {
    try {
        const balance = await provider.getBalance(address)
        if (balance.gt(0)) {
            console.log(address.bgGreen.black, balance.toString().bgGreen.black)
            console.log('Private Key: '.yellow, privateKey)
        } else {
            console.log(address, 0)
        }
    } catch (err) {
        console.error(`[ERROR] ${address} (Attempt ${attempt}) - ${err.message}`.red)
        if (attempt < maxRetries) {
            await checkBalance(address, privateKey, attempt + 1)
        }
    }
}

async function main() {
    let i = 0
    while (i < addresses.length) {
        const batch = addresses.slice(i, i + concurrency)
        await Promise.all(batch.map(([address, privateKey]) => checkBalance(address, privateKey)))
        i += concurrency
    }
}

main()
