// Rep counter checks on synthetic pose sequences. Run: node app/test/reps.test.mjs
import { SquatCounter, RaiseCounter, ReachHold, MotionReps } from '../js/reps.js';
const P = (x, y, v = 0.99) => ({ x, y, visibility: v });
function body({ sh = 0.3, hip = 0.5, knee = 0.7, ank = 0.9, wrist = 0.55, kneeW = 0.08, lean = 0, legsVis = 0.99, ex = {} }) {
  const lm = Array.from({ length: 33 }, () => P(0.5, 0.5, 0.1));
  lm[0] = P(0.5 + lean, sh - 0.08);
  lm[11] = P(0.42 + lean, sh); lm[12] = P(0.58 + lean, sh);
  lm[13] = P(0.38, (sh + (ex.wl ?? wrist)) / 2); lm[14] = P(0.62, (sh + (ex.wr ?? wrist)) / 2);
  lm[15] = P(0.37, ex.wl ?? wrist); lm[16] = P(0.63, ex.wr ?? wrist);
  lm[23] = P(0.45, hip); lm[24] = P(0.55, hip);
  lm[25] = P(0.5 - kneeW, knee, legsVis); lm[26] = P(0.5 + kneeW, knee, legsVis);
  lm[27] = P(0.42, ank, legsVis); lm[28] = P(0.58, ank, legsVis);
  return lm;
}
const lerp = (a, b, t) => a + (b - a) * t;
function squat(c, depthHip, n = 1, opts = {}) {
  let st;
  for (let k = 0; k < n; k++) for (let i = 0; i <= 40; i++) {
    const t = Math.sin(i / 40 * Math.PI);
    st = c.update(body({ sh: lerp(0.3, 0.3 + (depthHip - 0.5), t), hip: lerp(0.5, depthHip, t), knee: lerp(0.7, 0.72, t), lean: (opts.lean || 0) * t, kneeW: lerp(0.08, opts.kneeW ?? 0.1, t), legsVis: opts.legsVis }), i * 33);
  }
  return st;
}
let ok = true; const check = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info ?? ''); ok &&= cond; };
let c = new SquatCounter();
for (let i = 0; i < 10; i++) c.update(body({}));
let s = squat(c, 0.66, 10); check('10 deep squats counted', s.count === 10 && s.done, s.count + ' ' + s.feedback);
check('clean form score', c.formScore === 1, c.formScore);
c = new SquatCounter(); for (let i = 0; i < 10; i++) c.update(body({}));
s = squat(c, 0.58, 3); check('3 half squats not counted', s.count === 0, s.count + ' fb=' + s.feedback);
c = new SquatCounter(); for (let i = 0; i < 10; i++) c.update(body({}));
s = squat(c, 0.66, 2, { kneeW: 0.03 }); check('knee cave hint', s.count === 2 && /knees/.test(s.feedback), s.feedback + ' score=' + c.formScore);
c = new SquatCounter(); for (let i = 0; i < 10; i++) c.update(body({}));
s = squat(c, 0.66, 2, { lean: 0.3 }); check('lean hint', /chest/.test(s.feedback), s.feedback);
c = new SquatCounter(); for (let i = 0; i < 10; i++) c.update(body({ legsVis: 0.1 }));
s = squat(c, 0.66, 4, { legsVis: 0.1 }); check('upper-body mode counts', s.count === 4 && s.mode === 'upper', s.count + ' ' + s.mode);
// jitter: noisy standing should not count
c = new SquatCounter(); for (let i = 0; i < 300; i++) s = c.update(body({ hip: 0.5 + (Math.random() - 0.5) * 0.03, sh: 0.3 + (Math.random() - 0.5) * 0.03 }));
check('noise standing = 0', s.count === 0, s.count);
check('null = step into view', c.update(null).feedback === 'Step into view');

let r = new RaiseCounter();
for (let k = 0; k < 12; k++) { for (let i = 0; i < 6; i++) s = r.update(body({ wrist: 0.1 })); for (let i = 0; i < 6; i++) s = r.update(body({ wrist: 0.55 })); }
check('12 arm raises', s.count === 12 && s.done, s.count);
r = new RaiseCounter(); for (let i = 0; i < 6; i++) s = r.update(body({ ex: { wl: 0.1, wr: 0.55 } }));
check('one arm hint', s.count === 0 && /Both/.test(s.feedback), s.feedback);

let h = new ReachHold(); let t = 0;
for (let i = 0; i < 30 * 5; i++) { s = h.update(body({ wrist: 0.1 }), t); t += 33; }
check('hold 5 s -> 4-5', s.count >= 4 && s.count <= 5, s.count);
for (let i = 0; i < 30; i++) { s = h.update(body({ wrist: 0.55 }), t); t += 33; }
check('drop pauses', /Reach back/.test(s.feedback), s.feedback);
for (let i = 0; i < 30 * 6; i++) { s = h.update(body({ wrist: 0.1 }), t); t += 33; }
check('done at 10 s', s.done && s.count === 10, s.count + ' form ' + h.formScore);

const m = new MotionReps(10); let n = 0;
for (let k = 0; k < 10; k++) for (let i = 0; i < 60; i++) { const mag = 9.8 - 3 * Math.sin(i / 60 * 2 * Math.PI); m.update(mag, (k * 60 + i) * 20); }
check('motion reps 10', m.count === 10, m.count);
const m2 = new MotionReps(10); for (let i = 0; i < 500; i++) m2.update(9.8 + (Math.random() - .5) * 0.6, i * 20);
check('motion noise 0', m2.count === 0, m2.count);
process.exit(ok ? 0 : 1);
