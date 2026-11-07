'use strict';

const {RULES, getPairs, isBotEnabled} = require('../lib/bot-config');
const redis = require('../lib/redis');
const bot = require('../lib/indodax-bot');

const BOOTSTRAP_COOLDOWN_KEY = `${bot.PREFIX}:bootstrap-cooldown`;

module.exports = async function dashboard(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error: 'Method not allowed'});
  }
  try {
    const pairs = getPairs();
    let bootstrap = 'not-needed';
    const currentState = await redis.getJson(bot.STATE_KEY, bot.initialState());
    const currentLastSuccess = Date.parse(currentState.lastSuccessAt || '');
    const currentSuccessAge = Date.now() - currentLastSuccess;
    const stateIsOffline = !Number.isFinite(currentLastSuccess)
      || currentSuccessAge < -5 * 60 * 1000
      || currentSuccessAge > RULES.timeframeMinutes * 60 * 1000 * 2;
    if (stateIsOffline) {
      if (!isBotEnabled()) {
        bootstrap = 'disabled';
      } else {
        const acquired = await redis.command(['SET', BOOTSTRAP_COOLDOWN_KEY, new Date().toISOString(), 'NX', 'EX', '3600']);
        if (acquired === 'OK') {
          try {
            const result = await bot.runTick(pairs);
            bootstrap = result.status === 'locked' ? 'in-progress' : 'completed';
          } catch (error) {
            bootstrap = 'failed';
            console.error('[dashboard-bootstrap]', error instanceof Error ? error.message : 'Bootstrap failed');
          }
        } else bootstrap = 'already-attempted';
      }
    }

    const fullExport = Boolean(req.query && req.query.full === '1');
    const logLimit = fullExport ? 5000 : 250;
    const [state, calls, callsTotal, signals, orders, trades, equity, snapshots, errors, killSwitch, killSwitchEvents] = await Promise.all([
      redis.getJson(bot.STATE_KEY, bot.initialState()),
      redis.list(bot.KEYS.calls, logLimit),
      redis.command(['GET', bot.KEYS.totalCalls]),
      redis.list(bot.KEYS.signals, logLimit),
      redis.list(bot.KEYS.orders, logLimit),
      redis.list(bot.KEYS.trades, logLimit),
      redis.list(bot.KEYS.equity, fullExport ? logLimit : 500),
      redis.list(bot.KEYS.snapshots, fullExport ? logLimit : 50),
      redis.list(bot.KEYS.errors, fullExport ? 1000 : 100),
      redis.command(['GET', bot.KEYS.killSwitch]),
      redis.list(bot.KEYS.killSwitchEvents, fullExport ? 1000 : 100)
    ]);
    const callsCount = Number(callsTotal) || 0;
    const exportLogs = [calls, signals, orders, trades, equity, snapshots];
    const logExportComplete = fullExport
      && calls.length === callsCount && calls.length < logLimit
      && exportLogs.every(rows => rows.length < logLimit)
      && errors.length < 1000 && killSwitchEvents.length < 1000;
    const lastSuccess = Date.parse(state.lastSuccessAt || '');
    const successAge = Date.now() - lastSuccess;
    const online = Number.isFinite(lastSuccess)
      && successAge >= -5 * 60 * 1000
      && successAge <= RULES.timeframeMinutes * 60 * 1000 * 2;
    return res.status(200).json({
      ok: true,
      status: online ? 'RUNNING (ONLINE)' : 'OFFLINE / MENUNGGU TICK BERHASIL',
      bootstrap,
      updatedAt: new Date().toISOString(),
      rules: RULES,
      pairs,
      logExportComplete,
      killSwitchSources: {
        environment: String(process.env.PROCESS_KILL_SWITCH || '').toLowerCase() === 'true',
        manual: killSwitch === 'true'
      },
      killSwitch: String(process.env.PROCESS_KILL_SWITCH || '').toLowerCase() === 'true' || killSwitch === 'true',
      state: {
        cash: state.cash,
        positions: state.positions,
        lastCallAt: state.lastCallAt,
        lastSuccessAt: state.lastSuccessAt,
        lastCandleTime: state.lastCandleTime,
        lastEquity: state.lastEquity,
        lastEquityAt: state.lastEquityAt,
        peakEquity: state.peakEquity,
        maxDrawdown: state.maxDrawdown,
        stats: state.stats || bot.initialState().stats,
        dailyKey: state.dailyKey,
        dailyStartEquity: state.dailyStartEquity,
        dailyBlocked: state.dailyBlocked
      },
      logs: {calls, callsTotal: callsCount, signals, orders, trades, equity, snapshots, errors, killSwitchEvents}
    });
  } catch (error) {
    console.error('[dashboard]', error instanceof Error ? error.message : 'Dashboard log read failed');
    return res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Log dashboard tidak dapat dibaca.'
    });
  }
};
