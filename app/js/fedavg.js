// Pebblebit Flock: federated averaging math. Pure functions, shared by the phone and the server.
// No DOM, no raw data: everything here works on model weights and summary statistics only.
//
// The activity MLP standardizes its 12 input features with (f - mu) / sd before the first layer.
// Phones may train with different mu/sd, so before averaging the server rewrites each phone's first
// layer for one shared mu/sd. That rewrite is exact: the model's predictions don't change.

export const SHAPE = { nIn: 12, nH: 16, nOut: 3 };
export const PARAM_COUNT = SHAPE.nH * SHAPE.nIn + SHAPE.nH + SHAPE.nOut * SHAPE.nH + SHAPE.nOut; // 259

// Small seeded PRNG so every server instance starts the flock from the same random model.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function initialModel(seed = 2026) {
  const rnd = mulberry32(seed);
  const randn = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const { nIn, nH, nOut } = SHAPE;
  return {
    ...SHAPE,
    W1: Array.from({ length: nH }, () => Array.from({ length: nIn }, () => randn() * Math.sqrt(1 / nIn))),
    b1: new Array(nH).fill(0),
    W2: Array.from({ length: nOut }, () => Array.from({ length: nH }, () => randn() * Math.sqrt(1 / nH))),
    b2: new Array(nOut).fill(0),
    mu: null, sd: null,   // set once the first phones share their feature averages
  };
}

// Feature summary a phone shares: count, per-feature sum and sum of squares. Not the windows.
export function featureStats(rows) {
  const F = SHAPE.nIn, sum = new Array(F).fill(0), sumsq = new Array(F).fill(0);
  for (const f of rows) for (let i = 0; i < F; i++) { sum[i] += f[i]; sumsq[i] += f[i] * f[i]; }
  return { n: rows.length, sum, sumsq };
}

export function pooledNorm(statsList) {
  const F = SHAPE.nIn, sum = new Array(F).fill(0), sumsq = new Array(F).fill(0);
  let n = 0;
  for (const s of statsList) { if (!s || !s.n) continue; n += s.n; for (let i = 0; i < F; i++) { sum[i] += s.sum[i]; sumsq[i] += s.sumsq[i]; } }
  if (!n) return null;
  const mu = sum.map((v) => v / n);
  const sd = sumsq.map((v, i) => { const s = Math.sqrt(Math.max(0, v / n - mu[i] * mu[i])); return s > 1e-6 ? s : 1; });
  return { mu, sd };
}

// Rewrite the first layer so the model expects inputs standardized with (mu2, sd2) instead of (mu, sd).
export function renormalize(m, mu2, sd2) {
  if (!m.mu || !m.sd) return { ...m, mu: mu2, sd: sd2 };
  const W1 = m.W1.map((row) => row.map((w, i) => w * sd2[i] / m.sd[i]));
  const b1 = m.b1.map((b, j) => b + m.W1[j].reduce((s, w, i) => s + w * (mu2[i] - m.mu[i]) / m.sd[i], 0));
  return { ...m, W1, b1, W2: m.W2, b2: m.b2, mu: mu2, sd: sd2 };
}

// FedAvg: weighted mean of every parameter. updates: [{model, weight}], all with the same mu/sd.
export function fedAverage(updates) {
  const total = updates.reduce((s, u) => s + u.weight, 0);
  const avg = (get) => {
    const first = get(updates[0].model);
    if (Array.isArray(first[0])) return first.map((row, r) => row.map((_, c) => updates.reduce((s, u) => s + get(u.model)[r][c] * u.weight, 0) / total));
    return first.map((_, i) => updates.reduce((s, u) => s + get(u.model)[i] * u.weight, 0) / total);
  };
  return { W1: avg((m) => m.W1), b1: avg((m) => m.b1), W2: avg((m) => m.W2), b2: avg((m) => m.b2) };
}

// Check a model sent by a phone: right shapes, finite, bounded. Returns a clean copy or null.
export function cleanWeights(m, limit = 50) {
  if (!m || typeof m !== 'object') return null;
  const { nIn, nH, nOut } = SHAPE;
  const vec = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => Number.isFinite(+v) && Math.abs(+v) <= limit) ? a.map(Number) : null;
  const mat = (a, r, c) => Array.isArray(a) && a.length === r ? (a.map((row) => vec(row, c)).every(Boolean) ? a.map((row) => vec(row, c)) : null) : null;
  const W1 = mat(m.W1, nH, nIn), b1 = vec(m.b1, nH), W2 = mat(m.W2, nOut, nH), b2 = vec(m.b2, nOut);
  if (!W1 || !b1 || !W2 || !b2) return null;
  let mu = null, sd = null;
  if (m.mu != null || m.sd != null) {
    mu = vec(m.mu, nIn); sd = vec(m.sd, nIn);
    if (!mu || !sd || sd.some((v) => v <= 1e-6)) return null;
  }
  return { ...SHAPE, W1, b1, W2, b2, mu, sd };
}

export function cleanStats(s) {
  const F = SHAPE.nIn;
  if (!s || !Number.isFinite(+s.n) || s.n < 1 || s.n > 100000) return null;
  const ok = (a) => Array.isArray(a) && a.length === F && a.every((v) => Number.isFinite(+v));
  if (!ok(s.sum) || !ok(s.sumsq)) return null;
  return { n: Math.round(+s.n), sum: s.sum.map(Number), sumsq: s.sumsq.map(Number) };
}
