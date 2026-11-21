// Shared storage for serverless routes (Flock now, Campus later): small JSON documents by key.
// Uses Upstash Redis over its REST API when the Vercel integration's env vars are set
// (KV_REST_API_URL / KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
// Without them, or if Redis is unreachable, it keeps the documents in this function instance's
// memory, so a demo on one warm instance still works. Key prefixes: pengbit:flock:, pengbit:campus:.
//
//   import { get, set, list, readDoc, updateDoc, storeKind } from './_store.js';
//   await set('pengbit:campus:day:2026-11-21:msc', { sitMin: 40 }, 86400);   // JSON value, optional TTL in seconds
//   await get('pengbit:campus:day:2026-11-21:msc')                          // -> value or null
//   await list('pengbit:campus:day:2026-11-21:')                            // -> [{ key, value }] (up to 1000)
//   const doc = await readDoc('pengbit:campus:v1');
//   await updateDoc('pengbit:campus:v1', async (doc) => { ...; return { doc }; });   // locked read-modify-write
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const mem = globalThis.__pengbitStore || (globalThis.__pengbitStore = { docs: {}, locks: {} });
let redisDown = false;

async function redis(...args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(4000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

export function storeKind() {
  if (!URL_ || !TOKEN) return 'memory';
  return redisDown ? 'memory (redis unreachable)' : 'redis';
}
const useRedis = () => !!(URL_ && TOKEN && !redisDown);
function down(where, e) { console.error(`store: redis ${where} failed, using memory`, e.message); redisDown = true; }

export async function readDoc(key) {
  if (useRedis()) {
    try { const v = await redis('GET', key); return v ? JSON.parse(v) : null; }
    catch (e) { down('read', e); }
  }
  return mem.docs[key] ? JSON.parse(mem.docs[key]) : null;
}

export async function writeDoc(key, doc) {
  const s = JSON.stringify(doc);
  if (useRedis()) {
    try { await redis('SET', key, s); return; }
    catch (e) { down('write', e); }
  }
  mem.docs[key] = s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Read-modify-write under a short lock so two phones posting at once don't lose an update.
// fn(doc | null) returns { doc, ...anything }; doc is saved if present. Returns fn's result.
export async function updateDoc(key, fn) {
  const lock = key + ':lock', token = Math.random().toString(36).slice(2);
  let locked = false;
  for (let i = 0; i < 40 && !locked; i++) {
    if (useRedis()) {
      try { locked = (await redis('SET', lock, token, 'NX', 'PX', '5000')) === 'OK'; }
      catch (e) { down('lock', e); }
    }
    if (!useRedis() && !locked && (mem.locks[key] || 0) < Date.now()) { mem.locks[key] = Date.now() + 5000; locked = true; }
    if (!locked) await sleep(50 + Math.random() * 50);
  }
  // If the lock never frees (a crashed holder), go ahead anyway: it expires in 5 s.
  try {
    const out = await fn(await readDoc(key));
    if (out && out.doc) await writeDoc(key, out.doc);
    return out;
  } finally {
    if (useRedis()) { try { if ((await redis('GET', lock)) === token) await redis('DEL', lock); } catch {} }
    else delete mem.locks[key];
  }
}

// ---------------------------------------------------------------- simple key/value API (Campus etc.)
const memExp = mem.exp || (mem.exp = {});
const memAlive = (key) => mem.docs[key] != null && (!memExp[key] || memExp[key] > Date.now());

export async function get(key) {
  if (useRedis()) {
    try { const v = await redis('GET', key); return v == null ? null : JSON.parse(v); }
    catch (e) { down('get', e); }
  }
  return memAlive(key) ? JSON.parse(mem.docs[key]) : null;
}

export async function set(key, value, ttlSeconds) {
  const s = JSON.stringify(value), ttl = Math.round(+ttlSeconds) || 0;
  if (useRedis()) {
    try { await (ttl > 0 ? redis('SET', key, s, 'EX', String(ttl)) : redis('SET', key, s)); return; }
    catch (e) { down('set', e); }
  }
  mem.docs[key] = s;
  if (ttl > 0) memExp[key] = Date.now() + ttl * 1000; else delete memExp[key];
}

export async function list(prefix, max = 1000) {
  if (useRedis()) {
    try {
      const keys = [];
      let cursor = '0';
      do {
        const [next, batch] = await redis('SCAN', cursor, 'MATCH', prefix + '*', 'COUNT', '200');
        cursor = String(next);
        keys.push(...batch.filter((k) => !k.endsWith(':lock')));
      } while (cursor !== '0' && keys.length < max);
      const ks = keys.slice(0, max);
      if (!ks.length) return [];
      const vals = await redis('MGET', ...ks);
      return ks.map((key, i) => ({ key, value: vals[i] == null ? null : JSON.parse(vals[i]) })).filter((r) => r.value != null);
    } catch (e) { down('list', e); }
  }
  return Object.keys(mem.docs).filter((k) => k.startsWith(prefix) && memAlive(k)).slice(0, max)
    .map((key) => ({ key, value: JSON.parse(mem.docs[key]) }));
}
