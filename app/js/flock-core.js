// Pengbit Flock, client side: local training, federated evaluation and the upload format.
// Used by the phone (flock-ui.js) and by the simulated penguins on the Flock screen.
import { MLP, ACTS } from './activity.js';
import { featureStats } from './fedavg.js';

export const API = 'api/flock';

// Every 5th recorded window is held out: never trained on, only used to score the flock model.
export function split(rows) {
  const train = [], test = [];
  rows.forEach((r, i) => (i % 5 === 4 ? test : train).push(r));
  return { train, test };
}

export function toMLP(global) {
  return new MLP({ nIn: global.nIn, nH: global.nH, nOut: global.nOut,
    W1: global.W1.map((r) => r.slice()), b1: global.b1.slice(), W2: global.W2.map((r) => r.slice()), b2: global.b2.slice(),
    mu: global.mu ? global.mu.slice() : undefined, sd: global.sd ? global.sd.slice() : undefined });
}

export function evaluate(global, rows) {
  if (!global?.mu || !rows.length) return null;
  const m = toMLP(global);
  const correct = rows.filter((d) => m.predict(d.f).act === d.label).length;
  return { correct, total: rows.length, acc: correct / rows.length };
}

// One FedAvg local step: start from the global model, fine-tune on this phone's windows.
export function localUpdate(global, rows, { epochs = 20, lr = 0.008 } = {}) {
  const m = toMLP(global);
  m.train(rows, { epochs, lr, valFrac: 0, warm: true });
  const counts = Object.fromEntries(ACTS.map((a) => [a, rows.filter((r) => r.label === a).length]));
  const j = m.toJSON();
  return {
    model: { W1: j.W1, b1: j.b1, W2: j.W2, b2: j.b2, mu: j.mu, sd: j.sd },
    stats: featureStats(rows.map((r) => r.f)),
    n: rows.length,
    counts,
  };
}

const round6 = (x) => Array.isArray(x) ? x.map(round6)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round6(v)]))
  : +(+x).toPrecision(6);

// Exactly what leaves the phone for an update. Shown in the UI under "See exactly what gets sent".
export function updatePayload(client, baseRound, up) {
  return {
    op: 'update', client, baseRound, n: up.n, counts: up.counts,
    model: round6(up.model),
    stats: { n: up.stats.n, sum: round6(up.stats.sum), sumsq: round6(up.stats.sumsq) },
  };
}

export async function post(body, base = '') {
  const r = await fetch(base + API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `flock ${r.status}`);
  return j;
}

export async function getState(base = '') {
  const r = await fetch(base + API, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`flock ${r.status}`);
  return r.json();
}

export function newId() {
  const a = new Uint8Array(9); crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
