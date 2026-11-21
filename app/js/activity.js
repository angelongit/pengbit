// Phone motion -> walk / still / shake.
// Samples come from DeviceMotionEvent (accelerationIncludingGravity, converted to g).
// Every HOP_MS we take the last WINDOW_MS of samples, compute features, and classify
// with the trained model (ML) or, if there is none, the threshold rules from the firmware.

export const ACTS = ['still', 'walk', 'shake'];
export const WINDOW_MS = 2000;
export const HOP_MS = 1000;

// Threshold fallback (g). Same idea as firmware/pet/activity.cpp, tuned for a phone.
export const THRESH = { SHAKE_MEAN: 0.5, SHAKE_PEAK: 1.8, WALK_MEAN: 0.07 };

export const FEATURE_NAMES = [
  'meanDev', 'stdMag', 'peakDev', 'rangeMag', 'jerk',
  'stdX', 'stdY', 'stdZ', 'zeroCross', 'periodicity', 'bigFrac', 'logEnergy',
];

const G = 9.80665;

function mean(a) { let s = 0; for (const v of a) s += v; return a.length ? s / a.length : 0; }
function std(a, m = mean(a)) { let s = 0; for (const v of a) s += (v - m) * (v - m); return a.length ? Math.sqrt(s / a.length) : 0; }

// samples: [{t, x, y, z}] in ms and g.
export function features(samples) {
  const n = samples.length;
  if (n < 8) return null;
  const xs = samples.map((s) => s.x), ys = samples.map((s) => s.y), zs = samples.map((s) => s.z);
  const mag = samples.map((s) => Math.hypot(s.x, s.y, s.z));
  const dev = mag.map((m) => Math.abs(m - 1));
  const mMag = mean(mag);
  const dur = Math.max(0.2, (samples[n - 1].t - samples[0].t) / 1000);
  const rate = (n - 1) / dur;

  let jerk = 0, zc = 0, big = 0, energy = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    if (dev[i] > peak) peak = dev[i];
    if (dev[i] > 0.5) big++;
    energy += (mag[i] - 1) * (mag[i] - 1);
    if (i > 0) {
      jerk += Math.abs(mag[i] - mag[i - 1]);
      if ((mag[i] - mMag) * (mag[i - 1] - mMag) < 0) zc++;
    }
  }

  // Periodicity: best normalized autocorrelation for lags of 0.3-1.2 s (steps are periodic).
  const c = mag.map((m) => m - mMag);
  let c0 = 0; for (const v of c) c0 += v * v;
  let best = 0;
  if (c0 > 1e-6) {
    const lo = Math.max(1, Math.round(0.3 * rate)), hi = Math.min(n - 2, Math.round(1.2 * rate));
    for (let lag = lo; lag <= hi; lag++) {
      let s = 0; for (let i = 0; i + lag < n; i++) s += c[i] * c[i + lag];
      const r = s / c0 * n / (n - lag);
      if (r > best) best = r;
    }
  }

  return [
    mean(dev), std(mag, mMag), peak, Math.max(...mag) - Math.min(...mag), jerk / (n - 1) * rate / 50,
    std(xs), std(ys), std(zs), zc / dur / 10, Math.min(1, best), big / n, Math.log1p(energy / n * 100),
  ];
}

export function thresholdClassify(f) {
  const [meanDev, , peak] = f;
  if (meanDev > THRESH.SHAKE_MEAN || peak > THRESH.SHAKE_PEAK) return { act: 'shake', conf: 1 };
  if (meanDev > THRESH.WALK_MEAN) return { act: 'walk', conf: 1 };
  return { act: 'still', conf: 1 };
}

// ---------------------------------------------------------------- tiny MLP
// features (12) -> standardize -> dense 16 tanh -> dense 3 softmax. Trained in the browser with Adam.

function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const zeros = (r, c) => Array.from({ length: r }, () => new Float64Array(c));

export class MLP {
  // new MLP(savedJson) restores a model; new MLP(null, { nIn }) makes one for another feature count (Desk mode).
  constructor(json, { nIn = FEATURE_NAMES.length, nH = 16 } = {}) {
    if (json) { Object.assign(this, json); return; }
    this.nIn = nIn; this.nH = nH; this.nOut = ACTS.length;
  }

  init() {
    const { nIn, nH, nOut } = this;
    this.W1 = Array.from({ length: nH }, () => Array.from({ length: nIn }, () => randn() * Math.sqrt(1 / nIn)));
    this.b1 = new Array(nH).fill(0);
    this.W2 = Array.from({ length: nOut }, () => Array.from({ length: nH }, () => randn() * Math.sqrt(1 / nH)));
    this.b2 = new Array(nOut).fill(0);
  }

  norm(f) { return f.map((v, i) => (v - this.mu[i]) / this.sd[i]); }

  forward(x) {
    const h = this.W1.map((row, j) => Math.tanh(row.reduce((s, w, i) => s + w * x[i], this.b1[j])));
    const z = this.W2.map((row, k) => row.reduce((s, w, j) => s + w * h[j], this.b2[k]));
    const mx = Math.max(...z);
    const e = z.map((v) => Math.exp(v - mx));
    const sum = e.reduce((a, b) => a + b, 0);
    return { h, p: e.map((v) => v / sum) };
  }

  predict(f) {
    const { p } = this.forward(this.norm(f));
    let k = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[k]) k = i;
    return { act: ACTS[k], conf: p[k], probs: p };
  }

  // data: [{f, label}] -> trains in place. Returns {trainAcc, valAcc, confusion, nTrain, nVal}.
  // warm: keep the current weights and mu/sd and fine-tune them (Pengbit Flock local update).
  train(data, { epochs = 400, lr = 0.02, l2 = 1e-3, valFrac = 0.2, onEpoch, warm = false } = {}) {
    // Stratified shuffle split.
    const train = [], val = [];
    for (const a of ACTS) {
      const rows = data.filter((d) => d.label === a).sort(() => Math.random() - 0.5);
      const nv = rows.length >= 5 ? Math.max(1, Math.round(rows.length * valFrac)) : 0;
      val.push(...rows.slice(0, nv)); train.push(...rows.slice(nv));
    }
    const F = this.nIn;
    if (!warm || !this.mu) {
      this.mu = Array.from({ length: F }, (_, i) => mean(train.map((d) => d.f[i])));
      this.sd = Array.from({ length: F }, (_, i) => std(train.map((d) => d.f[i]), this.mu[i]) || 1);
    }
    if (!warm || !this.W1) this.init();

    const X = train.map((d) => this.norm(d.f));
    const Y = train.map((d) => ACTS.indexOf(d.label));
    const params = ['W1', 'b1', 'W2', 'b2'];
    const m = {}, v = {};
    for (const p of params) { m[p] = JSON.parse(JSON.stringify(this[p])); v[p] = JSON.parse(JSON.stringify(this[p])); zeroOut(m[p]); zeroOut(v[p]); }
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;

    for (let ep = 1; ep <= epochs; ep++) {
      const gW1 = zeros(this.nH, this.nIn), gb1 = new Float64Array(this.nH);
      const gW2 = zeros(this.nOut, this.nH), gb2 = new Float64Array(this.nOut);
      let loss = 0;
      for (let n = 0; n < X.length; n++) {
        const x = X[n], { h, p } = this.forward(x);
        loss -= Math.log(p[Y[n]] + 1e-12);
        const dz = p.map((pk, k) => pk - (k === Y[n] ? 1 : 0));
        const dh = new Float64Array(this.nH);
        for (let k = 0; k < this.nOut; k++) {
          gb2[k] += dz[k];
          for (let j = 0; j < this.nH; j++) { gW2[k][j] += dz[k] * h[j]; dh[j] += dz[k] * this.W2[k][j]; }
        }
        for (let j = 0; j < this.nH; j++) {
          const da = dh[j] * (1 - h[j] * h[j]);
          gb1[j] += da;
          for (let i = 0; i < this.nIn; i++) gW1[j][i] += da * x[i];
        }
      }
      const N = X.length || 1;
      const grads = { W1: gW1, b1: gb1, W2: gW2, b2: gb2 };
      for (const p of params) adam(this[p], grads[p], m[p], v[p], ep, lr, N, p.startsWith('W') ? l2 : 0, b1, b2, eps);
      if (onEpoch && ep % 50 === 0) onEpoch(ep, loss / N);
    }

    const acc = (rows) => rows.length ? rows.filter((d) => this.predict(d.f).act === d.label).length / rows.length : null;
    const confusion = ACTS.map((t) => ACTS.map((p) => (val.length ? val : train).filter((d) => d.label === t && this.predict(d.f).act === p).length));
    this.trainedAt = new Date().toISOString();
    this.stats = { trainAcc: acc(train), valAcc: acc(val), confusion, nTrain: train.length, nVal: val.length, confusionOn: val.length ? 'validation' : 'train' };
    return this.stats;
  }

  toJSON() {
    const { nIn, nH, nOut, W1, b1, W2, b2, mu, sd, trainedAt, stats } = this;
    return { kind: 'pengbit-mlp', version: 1, features: nIn === FEATURE_NAMES.length ? FEATURE_NAMES : undefined, labels: ACTS, nIn, nH, nOut,
      W1, b1: Array.from(b1), W2, b2: Array.from(b2), mu, sd, trainedAt, stats };
  }
}

function zeroOut(a) { for (let i = 0; i < a.length; i++) { if (Array.isArray(a[i])) zeroOut(a[i]); else a[i] = 0; } }

function adam(P, G, M, V, t, lr, N, l2, b1, b2, eps) {
  const upd = (row, grow, mrow, vrow) => {
    for (let i = 0; i < row.length; i++) {
      const g = grow[i] / N + l2 * row[i];
      mrow[i] = b1 * mrow[i] + (1 - b1) * g;
      vrow[i] = b2 * vrow[i] + (1 - b2) * g * g;
      const mh = mrow[i] / (1 - Math.pow(b1, t)), vh = vrow[i] / (1 - Math.pow(b2, t));
      row[i] -= lr * mh / (Math.sqrt(vh) + eps);
    }
  };
  if (Array.isArray(P[0])) for (let r = 0; r < P.length; r++) upd(P[r], G[r], M[r], V[r]);
  else upd(P, G, M, V);
}

// ---------------------------------------------------------------- live detector

export class ActivityDetector {
  constructor() {
    this.buf = [];
    this.model = null;            // MLP or null -> thresholds
    this.last = { act: 'still', conf: 1, source: 'none' };
    this.history = [];            // last few raw predictions for smoothing
    this.onWindow = null;         // (features, result) => void, every HOP_MS
    this.sim = null;              // 'walk' | 'still' | 'shake' when simulating (no sensor)
    this.lastSampleAt = 0;
    this.timer = null;
  }

  get hasSensor() { return performance.now() - this.lastSampleAt < 1500; }

  addSample(t, xg, yg, zg) {
    this.lastSampleAt = t;
    this.buf.push({ t, x: xg, y: yg, z: zg });
    while (this.buf.length && t - this.buf[0].t > WINDOW_MS) this.buf.shift();
  }

  handleMotion = (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    this.addSample(performance.now(), a.x / G, a.y / G, a.z / G);
  };

  start() {
    window.addEventListener('devicemotion', this.handleMotion);
    this.timer = setInterval(() => this.step(), HOP_MS);
  }

  step() {
    if (this.sim) {
      this.last = { act: this.sim, conf: 1, source: 'sim' };
      this.onWindow && this.onWindow(null, this.last);
      return;
    }
    if (!this.hasSensor) { this.last = { act: 'still', conf: 0, source: 'none' }; this.onWindow && this.onWindow(null, this.last); return; }
    const f = features(this.buf);
    if (!f) return;
    const raw = this.model ? { ...this.model.predict(f), source: 'ml' } : { ...thresholdClassify(f), source: 'thresholds' };
    // Majority vote over the last 3 windows so one odd window doesn't flip the pet.
    this.history.push(raw.act); if (this.history.length > 3) this.history.shift();
    const counts = {}; for (const a of this.history) counts[a] = (counts[a] || 0) + 1;
    const act = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    this.last = { ...raw, act, rawAct: raw.act };
    this.onWindow && this.onWindow(f, this.last);
  }
}

// iOS 13+ needs a user tap to allow motion events.
export async function requestMotionPermission() {
  const DM = window.DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') {
    try { return (await DM.requestPermission()) === 'granted'; } catch { return false; }
  }
  return true;
}
