'use strict';

const crypto = require('node:crypto');
const redis = require('../lib/redis');
const {KEYS} = require('../lib/indodax-bot');

function isAuthorized(req) {
  const secret = process.env.CONTROL_SECRET;
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

module.exports = async function control(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Method not allowed'});
  }
  if (!isAuthorized(req)) return res.status(401).json({error: 'Unauthorized'});

  const body = typeof req.body === 'string' ? (() => {
    try { return JSON.parse(req.body); } catch { return null; }
  })() : req.body;
  if (!body || typeof body.enabled !== 'boolean') {
    return res.status(400).json({error: 'Body wajib berisi {"enabled": true|false, "reason": "..."}.'});
  }

  try {
    const event = {
      time: new Date().toISOString(),
      enabled: body.enabled,
      reason: typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
    };
    const script = `
      redis.call('SET', KEYS[1], ARGV[1])
      redis.call('LPUSH', KEYS[2], ARGV[2])
      redis.call('LTRIM', KEYS[2], 0, 4999)
      return 'OK'
    `;
    await redis.command([
      'EVAL', script, '2', KEYS.killSwitch, KEYS.killSwitchEvents,
      String(body.enabled), JSON.stringify(event)
    ]);
    return res.status(200).json({ok: true, killSwitch: body.enabled, event});
  } catch (error) {
    console.error('[control]', error instanceof Error ? error.message : 'Kill switch update failed');
    return res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Kill switch gagal diperbarui.'
    });
  }
};
