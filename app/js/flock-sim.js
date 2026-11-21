// Simulated penguins for the Flock screen, so the demo runs with one phone or none.
// They generate synthetic accelerometer traces (50 Hz), run the real feature extractor on them,
// and then follow the same protocol as a phone. They are always labeled "sim".
import { features, ACTS } from './activity.js';
import { evaluate, localUpdate, updatePayload, post, newId } from './flock-core.js';

function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// One 2 s window of {t, x, y, z} in g for an activity, with a random phone orientation.
export function synthWindow(act, style = 1) {
  const n = 100, dt = 20;
  // random gravity direction (phone tilt / pocket)
  const th = Math.random() * Math.PI, ph = Math.random() * 2 * Math.PI;
  const g = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
  const f = 1.4 + Math.random() * 0.9, amp = (0.06 + Math.random() * 0.3) * style;
  const sf = 2.5 + Math.random() * 4.5, samp = 0.3 + Math.random() * 1.7;
  const axis = [randn(), randn(), randn()]; const an = Math.hypot(...axis); axis.forEach((v, i) => axis[i] = v / an);
  const phase = Math.random() * 6.28;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt, s = t / 1000;
    let a = [0, 0, 0], noise = 0.008;
    if (act === 'walk') {
      const bump = amp * (Math.sin(2 * Math.PI * f * s + phase) + 0.4 * Math.sin(4 * Math.PI * f * s + phase));
      a = g.map((gv) => gv * bump);
      a[0] += 0.08 * style * Math.sin(Math.PI * f * s); noise = 0.04;
    } else if (act === 'shake') {
      const k = samp * Math.sin(2 * Math.PI * sf * s + phase) + 0.3 * randn();
      a = axis.map((v) => v * k); noise = 0.15;
    } else { noise = 0.004 + Math.random() * 0.03; }   // still: desk to fidgety hand
    out.push({ t, x: g[0] + a[0] + randn() * noise, y: g[1] + a[1] + randn() * noise, z: g[2] + a[2] + randn() * noise });
  }
  return out;
}

export function synthRows(mix, nPerRound = 30, style = 1) {
  const rows = [];
  const tot = ACTS.reduce((s, a) => s + (mix[a] || 0), 0);
  for (const a of ACTS) {
    const k = Math.round(nPerRound * (mix[a] || 0) / tot);
    for (let i = 0; i < k; i++) rows.push({ f: features(synthWindow(a, style)), label: a });
  }
  return rows.sort(() => Math.random() - 0.5);
}

const BOTS = [
  { name: 'Waddles', form: 'sprinter', mix: { walk: 8, still: 2, shake: 0 }, style: 1.2 },
  { name: 'Iceberg', form: 'frost', mix: { walk: 0, still: 8, shake: 1 }, style: 0.8 },
  { name: 'Static', form: 'glitch', mix: { walk: 1, still: 0, shake: 8 }, style: 1 },
  { name: 'Pebble', form: 'baby', mix: { walk: 3, still: 3, shake: 0 }, style: 1 },
];

// Non-IID on purpose: each bot mostly does one thing, like real students.
export class SimPenguin {
  constructor(i, base = '') {
    const b = BOTS[i % BOTS.length];
    this.base = base;
    this.spec = b;
    this.client = { id: 'sim' + newId().slice(0, 10), name: b.name, form: b.form, sim: true };
    this.rows = [];
    this.lastRound = -1; this.evaluated = -1;
  }

  // One step: score the current flock model on a fresh balanced test set (walk, still and shake,
  // like a judge's phone would see), then fine-tune it on this bot's own skewed data and send weights.
  async step(state) {
    this.rows.push(...synthRows(this.spec.mix, 20, this.spec.style));
    if (this.rows.length > 300) this.rows.splice(0, this.rows.length - 300);
    const train = this.rows, test = synthRows({ walk: 1, still: 1, shake: 1 }, 30);
    if (state.round !== this.evaluated) {
      const ev = evaluate(state.global, test);
      if (ev) { await post({ op: 'eval', client: this.client, round: state.round, correct: ev.correct, total: ev.total }, this.base); }
      this.evaluated = state.round;
    }
    if (state.round === this.lastRound || state.pending.ids.includes(this.client.id)) return null;
    const up = localUpdate(state.global, train, { epochs: 4, lr: 0.002 });   // small steps so the climb is visible
    this.lastRound = state.round;
    return post(updatePayload(this.client, state.round, up), this.base);
  }
}
