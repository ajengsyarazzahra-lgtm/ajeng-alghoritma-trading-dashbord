'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readInput(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Tidak dapat membaca JSON "${resolved}": ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Input harus berupa object JSON dashboard atau log forward.');
  }
  return parsed;
}

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scheduleCandles(start, end, timeframeMinutes) {
  const startTime = Date.parse(start || '');
  const endTime = Date.parse(end || '');
  const interval = Number(timeframeMinutes) * 60 * 1000;
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !Number.isFinite(interval) || interval <= 0) return [];
  const rows = [];
  for (let candleTime = Math.ceil(startTime / interval) * interval;
    candleTime + interval <= endTime; candleTime += interval) {
    rows.push({
      candleTime: new Date(candleTime).toISOString(),
      closesAt: new Date(candleTime + interval * 2).toISOString()
    });
  }
  return rows;
}

function dashboardData(data) {
  if (Number(data.schemaVersion) === 1) return data;
  if (data.ok !== true || !data.rules || !data.state || !data.logs) {
    throw new Error('Input harus berupa skema UAS v1 atau ekspor dashboard Vercel.');
  }
  const start = data.rules.forwardStart || data.rules.freezeAt;
  const snapshotTime = data.updatedAt || data.state.lastSuccessAt;
  const startTime = Date.parse(start || '');
  const snapshot = Date.parse(snapshotTime || '');
  const end = Number.isFinite(startTime) && Number.isFinite(snapshot)
    ? new Date(Math.min(snapshot, startTime + 10 * 24 * 60 * 60 * 1000)).toISOString()
    : snapshotTime;
  return {
    ...data,
    rules: data.rules,
    metadata: {
      ...(data.metadata || {}),
      initialCapital: data.rules.initialCapitalIdr
    },
    forward: {
      scheduledCandles: scheduleCandles(start, end, data.rules.timeframeMinutes),
      ...(data.forward || {}),
      ...(data.logs || {})
    }
  };
}

function uptimeStats(scheduledCandles, calls, evaluationEnd, timeframeMinutes) {
  const endTime = Date.parse(evaluationEnd || '');
  const interval = Number(timeframeMinutes) * 60 * 1000;
  if (!Number.isFinite(interval) || interval <= 0) return {scheduled: 0, onTime: 0, ratePct: null};
  const processedByCandle = new Map();
  for (const call of calls) {
    if (String(call.status || '').toLowerCase() !== 'processed') continue;
    const candleTime = Date.parse(call.candleTime || '');
    const processedAt = Date.parse(call.processedAt || call.calledAt || call.time || '');
    if (!Number.isFinite(candleTime) || !Number.isFinite(processedAt)) continue;
    const deadline = candleTime + interval * 2;
    if (processedAt <= deadline) processedByCandle.set(candleTime, true);
  }
  let scheduled = 0;
  let onTime = 0;
  for (const candle of scheduledCandles) {
    const candleTime = Date.parse(candle.candleTime || candle.time || '');
    const closesAt = Date.parse(candle.closesAt || '');
    if (!Number.isFinite(candleTime) || !Number.isFinite(closesAt)) continue;
    if (Number.isFinite(endTime) && closesAt > endTime) continue;
    scheduled++;
    if (processedByCandle.has(candleTime)) onTime++;
  }
  return {scheduled, onTime, ratePct: scheduled ? onTime / scheduled * 100 : null};
}

function calculate(data) {
  data = dashboardData(data);
  const logs = data.logs || {};
  const state = data.state || {};
  const stats = state.stats || {};
  const forward = data.forward || {};
  const trades = Array.isArray(logs.trades) ? logs.trades : (data.forward && data.forward.trades) || [];
  const orders = Array.isArray(logs.orders) ? logs.orders : (data.forward && data.forward.orders) || [];
  const equity = Array.isArray(logs.equity) ? logs.equity : (data.forward && data.forward.equity) || [];
  const calls = Array.isArray(logs.calls) ? logs.calls : (data.forward && data.forward.calls) || [];
  const scheduledCandles = Array.isArray(forward.scheduledCandles) ? forward.scheduledCandles : [];
  const rawLogsComplete = data.logExportComplete === true;
  const metadata = data.metadata || {};
  const initialCapital = finite(
    data.rules && data.rules.initialCapitalIdr != null
      ? data.rules.initialCapitalIdr
      : metadata.initialCapital
  );
  const completed = trades.filter(trade => finite(trade.netPnl) != null);
  const wins = completed.filter(trade => Number(trade.netPnl) > 0);
  const losses = completed.filter(trade => Number(trade.netPnl) < 0);
  const totalTrades = !rawLogsComplete && finite(stats.totalTrades) != null ? Number(stats.totalTrades) : completed.length;
  const totalWins = !rawLogsComplete && finite(stats.wins) != null ? Number(stats.wins) : wins.length;
  const grossProfit = !rawLogsComplete && finite(stats.grossProfit) != null
    ? Number(stats.grossProfit)
    : completed.reduce((sum, trade) => sum + Math.max(0, finite(trade.grossPnl) || 0), 0);
  const netWins = !rawLogsComplete && finite(stats.netWins) != null
    ? Number(stats.netWins)
    : wins.reduce((sum, trade) => sum + Number(trade.netPnl), 0);
  const netLosses = !rawLogsComplete && finite(stats.netLosses) != null
    ? Number(stats.netLosses)
    : Math.abs(losses.reduce((sum, trade) => sum + Number(trade.netPnl), 0));
  const feeTotal = !rawLogsComplete && finite(stats.fees) != null
    ? Number(stats.fees)
    : orders.reduce((sum, order) => sum + (finite(order.fee) || 0), 0);
  const spreadTotal = !rawLogsComplete && finite(stats.spreadCost) != null
    ? Number(stats.spreadCost)
    : orders.reduce((sum, order) => sum + (finite(order.spreadCost) || 0), 0);
  const slippageTotal = !rawLogsComplete && finite(stats.slippageCost) != null
    ? Number(stats.slippageCost)
    : orders.reduce((sum, order) => sum + (finite(order.slippageCost) || 0), 0);
  const sortedEquity = [...equity]
    .filter(row => finite(row.equity) != null)
    .sort((a, b) => Date.parse(a.time || a.timestamp) - Date.parse(b.time || b.timestamp));
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const row of sortedEquity) {
    const value = Number(row.equity);
    peak = Math.max(peak, value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  }
  if (!rawLogsComplete && finite(state.maxDrawdown) != null) maxDrawdown = Math.min(maxDrawdown, Number(state.maxDrawdown));
  const hasDrawdownData = sortedEquity.length > 0
    || (!rawLogsComplete && Boolean(state.lastEquityAt) && finite(state.maxDrawdown) != null);
  const lastEquity = rawLogsComplete && sortedEquity.length
    ? Number(sortedEquity[sortedEquity.length - 1].equity)
    : finite(state.lastEquity) != null
    ? Number(state.lastEquity)
    : (sortedEquity.length ? Number(sortedEquity[sortedEquity.length - 1].equity) : null);
  const successCalls = calls.filter(call => ['processed', 'duplicate'].includes(String(call.status || '').toLowerCase())).length;
  const totalCalls = finite(logs.callsTotal) != null ? Number(logs.callsTotal) : calls.length;
  const totalCosts = feeTotal + spreadTotal + slippageTotal;
  const evaluationEnd = data.updatedAt || (data.metadata && data.metadata.forwardEnd);
  const uptime = uptimeStats(scheduledCandles, calls, evaluationEnd, data.rules && data.rules.timeframeMinutes || metadata.timeframeMinutes);

  return {
    generatedAt: new Date().toISOString(),
    source: data.updatedAt ? 'dashboard snapshot / Redis logs' : 'provided raw JSON logs',
    scope: 'Menggunakan hanya baris yang tersedia pada file input; angka yang hilang tidak diestimasi.',
    totalEquityIdr: lastEquity,
    returnPct: lastEquity != null && initialCapital > 0 ? (lastEquity / initialCapital - 1) * 100 : null,
    maxDrawdownPct: hasDrawdownData ? Math.abs(maxDrawdown) * 100 : null,
    winRatePct: totalTrades ? totalWins / totalTrades * 100 : null,
    profitFactor: netLosses ? netWins / netLosses : null,
    profitFactorLabel: netLosses
      ? 'terhitung'
      : netWins
      ? 'tak terhingga (belum ada rugi)'
      : totalTrades
      ? 'tidak terdefinisi (tanpa laba/rugi neto)'
      : 'belum ada trade',
    totalTrades,
    totalOrders: !rawLogsComplete && finite(stats.totalOrders) != null ? Number(stats.totalOrders) : orders.length,
    totalCalls,
    successfulCalls: !rawLogsComplete && finite(stats.totalSuccessCalls) != null
      ? Number(stats.totalSuccessCalls)
      : successCalls,
    successfulCallsInExport: successCalls,
    onTimeCandles: uptime.onTime,
    scheduledCandles: uptime.scheduled,
    uptimePct: uptime.ratePct,
    feesIdr: feeTotal,
    spreadCostIdr: spreadTotal,
    slippageCostIdr: slippageTotal,
    costToGrossProfitPct: grossProfit > 0 ? totalCosts / grossProfit * 100 : null,
    grossProfitIdr: grossProfit,
    realizedNetProfitIdr: !rawLogsComplete && finite(stats.netProfit) != null
      ? Number(stats.netProfit)
      : completed.reduce((sum, trade) => sum + Number(trade.netPnl), 0),
    openPositions: Object.keys(state.positions || {}).length,
    equityPoints: sortedEquity.length,
    retainedTradeRows: trades.length,
    retainedOrderRows: orders.length,
    rawLogsComplete
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    throw new Error('Pemakaian: node tools/hitung_ulang.js <dashboard-export.json>');
  }
  console.log(JSON.stringify(calculate(readInput(file)), null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Penghitungan ulang gagal.');
    process.exitCode = 1;
  }
}

module.exports = {calculate};
