'use strict';

const RETRIES = 3;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL dan UPSTASH_REDIS_REST_TOKEN wajib dikonfigurasi.');
  return {url: url.replace(/\/+$/, ''), token};
}

async function command(parts) {
  const {url, token} = redisConfig();
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parts),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload && !payload.error) return payload.result;
      const retryable = response.status === 429 || response.status >= 500;
      const message = payload && payload.error ? String(payload.error) : `Upstash HTTP ${response.status}`;
      if (!retryable) throw new Error(message);
      lastError = new Error(message);
    } catch (error) {
      if (error instanceof Error && !/fetch failed|aborted|network|Upstash HTTP 429|Upstash HTTP 5\d\d/i.test(error.message)) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error('Upstash request failed.');
    } finally {
      clearTimeout(timeout);
    }
    if (attempt + 1 < RETRIES) await sleep(250 * (2 ** attempt));
  }
  throw new Error(`Upstash gagal setelah ${RETRIES} percobaan: ${lastError ? lastError.message : 'kesalahan jaringan'}`);
}

async function getJson(key, fallback) {
  const value = await command(['GET', key]);
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Data Redis rusak pada key ${key}.`);
  }
}

async function list(key, count = 100) {
  const rows = await command(['LRANGE', key, '0', String(Math.max(0, count - 1))]);
  if (!Array.isArray(rows)) throw new Error(`Respons Redis LRANGE tidak valid untuk ${key}.`);
  return rows.map(value => {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Entri log Redis tidak valid pada ${key}.`);
    }
  });
}

async function acquireLock(key, token, seconds = 240) {
  return (await command(['SET', key, token, 'NX', 'EX', String(seconds)])) === 'OK';
}

async function releaseLock(key, token) {
  const script = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
  await command(['EVAL', script, '1', key, token]);
}

async function append(key, rows, limit = 5000) {
  if (!rows.length) return;
  const commands = [];
  for (const row of rows) commands.push(['LPUSH', key, JSON.stringify(row)]);
  commands.push(['LTRIM', key, '0', String(limit - 1)]);
  const {url, token} = redisConfig();
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  const payload = await response.json().catch(() => null);
  const commandError = Array.isArray(payload) && payload.find(result => result && result.error);
  if (!response.ok || !Array.isArray(payload) || commandError) {
    const message = commandError ? String(commandError.error) : (payload && payload.error ? String(payload.error) : `Upstash append HTTP ${response.status}`);
    throw new Error(message);
  }
}

async function commitTick({keys, args}) {
  const script = `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 'LOCK_LOST' end
    local markerCount = tonumber(ARGV[10])
    for i = 1, markerCount do
      if redis.call('EXISTS', KEYS[9 + i]) == 1 then return 'DUPLICATE' end
    end
    redis.call('SET', KEYS[2], ARGV[2])
    local logs = {
      {KEYS[3], ARGV[3]},
      {KEYS[4], ARGV[4]},
      {KEYS[5], ARGV[5]},
      {KEYS[6], ARGV[6]},
      {KEYS[7], ARGV[7]},
      {KEYS[8], ARGV[8]},
      {KEYS[9], ARGV[9]}
    }
    for _, entry in ipairs(logs) do
      local values = cjson.decode(entry[2])
      for _, value in ipairs(values) do redis.call('LPUSH', entry[1], cjson.encode(value)) end
      redis.call('LTRIM', entry[1], 0, 4999)
    end
    for i = 1, markerCount do
      redis.call('SET', KEYS[9 + i], '1', 'EX', 31536000)
    end
    redis.call('DEL', KEYS[1])
    return 'OK'
  `;
  return command(['EVAL', script, String(keys.length), ...keys, ...args]);
}

module.exports = {command, getJson, list, acquireLock, releaseLock, append, commitTick};
