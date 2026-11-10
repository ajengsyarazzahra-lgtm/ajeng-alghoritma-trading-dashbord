'use strict';

const RULES = Object.freeze({
  strategyName: 'Indodax EMA Trend Following (dry run)',
  strategyVersion: '1.0.0',
  timeframeMinutes: 1440,
  initialCapitalIdr: 100000000,
  takerFeeRate: 0.0051,
  minimumOrderIdr: 25000,
  fastEma: 30,
  slowEma: 100,
  rsiPeriod: 14,
  rsiMin: 50,
  rsiMax: 75,
  atrPeriod: 14,
  atrMultiple: 3,
  breakoutLookback: 5,
  maxOpenPositions: 3,
  maxPositionPct: 0.1,
  dailyLossLimitPct: 0.03,
  maxSpreadPct: 2,
  maxCandleAgeIntervals: 2,
  requiredContinuousBars: 120,
  bookLevels: 100,
  quantityDecimals: 8,
  freezeAt: '2026-11-04T12:00:00+07:00',
  forwardStart: '2026-11-04T12:00:00+07:00'
});

function getPairs() {
  const raw = process.env.BOT_PAIRS || 'BTCIDR,ETHIDR,XRPIDR';
  const pairs = [...new Set(raw.split(',').map(pair => pair.trim().toUpperCase()).filter(Boolean))];
  if (pairs.length < 3 || pairs.length > 10) {
    throw new Error('BOT_PAIRS wajib berisi 3–10 pasangan IDR yang dipilih dari data likuiditas awal backtest.');
  }
  if (pairs.some(pair => !/^[A-Z0-9]{2,15}IDR$/.test(pair))) {
    throw new Error('Setiap BOT_PAIRS harus berupa simbol pasar IDR Indodax, contoh BTCIDR.');
  }
  if (!pairs.includes('BTCIDR')) {
    throw new Error('BOT_PAIRS wajib memuat BTCIDR agar benchmark buy-and-hold dapat dihitung dari data Indodax yang sama.');
  }
  return pairs;
}

function assertEnvironment() {
  const required = ['CRON_SECRET', 'CONTROL_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Environment variable belum diatur: ${missing.join(', ')}.`);
  const enabled = String(process.env.BOT_ENABLED == null ? 'true' : process.env.BOT_ENABLED).toLowerCase() === 'true';
  if (!enabled) throw new Error('BOT_ENABLED belum bernilai true; bot tetap nonaktif untuk mencegah eksekusi yang belum dikonfigurasi.');
  return getPairs();
}

function isBotEnabled() {
  return String(process.env.BOT_ENABLED == null ? 'true' : process.env.BOT_ENABLED).toLowerCase() === 'true';
}

module.exports = {RULES, getPairs, assertEnvironment, isBotEnabled};
