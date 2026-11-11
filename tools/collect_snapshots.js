'use strict';
// Pengumpul snapshot order book Indodax (API publik, tanpa API key). Jalankan di LAPTOP.
//   node tools/collect_snapshots.js --once                 # satu putaran (untuk Task Scheduler / cron)
//   node tools/collect_snapshots.js --every-minutes 60     # loop terus-menerus
// Hasil ditambahkan ke logs/snapshots_laptop.jsonl, satu baris per pair:
//   {time, pair, bestBid, bestAsk, spreadPct, slippagePct, notionalIdr, buyAvg, sellAvg, bids[20], asks[20]}
// spreadPct   = (ask-bid)/mid*100
// slippagePct = rata-rata slippage sisi beli dan jual terhadap best ask/bid untuk order notionalIdr
//               (default Rp10.000.000 = 10% modal virtual, sesuai ukuran posisi maksimum bot).
// Dipakai backtest: python backtest.py run ... --snapshots logs/snapshots_laptop.jsonl
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const once = args.includes('--once');
const everyMinutes = Number(opt('--every-minutes', 60));
const pairs = (opt('--pairs', 'BTCIDR,ETHIDR,XRPIDR')).split(',').map(s => s.trim().toUpperCase());
const notionalIdr = Number(opt('--notional', 10000000));
const out = opt('--out', path.join(__dirname, '..', 'logs', 'snapshots_laptop.jsonl'));
const GAP_MS = 400; // <= 3 request/detik, tidak paralel
const sleep = ms => new Promise(r => setTimeout(r, ms));

function levels(raw) {
  return (Array.isArray(raw) ? raw : []).map(l => [Number(l[0]), Number(l[1])]).filter(l => l[0] > 0 && l[1] > 0);
}
function walk(book, notional) { // beli/jual senilai notional IDR; kembalikan harga rata-rata
  let remaining = notional, qty = 0;
  for (const [price, amount] of book) {
    const take = Math.min(remaining / price, amount);
    qty += take; remaining -= take * price;
    if (remaining <= 0.5) break;
  }
  return qty > 0 ? (notional - remaining) / qty : null;
}

async function snapshot(pair) {
  const url = `https://indodax.com/api/depth/${pair.toLowerCase()}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(15000)});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const bids = levels(body.buy).sort((a, b) => b[0] - a[0]);
      const asks = levels(body.sell).sort((a, b) => a[0] - b[0]);
      if (!bids.length || !asks.length) throw new Error('order book kosong');
      const bestBid = bids[0][0], bestAsk = asks[0][0], mid = (bestBid + bestAsk) / 2;
      const buyAvg = walk(asks, notionalIdr), sellAvg = walk(bids, notionalIdr);
      if (buyAvg == null || sellAvg == null) throw new Error('kedalaman tidak cukup');
      const slippagePct = (((buyAvg - bestAsk) / bestAsk) + ((bestBid - sellAvg) / bestBid)) / 2 * 100;
      return {time: new Date().toISOString(), pair, bestBid, bestAsk,
              spreadPct: (bestAsk - bestBid) / mid * 100, slippagePct: Math.max(0, slippagePct),
              notionalIdr, buyAvg, sellAvg, bids: bids.slice(0, 20), asks: asks.slice(0, 20)};
    } catch (error) {
      lastError = error;
      await sleep(1000 * (attempt + 1));
    }
  }
  console.error(`[${new Date().toISOString()}] ${pair} gagal: ${lastError && lastError.message}`);
  return null;
}

async function round() {
  fs.mkdirSync(path.dirname(out), {recursive: true});
  let saved = 0;
  for (const pair of pairs) {
    const row = await snapshot(pair);
    if (row) { fs.appendFileSync(out, JSON.stringify(row) + '\n'); saved++; }
    await sleep(GAP_MS);
  }
  console.log(`[${new Date().toISOString()}] ${saved}/${pairs.length} snapshot tersimpan di ${out}`);
}

(async () => {
  await round();
  if (once) return;
  for (;;) { await sleep(everyMinutes * 60000); await round(); }
})();
