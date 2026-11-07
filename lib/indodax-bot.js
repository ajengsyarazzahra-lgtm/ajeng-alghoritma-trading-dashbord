'use strict';

const crypto = require('node:crypto');
const {RULES} = require('./bot-config');
const redis = require('./redis');

const PREFIX = 'indodax-bot:v1';
const STATE_KEY = `${PREFIX}:state`;
const LOCK_KEY = `${PREFIX}:tick-lock`;
const KEYS = {
  calls: `${PREFIX}:calls`,
  signals: `${PREFIX}:signals`,
  orders: `${PREFIX}:orders`,
  trades: `${PREFIX}:trades`,
  equity: `${PREFIX}:equity`,
  snapshots: `${PREFIX}:snapshots`,
  errors: `${PREFIX}:errors`,
  totalCalls: `${PREFIX}:total-calls`,
  killSwitch: `${PREFIX}:kill-switch`,
  killSwitchEvents: `${PREFIX}:kill-switch-events`
};
const PUBLIC_API = 'https://indodax.com/api';
const HISTORY_API = 'https://indodax.com/tradingview/history_v2';
const RETRIES = 3;
const REQUEST_GAP_MS = 350;
let lastPublicRequestAt = 0;

const nowIso = () => new Date().toISOString();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const numeric = value => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function wibDay(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(timestamp));
}

function normalizeTimestamp(value) {
  const parsed = numeric(value);
  if (parsed == null) return NaN;
  return parsed > 1e12 ? Math.floor(parsed / 1000) : Math.floor(parsed);
}

function depthSymbol(pair) {
  return `${pair.slice(0, -3).toLowerCase()}_idr`;
}

async function publicJson(url, label) {
  const elapsed = Date.now() - lastPublicRequestAt;
  if (elapsed < REQUEST_GAP_MS) await sleep(REQUEST_GAP_MS - elapsed);
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      lastPublicRequestAt = Date.now();
      const response = await fetch(url, {
        headers: {'Accept': 'application/json', 'User-Agent': 'IndodaxDryRunBot/1.0'},
        signal: controller.signal
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${label}: HTTP ${response.status}`);
      } else if (!response.ok) {
        throw new Error(`${label}: HTTP ${response.status}`);
      } else {
        const body = await response.json();
        if (!body || (typeof body === 'object' && body.error)) {
          throw new Error(`${label}: respons kosong atau berisi error.`);
        }
        return body;
      }
    } catch (error) {
      if (error instanceof Error && /^.*: HTTP 4\d\d$/.test(error.message) && !/HTTP 429/.test(error.message)) throw error;
      lastError = error instanceof Error ? error : new Error(`${label}: request gagal.`);
    } finally {
      clearTimeout(timeout);
    }
    if (attempt + 1 < RETRIES) await sleep(300 * (2 ** attempt));
  }
  throw new Error(`${label}: gagal setelah ${RETRIES} percobaan: ${lastError ? lastError.message : 'kesalahan jaringan'}`);
}

async function getServerTime() {
  const body = await publicJson(`${PUBLIC_API}/server_time`, 'Indodax server_time');
  const raw = body.server_time == null ? body.serverTime : body.server_time;
  const seconds = normalizeTimestamp(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('server_time Indodax tidak valid.');
  return seconds;
}

function parseHistory(body) {
  const source = body.data && typeof body.data === 'object' ? body.data : body;
  const times = source.t || source.time || source.timestamp;
  if (!Array.isArray(times)) {
    if (Array.isArray(source)) {
      return source.map(row => ({
        time: normalizeTimestamp(row.Time == null ? row.time : row.Time),
        open: numeric(row.Open == null ? row.open : row.Open),
        high: numeric(row.High == null ? row.high : row.High),
        low: numeric(row.Low == null ? row.low : row.Low),
        close: numeric(row.Close == null ? row.close : row.Close),
        volume: numeric(row.Volume == null ? row.volume : row.Volume)
      }));
    }
    throw new Error('Format history_v2 tidak dikenali; candle tidak dapat dipakai.');
  }
  const values = {
    open: source.o || source.open,
    high: source.h || source.high,
    low: source.l || source.low,
    close: source.c || source.close,
    volume: source.v || source.volume
  };
  return times.map((time, index) => ({
    time: normalizeTimestamp(time),
    open: numeric(Array.isArray(values.open) ? values.open[index] : null),
    high: numeric(Array.isArray(values.high) ? values.high[index] : null),
    low: numeric(Array.isArray(values.low) ? values.low[index] : null),
    close: numeric(Array.isArray(values.close) ? values.close[index] : null),
    volume: numeric(Array.isArray(values.volume) ? values.volume[index] : null)
  }));
}

async function getClosedCandles(pair, serverTime) {
  const intervalSeconds = RULES.timeframeMinutes * 60;
  const from = serverTime - intervalSeconds * 650;
  const url = new URL(HISTORY_API);
  url.searchParams.set('symbol', pair.toLowerCase());
  url.searchParams.set('tf', String(RULES.timeframeMinutes));
  url.searchParams.set('from', String(from));
  url.searchParams.set('to', String(serverTime));
  const response = await publicJson(url.toString(), `history_v2 ${pair}`);
  return parseHistory(response)
    .filter(candle => Number.isFinite(candle.time) && candle.time + intervalSeconds <= serverTime)
    .sort((a, b) => a.time - b.time);
}

function parseLevels(levels) {
  if (!Array.isArray(levels)) return [];
  return levels.map(level => {
    const price = numeric(Array.isArray(level) ? level[0] : (level.price == null ? level[0] : level.price));
    const amount = numeric(Array.isArray(level) ? level[1] : (level.amount == null ? (level.volume == null ? level.qty : level.volume) : level.amount));
    return {price, amount};
  }).filter(level => level.price != null && level.amount != null && level.price > 0 && level.amount > 0);
}

async function getOrderBook(pair) {
  const url = new URL(`${PUBLIC_API}/depth`);
  url.searchParams.set('pair', depthSymbol(pair));
  const body = await publicJson(url.toString(), `orderbook ${pair}`);
  const data = body.depth && typeof body.depth === 'object' ? body.depth : body;
  const bids = parseLevels(data.buy || data.bids);
  const asks = parseLevels(data.sell || data.asks);
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);
  if (!bids.length || !asks.length) {
    return {pair, bids, asks, valid: false, reason: 'order book kosong', raw: body};
  }
  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const spreadPct = ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100;
  return {
    pair, bids: bids.slice(0, RULES.bookLevels), asks: asks.slice(0, RULES.bookLevels),
    bestBid, bestAsk, mid: (bestAsk + bestBid) / 2, spreadPct,
    valid: bestAsk >= bestBid && spreadPct <= RULES.maxSpreadPct,
    reason: bestAsk < bestBid ? 'best ask di bawah best bid' : (spreadPct > RULES.maxSpreadPct ? 'spread bid-ask melebihi 2%' : null),
    raw: body
  };
}

function contiguous(candles) {
  const expected = RULES.timeframeMinutes * 60;
  const recent = candles.slice(-RULES.requiredContinuousBars);
  if (recent.length < RULES.requiredContinuousBars) return false;
  for (let index = 1; index < recent.length; index++) {
    if (recent[index].time - recent[index - 1].time !== expected) return false;
  }
  return true;
}

function ema(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  let value = values[0];
  const alpha = 2 / (period + 1);
  result[0] = value;
  for (let index = 1; index < values.length; index++) {
    value = values[index] * alpha + value * (1 - alpha);
    result[index] = value;
  }
  return result;
}

function wilderRsi(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0, losses = 0;
  for (let index = 1; index <= period; index++) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const valueAt = (gain, loss) => loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  result[period] = valueAt(avgGain, avgLoss);
  for (let index = period + 1; index < values.length; index++) {
    const change = values[index] - values[index - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = valueAt(avgGain, avgLoss);
  }
  return result;
}

function wilderAtr(candles, period) {
  const result = Array(candles.length).fill(null);
  if (candles.length <= period) return result;
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close));
  });
  let value = ranges.slice(1, period + 1).reduce((sum, item) => sum + item, 0) / period;
  result[period] = value;
  for (let index = period + 1; index < ranges.length; index++) {
    value = (value * (period - 1) + ranges[index]) / period;
    result[index] = value;
  }
  return result;
}

function computeIndicators(candles) {
  const closes = candles.map(candle => candle.close);
  const fast = ema(closes, RULES.fastEma);
  const slow = ema(closes, RULES.slowEma);
  const rsi = wilderRsi(closes, RULES.rsiPeriod);
  const atr = wilderAtr(candles, RULES.atrPeriod);
  const index = candles.length - 1;
  const crossStart = Math.max(1, index - RULES.breakoutLookback + 1);
  let crossedUp = false;
  for (let cursor = crossStart; cursor <= index; cursor++) {
    if (fast[cursor] > slow[cursor] && fast[cursor - 1] <= slow[cursor - 1]) crossedUp = true;
  }
  return {
    index, candle: candles[index], fast: fast[index], slow: slow[index],
    rsi: rsi[index], atr: atr[index], crossedUp,
    closes, fast, slow
  };
}

function checkCandleQuality(candles, serverTime) {
  const intervalSeconds = RULES.timeframeMinutes * 60;
  const last = candles[candles.length - 1];
  if (!last) return {valid: false, reasons: ['tidak ada candle tertutup']};
  const age = serverTime - (last.time + intervalSeconds);
  const reasons = [];
  if (age < 0 || age > intervalSeconds * RULES.maxCandleAgeIntervals) reasons.push('candle tertutup terakhir lebih tua dari 2× timeframe');
  if (last.volume == null || last.volume <= 0) reasons.push('volume candle terakhir nol atau tidak valid');
  if (candles.some(candle => [candle.open, candle.high, candle.low, candle.close].some(value => value == null || value <= 0)
    || candle.volume == null || candle.volume < 0
    || candle.high < Math.max(candle.open, candle.close)
    || candle.low > Math.min(candle.open, candle.close))) {
    reasons.push('harga OHLC atau volume candle tidak valid');
  }
  if (!contiguous(candles)) reasons.push(`ada candle hilang atau kurang dari ${RULES.requiredContinuousBars} bar indikator berurutan`);
  return {valid: reasons.length === 0, reasons, ageSeconds: age};
}

function initialState() {
  return {
    version: 1,
    cash: RULES.initialCapitalIdr,
    positions: {},
    lastProcessed: {},
    latestBids: {},
    latestBidAt: {},
    dailyKey: null,
    dailyStartEquity: null,
    dailyBlocked: false,
    peakEquity: RULES.initialCapitalIdr,
    maxDrawdown: 0,
    stats: {
      totalOrders: 0, totalTrades: 0, wins: 0, grossProfit: 0,
      grossLoss: 0, netProfit: 0, netWins: 0, netLosses: 0,
      fees: 0, spreadCost: 0, slippageCost: 0, totalSuccessCalls: 0
    },
    lastCallAt: null,
    lastSuccessAt: null,
    lastCandleTime: null,
    lastEquity: RULES.initialCapitalIdr,
    lastEquityAt: null
  };
}

function markToMarket(state, timestampMs = Date.now()) {
  let positionsValue = 0;
  let stalePositions = 0;
  for (const [pair, position] of Object.entries(state.positions)) {
    const bid = numeric(state.latestBids[pair]);
    const markedAt = Date.parse(state.latestBidAt && state.latestBidAt[pair] || position.lastBidAt || '');
    const maxAgeMs = RULES.timeframeMinutes * 60 * 1000 * RULES.maxCandleAgeIntervals;
    if (bid == null || bid <= 0 || !Number.isFinite(markedAt) || timestampMs - markedAt > maxAgeMs) {
      stalePositions++;
      continue;
    }
    positionsValue += position.quantity * bid;
  }
  const reliable = stalePositions === 0;
  return {
    cash: state.cash,
    positionsValue,
    equity: reliable ? state.cash + positionsValue : null,
    stalePositions,
    reliable
  };
}

function wibDateAt(timestampSeconds) {
  return wibDay(timestampSeconds * 1000);
}

function floorQuantity(value) {
  const scale = 10 ** RULES.quantityDecimals;
  return Math.floor((value + Number.EPSILON) * scale) / scale;
}

function walkBook(levels, requestedQuantity) {
  let remaining = requestedQuantity;
  let quantity = 0, notional = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const fillQty = Math.min(remaining, level.amount);
    quantity += fillQty;
    notional += fillQty * level.price;
    remaining -= fillQty;
  }
  return {
    quantity,
    notional,
    averagePrice: quantity ? notional / quantity : null,
    unfilled: Math.max(0, remaining)
  };
}

function buyFill(book, maxSpendIdr) {
  const affordableQuantity = maxSpendIdr / (book.asks[0].price * (1 + RULES.takerFeeRate));
  const filled = walkBook(book.asks, floorQuantity(affordableQuantity));
  if (!filled.quantity) return null;
  const fee = filled.notional * RULES.takerFeeRate;
  if (filled.notional + fee > maxSpendIdr + 0.01) return null;
  const spreadCost = ((book.bestAsk - book.bestBid) / 2) * filled.quantity;
  const slippageCost = Math.max(0, filled.averagePrice - book.bestAsk) * filled.quantity;
  return {...filled, fee, spreadCost, slippageCost, mid: book.mid, totalCost: filled.notional + fee};
}

function sellFill(book, requestedQuantity) {
  const filled = walkBook(book.bids, floorQuantity(requestedQuantity));
  if (!filled.quantity) return null;
  const fee = filled.notional * RULES.takerFeeRate;
  const spreadCost = ((book.bestAsk - book.bestBid) / 2) * filled.quantity;
  const slippageCost = Math.max(0, book.bestBid - filled.averagePrice) * filled.quantity;
  return {...filled, fee, spreadCost, slippageCost, mid: book.mid, proceeds: filled.notional - fee};
}

function newPosition(quantity, fill, indicator, book, time) {
  return {
    quantity,
    averageEntryPrice: fill.averagePrice,
    entryMid: book.mid,
    entryTime: time,
    entrySignalPrice: indicator.candle.close,
    entryFeePerUnit: fill.fee / fill.quantity,
    entrySpreadCostPerUnit: fill.spreadCost / fill.quantity,
    entrySlippageCostPerUnit: fill.slippageCost / fill.quantity,
    highestClose: indicator.candle.close,
    lastBid: book.bestBid,
    lastBidAt: time,
    lastSignalTime: time
  };
}

function createOrder({pair, side, quantity, signalPrice, book, fill, time, candleTime}) {
  return {
    time,
    signalTime: candleTime,
    pair,
    side,
    status: 'filled',
    quantity: fill.quantity,
    requestedQuantity: quantity,
    bestBid: book.bestBid,
    bestAsk: book.bestAsk,
    fillPrice: fill.averagePrice,
    fee: fill.fee,
    spreadCost: fill.spreadCost,
    slippageCost: fill.slippageCost,
    signalPrice,
    quoteNotional: fill.notional,
    midPrice: book.mid
  };
}

function errorText(error) {
  return error instanceof Error ? error.message : 'Kesalahan tidak diketahui.';
}

async function saveFailedCall({time, status, message, pair}) {
  const call = {time, processedAt: time, status, pair: pair || null, error: message};
  const error = {time, source: pair ? `Indodax:${pair}` : 'bot', message};
  try {
    await redis.append(KEYS.calls, [call], 5000);
    await redis.append(KEYS.errors, [error], 5000);
  } catch (storageError) {
    throw new Error(`${message}; log kegagalan juga tidak tersimpan: ${errorText(storageError)}`);
  }
}

async function runTick(pairs) {
  const callStartedAt = nowIso();
  await redis.command(['INCR', KEYS.totalCalls]);
  const lockToken = crypto.randomUUID();
  const acquired = await redis.acquireLock(LOCK_KEY, lockToken, 240);
  if (!acquired) {
    const error = {time: callStartedAt, source: 'bot', message: 'Tick lain masih berjalan; eksekusi ditolak oleh distributed lock.'};
    await redis.append(KEYS.calls, [{time: callStartedAt, processedAt: callStartedAt, status: 'locked', error: error.message}], 5000);
    await redis.append(KEYS.errors, [error], 5000);
    return {status: 'locked'};
  }

  try {
    const state = await redis.getJson(STATE_KEY, initialState());
    if (!state || state.version !== 1 || !Number.isFinite(Number(state.cash))) {
      throw new Error('State bot tidak valid atau berbeda versi; hentikan tick dan audit storage.');
    }
    state.stats = {...initialState().stats, ...(state.stats || {})};
    state.positions = state.positions || {};
    state.lastProcessed = state.lastProcessed || {};
    state.latestBids = state.latestBids || {};
    state.latestBidAt = state.latestBidAt || {};
    const serverTime = await getServerTime();
    const serverTimeIso = new Date(serverTime * 1000).toISOString();
    const envKill = String(process.env.PROCESS_KILL_SWITCH || '').toLowerCase() === 'true';
    const storageKill = (await redis.command(['GET', KEYS.killSwitch])) === 'true';
    const killSwitch = envKill || storageKill;
    const snapshots = [];
    const candlesByPair = {};
    const booksByPair = {};
    const failures = [];

    for (const pair of pairs) {
      try {
        candlesByPair[pair] = await getClosedCandles(pair, serverTime);
      } catch (error) {
        failures.push({time: serverTimeIso, source: `Indodax:${pair}:history`, pair, message: errorText(error)});
      }
    }
    for (const pair of pairs) {
      try {
        const book = await getOrderBook(pair);
        booksByPair[pair] = book;
        snapshots.push({
          time: serverTimeIso, pair, bestBid: book.bestBid || null, bestAsk: book.bestAsk || null,
          spreadPct: book.spreadPct == null ? null : book.spreadPct,
          bids: book.bids, asks: book.asks, raw: book.raw
        });
        if (!book.valid) failures.push({time: serverTimeIso, source: `Indodax:${pair}:orderbook`, pair, message: book.reason});
      } catch (error) {
        failures.push({time: serverTimeIso, source: `Indodax:${pair}:orderbook`, pair, message: errorText(error)});
      }
    }

    const indicators = {};
    const quality = {};
    const candleTimes = [];
    for (const pair of pairs) {
      const candles = candlesByPair[pair] || [];
      quality[pair] = checkCandleQuality(candles, serverTime);
      const last = candles[candles.length - 1];
      if (last) candleTimes.push(last.time);
      if (quality[pair].valid) {
        indicators[pair] = computeIndicators(candles);
      } else {
        failures.push({time: serverTimeIso, source: `Indodax:${pair}:validation`, pair, message: quality[pair].reasons.join('; ')});
      }
    }

    if (!candleTimes.length) {
      throw new Error('Tidak ada candle tertutup yang dapat diproses.');
    }
    const latestCandleTime = Math.max(...candleTimes);
    const latestCandleIso = new Date(latestCandleTime * 1000).toISOString();
    const eligiblePairs = pairs.filter(pair => indicators[pair] && indicators[pair].candle.time === latestCandleTime);
    if (!eligiblePairs.length) {
      throw new Error('Tidak ada candle yang lolos validasi data untuk diproses.');
    }
    const unseenPairs = eligiblePairs.filter(pair => Number(state.lastProcessed[pair] || 0) < latestCandleTime);
    if (!unseenPairs.length) {
      state.stats.totalSuccessCalls++;
      state.lastCallAt = serverTimeIso;
      state.lastSuccessAt = serverTimeIso;
      await redis.command(['SET', STATE_KEY, JSON.stringify(state)]);
      const call = {
        time: serverTimeIso, processedAt: serverTimeIso, status: 'duplicate',
        candleTime: latestCandleIso, pairsProcessed: 0,
        message: 'Candle ini sudah diproses; idempotency mencegah order duplikat.'
      };
      await redis.append(KEYS.calls, [call], 5000);
      await redis.append(KEYS.snapshots, snapshots, 5000);
      await redis.append(KEYS.errors, failures, 5000);
      await redis.releaseLock(LOCK_KEY, lockToken);
      return {status: 'duplicate', candleTime: latestCandleIso};
    }

    const now = serverTime * 1000;
    const day = wibDateAt(serverTime);
    for (const pair of pairs) {
      const book = booksByPair[pair];
      if (book && book.bestBid > 0) {
        state.latestBids[pair] = book.bestBid;
        if (state.positions[pair]) {
          state.positions[pair].lastBid = book.bestBid;
          state.positions[pair].lastBidAt = serverTimeIso;
        }
        state.latestBidAt[pair] = serverTimeIso;
      }
    }
    const marketBefore = markToMarket(state, now);
    const equityReliable = marketBefore.reliable;
    const dailySample = state.dailyKey !== day && equityReliable;
    if (dailySample) {
      state.dailyKey = day;
      state.dailyStartEquity = marketBefore.equity;
      state.dailyBlocked = false;
    }
    if (equityReliable && state.dailyStartEquity > 0
      && marketBefore.equity <= state.dailyStartEquity * (1 - RULES.dailyLossLimitPct)) {
      state.dailyBlocked = true;
    }

    const signals = [];
    const orders = [];
    const trades = [];
    const markerKeys = [];
    const newlyProcessed = [];
    const candidates = [];

    for (const pair of unseenPairs) {
      const indicator = indicators[pair];
      const candleTime = new Date(indicator.candle.time * 1000).toISOString();
      markerKeys.push(`${PREFIX}:processed:${pair}:${indicator.candle.time}`);
      newlyProcessed.push({pair, candleTime: indicator.candle.time});
      const book = booksByPair[pair];
      const position = state.positions[pair];
      if (position) {
        position.highestClose = Math.max(position.highestClose, indicator.candle.close);
        position.lastSignalTime = candleTime;
      }
      const buySignal = indicator.crossedUp
        && indicator.fast > indicator.slow
        && indicator.rsi >= RULES.rsiMin
        && indicator.rsi <= RULES.rsiMax
        && indicator.candle.close > indicator.slow;
      const stopPrice = position ? position.highestClose - RULES.atrMultiple * indicator.atr : null;
      const sellReason = position && (
        indicator.candle.close < stopPrice || indicator.fast < indicator.slow
      ) ? (indicator.candle.close < stopPrice ? 'atr_trailing_stop' : 'ema_trend_exit') : null;
      const canEvaluate = quality[pair].valid;
      let action = 'hold';
      let reason = 'tidak ada sinyal';
      let strength = indicator.slow > 0 ? indicator.fast / indicator.slow - 1 : 0;

      if (!canEvaluate) {
        reason = quality[pair].reasons.join('; ');
      } else if (position && sellReason && book && book.bids.length) {
        action = 'sell';
        reason = sellReason;
        const fill = sellFill(book, position.quantity);
        if (fill && fill.notional >= RULES.minimumOrderIdr) {
          const order = createOrder({
            pair, side: 'sell', quantity: position.quantity, signalPrice: indicator.candle.close,
            book, fill, time: serverTimeIso, candleTime
          });
          const entryFee = position.entryFeePerUnit * fill.quantity;
          const entrySpreadCost = position.entrySpreadCostPerUnit * fill.quantity;
          const entrySlippageCost = position.entrySlippageCostPerUnit * fill.quantity;
          const entryCosts = entryFee + entrySpreadCost + entrySlippageCost;
          const exitCosts = fill.fee + fill.spreadCost + fill.slippageCost;
          const grossPnl = (fill.mid - position.entryMid) * fill.quantity;
          const netPnl = grossPnl - entryCosts - exitCosts;
          order.realizedPnlGross = grossPnl;
          order.realizedPnlNet = netPnl;
          orders.push(order);
          trades.push({
            time: serverTimeIso, signalTime: candleTime, pair, side: 'sell',
            quantity: fill.quantity, entryTime: position.entryTime,
            entryMidPrice: position.entryMid, exitMidPrice: fill.mid,
            grossPnl, netPnl,
            entryFee,
            exitFee: fill.fee,
            fee: entryFee + fill.fee,
            entrySpreadCost,
            entrySlippageCost,
            exitSpreadCost: fill.spreadCost,
            exitSlippageCost: fill.slippageCost,
            totalCosts: entryCosts + exitCosts,
            win: netPnl > 0
          });
          state.cash += fill.proceeds;
          const remainingQty = Math.max(0, position.quantity - fill.quantity);
          if (remainingQty <= 1e-10) delete state.positions[pair];
          else state.positions[pair].quantity = remainingQty;
          reason = `${sellReason}; order simulasi terisi di bid`;
        } else {
          reason = `${sellReason}; orderbook tidak cukup atau nilai jual di bawah minimum Rp25.000`;
          action = 'hold';
        }
      } else if (!position && buySignal) {
        action = 'buy';
        reason = 'EMA cross bullish, RSI 50–75, close di atas EMA lambat';
        if (!book || !book.valid) {
          reason = book && book.reason ? book.reason : 'order book tidak tersedia; entry ditolak';
          action = 'hold';
        } else if (killSwitch) {
          reason = 'kill switch aktif; entry ditolak';
          action = 'hold';
        } else if (!equityReliable) {
          reason = 'valuasi posisi terbuka tidak lengkap; entry ditolak';
          action = 'hold';
        } else if (state.dailyBlocked) {
          reason = 'daily loss limit terlampaui; entry ditolak sampai hari WIB berikutnya';
          action = 'hold';
        } else {
          candidates.push({pair, indicator, book, strength, candleTime});
        }
      } else if (position && book && book.spreadPct > RULES.maxSpreadPct) {
        reason = 'spread >2%; entry baru dilarang, posisi dipertahankan menunggu sinyal keluar';
      }

      signals.push({
        time: serverTimeIso, candleTime, pair, action, reason,
        close: indicator.candle.close, volume: indicator.candle.volume,
        fastEma: indicator.fast, slowEma: indicator.slow,
        rsi: indicator.rsi, atr: indicator.atr,
        bestBid: book && book.bestBid || null,
        bestAsk: book && book.bestAsk || null,
        spreadPct: book && book.spreadPct == null ? null : (book && book.spreadPct),
        candleAgeSeconds: quality[pair].ageSeconds
      });
    }

    const marketAfterExits = markToMarket(state, now);
    if (marketAfterExits.reliable && state.dailyStartEquity > 0
      && marketAfterExits.equity <= state.dailyStartEquity * (1 - RULES.dailyLossLimitPct)) {
      state.dailyBlocked = true;
    }
    candidates.sort((a, b) => b.strength - a.strength);
    for (const candidate of candidates) {
      const {pair, indicator, book, candleTime} = candidate;
      if (Object.keys(state.positions).length >= RULES.maxOpenPositions) break;
      if (state.dailyBlocked || killSwitch || !marketAfterExits.reliable) break;
      if (state.positions[pair] || !book.valid || indicator.candle.volume <= 0) continue;
      const equity = markToMarket(state, now).equity;
      const budget = Math.min(state.cash, equity * RULES.maxPositionPct);
      if (budget < RULES.minimumOrderIdr) continue;
      const fill = buyFill(book, budget);
      if (!fill || fill.notional < RULES.minimumOrderIdr) continue;
      const order = createOrder({
        pair, side: 'buy', quantity: fill.quantity, signalPrice: indicator.candle.close,
        book, fill, time: serverTimeIso, candleTime
      });
      state.cash -= fill.totalCost;
      state.positions[pair] = newPosition(fill.quantity, fill, indicator, book, serverTimeIso);
      orders.push(order);
      const signal = signals.find(row => row.pair === pair && row.candleTime === candleTime);
      if (signal) {
        signal.action = 'buy';
        signal.reason = 'EMA cross bullish; order simulasi terisi di ask';
      }
    }

    const marketAfter = markToMarket(state, now);
    if (!marketAfter.reliable) {
      failures.push({
        time: serverTimeIso, source: 'valuation',
        message: `${marketAfter.stalePositions} posisi tidak memiliki best bid live; nilai ekuitas tidak dapat diverifikasi.`
      });
    } else {
      state.lastEquity = marketAfter.equity;
      state.lastEquityAt = serverTimeIso;
      state.peakEquity = Math.max(state.peakEquity, marketAfter.equity);
      state.maxDrawdown = Math.min(state.maxDrawdown, marketAfter.equity / state.peakEquity - 1);
    }

    state.stats.totalOrders += orders.length;
    for (const order of orders) {
      state.stats.fees += order.fee;
      state.stats.spreadCost += order.spreadCost;
      state.stats.slippageCost += order.slippageCost;
    }
    for (const trade of trades) {
      state.stats.totalTrades++;
      if (trade.win) state.stats.wins++;
      if (trade.grossPnl > 0) state.stats.grossProfit += trade.grossPnl;
      else state.stats.grossLoss += Math.abs(trade.grossPnl);
      state.stats.netProfit += trade.netPnl;
      if (trade.netPnl > 0) state.stats.netWins += trade.netPnl;
      else state.stats.netLosses += Math.abs(trade.netPnl);
    }

    const benchmarkBook = booksByPair.BTCIDR;
    const equityRows = marketAfter.reliable ? [{
      time: serverTimeIso, candleTime: latestCandleIso,
      equity: marketAfter.equity, cash: state.cash,
      positionsValue: marketAfter.positionsValue,
      dailyStartEquity: state.dailyStartEquity,
      dailyLossLimitHit: state.dailyBlocked,
      dailyKey: day,
      dailySample,
      valuation: 'best bid'
    }] : [];
    const call = {
      time: serverTimeIso,
      processedAt: serverTimeIso,
      scheduledAt: new Date((latestCandleTime + RULES.timeframeMinutes * 60 + 7 * 60) * 1000).toISOString(),
      candleTime: latestCandleIso,
      status: 'processed',
      pairsProcessed: newlyProcessed.length,
      orders: orders.length,
      killSwitch,
      dailyLossLimitHit: state.dailyBlocked
    };
    state.lastCallAt = serverTimeIso;
    state.lastSuccessAt = serverTimeIso;
    state.lastCandleTime = latestCandleIso;
    state.stats.totalSuccessCalls++;
    for (const item of newlyProcessed) state.lastProcessed[item.pair] = item.candleTime;

    const markerKeysUnique = [...new Set(markerKeys)];
    const commitResult = await redis.commitTick({
      keys: [
        LOCK_KEY, STATE_KEY, KEYS.calls, KEYS.signals, KEYS.orders,
        KEYS.trades, KEYS.equity, KEYS.snapshots, KEYS.errors,
        ...markerKeysUnique
      ],
      args: [
        lockToken, JSON.stringify(state), JSON.stringify([call]),
        JSON.stringify(signals), JSON.stringify(orders), JSON.stringify(trades),
        JSON.stringify(equityRows), JSON.stringify(snapshots),
        JSON.stringify(failures), String(markerKeysUnique.length)
      ]
    });
    if (commitResult === 'DUPLICATE') {
      await redis.releaseLock(LOCK_KEY, lockToken);
      return {status: 'duplicate', candleTime: latestCandleIso};
    }
    if (commitResult !== 'OK') throw new Error(`Commit state/log gagal (${String(commitResult)}); tick dihentikan.`);
    return {
      status: 'processed',
      candleTime: latestCandleIso,
      pairsProcessed: newlyProcessed.length,
      orders: orders.length,
      equity: marketAfter.reliable ? marketAfter.equity : null,
      killSwitch,
      dailyLossLimitHit: state.dailyBlocked
    };
  } catch (error) {
    const message = errorText(error);
    let loggingError = null;
    try {
      await saveFailedCall({time: nowIso(), status: 'error', message});
    } catch (failure) {
      loggingError = failure;
    }
    try {
      await redis.releaseLock(LOCK_KEY, lockToken);
    } catch (releaseError) {
      throw new Error(`${message}; release distributed lock gagal: ${errorText(releaseError)}${loggingError ? `; log error gagal: ${errorText(loggingError)}` : ''}`);
    }
    if (loggingError) throw new Error(`${message}; log kegagalan juga tidak tersimpan: ${errorText(loggingError)}`);
    throw error;
  }
}

module.exports = {
  PREFIX, STATE_KEY, LOCK_KEY, KEYS, runTick, initialState, markToMarket,
  wibDay, parseHistory, parseLevels, computeIndicators, checkCandleQuality,
  walkBook, getClosedCandles, getOrderBook
};
