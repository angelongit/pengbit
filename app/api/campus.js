// Pebblebit Campus Wellness (W9): anonymous, opt-in activity by campus place.
// Phones POST only today's rounded walk and sit minutes for a place they picked from a fixed list
// (no GPS). Device ids are hashed before storage. A place is shown only when 3+ devices shared there,
// so no individual can be picked out.
//
// GET  /api/campus[?day=YYYY-MM-DD] -> { day, places: [{ id, label, sitMin, walkMin, users }], hidden, minUsers, store }
// POST /api/campus { deviceId, place, day, walkMin, stillMin } -> { ok }
import crypto from 'node:crypto';
import { updateDoc, readDoc, storeKind } from './_store.js';

const KEY = process.env.CAMPUS_KEY || 'pengbit:campus:v1';
const MIN_USERS = Math.max(1, +process.env.CAMPUS_MIN_USERS || 3);
const KEEP_DAYS = 7;

export const PLACES = [
  { id: 'library', label: 'Evans Library' },
  { id: 'msc', label: 'MSC' },
  { id: 'engineering', label: 'Zachry Engineering' },
  { id: 'rec', label: 'Rec Center' },
  { id: 'dorms', label: 'Residence halls' },
  { id: 'home', label: 'Off campus / home' },
];
const PLACE_IDS = new Set(PLACES.map((p) => p.id));

const isDay = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const today = () => new Date().toISOString().slice(0, 10);
const mins = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1440, Math.round(+v))) : 0);
const hashId = (id) => crypto.createHash('sha256').update('pebblebit-campus|' + String(id)).digest('hex').slice(0, 16);

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function summarize(doc, day) {
  const byPlace = doc?.days?.[day] || {};
  const places = [];
  let hidden = 0;
  for (const p of PLACES) {
    const devs = Object.values(byPlace[p.id] || {});
    if (!devs.length) continue;
    if (devs.length < MIN_USERS) { hidden++; continue; }
    places.push({
      id: p.id, label: p.label, users: devs.length,
      sitMin: devs.reduce((s, d) => s + d.stillMin, 0),
      walkMin: devs.reduce((s, d) => s + d.walkMin, 0),
    });
  }
  return { day, places, hidden, minUsers: MIN_USERS };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const day = isDay(url.searchParams.get('day')) ? url.searchParams.get('day') : today();
      return res.status(200).json({ ...summarize(await readDoc(KEY), day), store: storeKind() });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = body(req);
    if (!b.deviceId || !PLACE_IDS.has(b.place)) return res.status(400).json({ error: 'deviceId and a known place are required' });
    const day = isDay(b.day) ? b.day : today();
    const dev = hashId(b.deviceId);
    await updateDoc(KEY, (doc) => {
      doc = doc || { v: 1, days: {} };
      const d = (doc.days[day] = doc.days[day] || {});
      for (const pid of Object.keys(d)) if (pid !== b.place) delete d[pid]?.[dev];   // one place per device per day
      (d[b.place] = d[b.place] || {})[dev] = { walkMin: mins(b.walkMin), stillMin: mins(b.stillMin), at: Date.now() };
      for (const old of Object.keys(doc.days).sort().slice(0, -KEEP_DAYS)) delete doc.days[old];
      return { doc };
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('campus', e);
    return res.status(500).json({ error: 'campus failed' });
  }
}
