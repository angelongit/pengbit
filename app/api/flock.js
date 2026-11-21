// Pebblebit Flock: federated learning server.
// Phones train the activity model on their own motion and POST only model weights, a sample count
// and feature averages. This endpoint averages them (FedAvg) into a global model and serves it back.
// It never receives raw motion data.
//
// GET  /api/flock                      -> public state: round, global model, flock roster, accuracy history
// POST /api/flock {op:'hello', client}  -> join / heartbeat, returns state
// POST /api/flock {op:'update', client, baseRound, model, stats, counts} -> queue a local update
// POST /api/flock {op:'eval', client, round, correct, total} -> federated evaluation on held-out phone data
// POST /api/flock {op:'aggregate'}      -> close the round now (Flock screen button)
// POST /api/flock {op:'reset', key}     -> start over (needs FLOCK_RESET_KEY)
import { initialModel, pooledNorm, renormalize, fedAverage, cleanWeights, cleanStats, PARAM_COUNT } from '../js/fedavg.js';
import { readDoc, updateDoc, storeKind } from './_store.js';

const KEY = process.env.FLOCK_KEY || 'pengbit:flock:v1';
const read = () => readDoc(KEY);
const update = (fn) => updateDoc(KEY, fn);

const MIN_UPDATES = Math.max(1, +process.env.FLOCK_MIN_UPDATES || 2);   // close a round after this many updates...
const ROUND_SECONDS = Math.max(3, +process.env.FLOCK_ROUND_SECONDS || 20); // ...or this long after the first one
const ACTIVE_MS = 3 * 60 * 1000;
const MAX_MEMBERS = 200, MAX_PENDING = 40, MAX_HISTORY = 60;

function freshDoc() {
  return { v: 1, round: 0, createdAt: Date.now(), global: initialModel(), pending: [], members: {}, history: [] };
}

const str = (v, n) => String(v ?? '').replace(/[^\w .'!-]/g, '').trim().slice(0, n);
const FORMS = ['egg', 'baby', 'sprinter', 'frost', 'glitch'];

function cleanClient(c = {}) {
  const id = str(c.id, 40).replace(/\s/g, '');
  if (id.length < 6) return null;
  return { id, name: str(c.name, 14) || 'Pebblebit', form: FORMS.includes(c.form) ? c.form : 'baby', sim: !!c.sim };
}

function touch(doc, c) {
  let m = doc.members[c.id];
  if (!m) {
    if (Object.keys(doc.members).length >= MAX_MEMBERS) {
      // Drop the longest-idle member to make room.
      const old = Object.values(doc.members).sort((a, b) => a.lastSeen - b.lastSeen)[0];
      delete doc.members[old.id];
    }
    m = doc.members[c.id] = { id: c.id, joinedAt: Date.now(), contributions: 0, samples: 0, stats: null, lastAcc: null };
  }
  Object.assign(m, { name: c.name, form: c.form, sim: c.sim, lastSeen: Date.now() });
  return m;
}

function aggregate(doc, reason) {
  const ups = doc.pending;
  if (!ups.length) return false;
  // Shared normalization from every member's feature averages (sums, not data).
  const norm = pooledNorm(Object.values(doc.members).map((m) => m.stats)) || { mu: ups[0].model.mu, sd: ups[0].model.sd };
  const updates = ups.map((u) => ({
    model: renormalize(u.model, norm.mu, norm.sd),
    // Weight by sample count, and trust updates trained on an older global model a bit less.
    weight: u.n / Math.sqrt(1 + Math.max(0, doc.round - u.baseRound)),
  }));
  const avg = fedAverage(updates);
  doc.global = { ...doc.global, ...avg, mu: norm.mu, sd: norm.sd };
  doc.round += 1;
  const ids = [...new Set(ups.map((u) => u.id))];
  for (const id of ids) if (doc.members[id]) doc.members[id].contributions += 1;
  doc.history.push({
    round: doc.round, at: Date.now(), reason, clients: ids.length,
    names: ids.map((id) => doc.members[id]?.name || '?').slice(0, 12),
    ids: ids.slice(0, 40),
    samples: ups.reduce((s, u) => s + u.n, 0), evals: {}, acc: null, evalN: 0,
  });
  if (doc.history.length > MAX_HISTORY) doc.history.splice(0, doc.history.length - MAX_HISTORY);
  doc.pending = [];
  return true;
}

function maybeAggregate(doc) {
  if (!doc.pending.length) return false;
  if (doc.pending.length >= MIN_UPDATES) return aggregate(doc, 'enough updates');
  if (Date.now() - doc.pending[0].at > ROUND_SECONDS * 1000) return aggregate(doc, 'timer');
  return false;
}

function publicState(doc, extra = {}) {
  const now = Date.now();
  const members = Object.values(doc.members)
    .map(({ stats, ...m }) => ({ ...m, active: now - m.lastSeen < ACTIVE_MS }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
  const pendingIds = doc.pending.map((p) => p.id);
  return {
    round: doc.round,
    global: doc.global,
    params: PARAM_COUNT,
    members,
    pending: { count: doc.pending.length, ids: pendingIds, needed: MIN_UPDATES, closesIn: doc.pending.length ? Math.max(0, Math.ceil((doc.pending[0].at + ROUND_SECONDS * 1000 - now) / 1000)) : null },
    history: doc.history.map(({ evals, ...h }) => h),
    totals: {
      members: members.length, active: members.filter((m) => m.active).length,
      samplesOnPhones: Object.values(doc.members).reduce((s, m) => s + (m.samples || 0), 0),
      rawBytesReceived: 0,
    },
    store: storeKind(),
    serverTime: now,
    ...extra,
  };
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      let doc = await read();
      // Close a round whose timer ran out even if no phone is posting right now.
      if (!doc || (doc.pending.length && Date.now() - doc.pending[0].at > ROUND_SECONDS * 1000)) {
        const out = await update(async (d) => { d = d || freshDoc(); maybeAggregate(d); return { doc: d }; });
        doc = out.doc;
      }
      return res.status(200).json(publicState(doc));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });

    const b = body(req);
    const op = b.op;

    if (op === 'reset') {
      const key = process.env.FLOCK_RESET_KEY;
      if (!key || b.key !== key) return res.status(403).json({ error: 'reset needs FLOCK_RESET_KEY' });
      const out = await update(async () => ({ doc: freshDoc() }));
      return res.status(200).json(publicState(out.doc, { ok: true }));
    }

    if (op === 'aggregate') {
      const out = await update(async (d) => { d = d || freshDoc(); const did = aggregate(d, 'manual'); return { doc: d, did }; });
      return res.status(200).json(publicState(out.doc, { ok: true, aggregated: out.did }));
    }

    const c = cleanClient(b.client);
    if (!c) return res.status(400).json({ error: 'client.id required' });

    if (op === 'hello') {
      const out = await update(async (d) => { d = d || freshDoc(); touch(d, c); maybeAggregate(d); return { doc: d }; });
      return res.status(200).json(publicState(out.doc, { ok: true }));
    }

    if (op === 'update') {
      const model = cleanWeights(b.model);
      const stats = cleanStats(b.stats);
      const n = Math.round(+b.n);
      if (!model || !model.mu || !stats || !(n >= 1 && n <= 5000)) return res.status(400).json({ error: 'bad update' });
      const out = await update(async (d) => {
        d = d || freshDoc();
        const m = touch(d, c);
        m.stats = stats;
        m.samples = n;
        if (b.counts && typeof b.counts === 'object') m.counts = { walk: Math.max(0, +b.counts.walk | 0), still: Math.max(0, +b.counts.still | 0), shake: Math.max(0, +b.counts.shake | 0) };
        // One pending update per phone: a newer one replaces the older one.
        d.pending = d.pending.filter((p) => p.id !== c.id);
        if (d.pending.length >= MAX_PENDING) d.pending.shift();
        d.pending.push({ id: c.id, at: Date.now(), baseRound: Math.max(0, Math.min(d.round, +b.baseRound | 0)), n, model });
        const did = maybeAggregate(d);
        return { doc: d, did };
      });
      return res.status(200).json(publicState(out.doc, { ok: true, aggregated: out.did }));
    }

    if (op === 'eval') {
      const round = +b.round | 0, total = Math.round(+b.total), correct = Math.round(+b.correct);
      if (!(total >= 1 && total <= 5000 && correct >= 0 && correct <= total)) return res.status(400).json({ error: 'bad eval' });
      const out = await update(async (d) => {
        d = d || freshDoc();
        const m = touch(d, c);
        const h = d.history.find((x) => x.round === round);
        if (h) {
          h.evals = h.evals || {};
          h.evals[c.id] = [correct, total];
          const vals = Object.values(h.evals);
          const tc = vals.reduce((s, v) => s + v[0], 0), tt = vals.reduce((s, v) => s + v[1], 0);
          h.acc = tt ? tc / tt : null; h.evalN = vals.length;
        }
        if (round === d.round) m.lastAcc = correct / total;
        maybeAggregate(d);
        return { doc: d };
      });
      return res.status(200).json(publicState(out.doc, { ok: true }));
    }

    return res.status(400).json({ error: 'unknown op' });
  } catch (e) {
    console.error('flock', e);
    return res.status(500).json({ error: 'flock server error' });
  }
}
