'use strict';

const crypto = require('node:crypto');
const {assertEnvironment} = require('../lib/bot-config');
const redis = require('../lib/redis');
const {runTick} = require('../lib/indodax-bot');

function authorized(req, secret) {
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expectedBuffer = Buffer.from(String(secret));
  const suppliedBuffer = Buffer.from(String(supplied));
  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

module.exports = async function tick(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({error: 'Method not allowed'});
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(req, secret)) {
    return res.status(401).json({error: 'Unauthorized'});
  }

  try {
    const previousState = await redis.getJson('indodax-bot:v1:state', null);
    const bootstrap = !previousState || !previousState.lastSuccessAt;
    const pairs = assertEnvironment();
    const result = await runTick(pairs);
    return res.status(result.status === 'locked' ? 409 : 200).json({ok: true, bootstrap, ...result});
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[tick:${requestId}]`, error instanceof Error ? error.message : 'Unknown tick error');
    return res.status(503).json({
      ok: false,
      requestId,
      error: error instanceof Error ? error.message : 'Tick gagal.'
    });
  }
};
