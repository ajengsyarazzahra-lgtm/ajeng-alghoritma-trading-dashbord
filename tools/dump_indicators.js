'use strict';
// Menghitung indikator dengan fungsi YANG SAMA dengan bot (lib/indodax-bot.js computeIndicators).
// Pemakaian: node tools/dump_indicators.js candles.json [step]
// candles.json: {"pair": [{time,open,high,low,close,volume}, ...]} (time = unix detik, urut naik)
// Untuk tiap indeks i (kelipatan step, minimal 120), jendela terakhir <=650 bar dipakai persis
// seperti bot yang mengambil ~650 bar dari history_v2 tiap panggilan.
const fs = require('node:fs');
const {computeIndicators} = require('../lib/indodax-bot');

const WINDOW = 650;
const file = process.argv[2];
const step = Number(process.argv[3] || 1);
if (!file) { console.error('Pemakaian: node tools/dump_indicators.js candles.json [step]'); process.exit(2); }
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = {};
for (const [pair, candles] of Object.entries(data)) {
  out[pair] = [];
  for (let i = 120; i < candles.length; i += step) {
    const window = candles.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const ind = computeIndicators(window);
    out[pair].push({time: candles[i].time, fast: ind.fast, slow: ind.slow, rsi: ind.rsi, atr: ind.atr, crossedUp: ind.crossedUp});
  }
}
process.stdout.write(JSON.stringify(out));
