// Shared pose AI (owned by W2 Exercise; reused by Desk mode and anyone else who needs pose).
// MediaPipe Pose Landmarker runs fully in the browser (WASM, GPU with CPU fallback). Video never
// leaves the device. One camera and one model for the whole app, so features never load it twice.
//
// API
//   loadPose() -> Promise<PoseLandmarker>
//       Loads the model once (about 6 MB, cached by the service worker). Safe to call early to
//       preload. pose.info = { delegate, model, version }.
//   startPoseCamera({ facing = 'user' }) -> Promise<handle>
//       Call from a user tap (iOS needs the gesture for the camera; HTTPS required). Opens the
//       camera, loads the model, and starts a detection loop that emits 'pose:frame' on the bus
//       for every new video frame. Shared: a second caller gets the same running camera (ref
//       counted). On failure it throws an Error with err.stage = 'camera' | 'model'.
//       handle = { video, facing, mirrored, info, stop() }   stop() releases your reference;
//       the camera turns off when the last user stops.
//   bus event 'pose:frame' { landmarks, worldLandmarks, t, width, height, mirrored, video }
//       landmarks: 33 points { x, y, z, visibility }, x/y normalized 0..1 in the raw (unmirrored)
//       video frame, y down; null when nobody is in view. worldLandmarks: meters, hip-centered.
//       t: performance.now() ms. mirrored: true for the front camera (draw with x -> 1 - x).
//   isPoseCameraRunning() -> boolean
//   drawSkeleton(ctx2d, landmarks, w, h, { mirrored, color }) draws the Y2K skeleton overlay.
//   LM (landmark indices), BONES (edges), angle(a, b, c) (degrees at b).
//
// Below that: rep counters for the exercise challenges. Pure logic, no DOM. Feed landmarks and
// get back a count plus form feedback. Every counter uses hysteresis (separate "down" and "up"
// thresholds) and needs a pose to hold for a couple of frames, so jitter can't double count.
import { emit } from './bus.js';

const MP_VERSION = '0.10.21';   // pinned
const MP_CDNS = [
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`,
  `https://unpkg.com/@mediapipe/tasks-vision@${MP_VERSION}`,
];
const POSE_MODELS = [
  'model/pose_landmarker_lite.task',   // same origin, cached by the service worker
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
];

// Loads once; later calls share the same promise. A failure clears it so a retry can work.
let posePromise = null;
export function loadPose() {
  if (!posePromise) posePromise = createPose().catch((e) => { posePromise = null; throw e; });
  return posePromise;
}
async function createPose() {
  let vision, base, lastErr;
  for (const cdn of MP_CDNS) {
    try { vision = await import(`${cdn}/vision_bundle.mjs`); base = cdn; break; } catch (e) { lastErr = e; }
  }
  if (!vision) throw lastErr || new Error('pose library unavailable');
  const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
  for (const model of POSE_MODELS) {
    for (const delegate of ['GPU', 'CPU']) {   // some phones (older iOS) fail on GPU
      try {
        const pose = await vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: model, delegate },
          runningMode: 'VIDEO', numPoses: 1,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        pose.info = { delegate, model: model.startsWith('http') ? 'cdn' : 'local', version: MP_VERSION };
        return pose;
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error('pose model unavailable');
}

// ---------------------------------------------------------------- shared camera + detection loop
let cam = null;   // { stream, video, facing, users, raf, lastT, pose, handle, stopped }

export function isPoseCameraRunning() { return !!cam; }

export async function startPoseCamera({ facing = 'user' } = {}) {
  if (cam && cam.facing === facing) { cam.users++; await cam.ready; return cam.handle; }
  if (cam) shutdown();
  const c = cam = { facing, users: 1, raf: 0, lastT: -1, stopped: false };
  c.ready = (async () => {
    // Camera first, while we are still inside the user's tap.
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera needs HTTPS');
      c.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    } catch (e) {
      if (cam === c) cam = null;
      throw Object.assign(new Error(e.name === 'NotAllowedError' ? 'Camera permission was denied.' : `No camera (${e.message || e.name}).`), { stage: 'camera', cause: e });
    }
    const v = c.video = document.createElement('video');
    v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.autoplay = true;
    // Rendered but invisible: iOS stops decoding display:none videos.
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    v.srcObject = c.stream;
    try { await v.play(); } catch {}
    try {
      c.pose = await Promise.race([loadPose(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 30000))]);
    } catch (e) {
      if (cam === c) shutdown();
      throw Object.assign(new Error(`The pose AI didn't load (${e.message || e}).`), { stage: 'model', cause: e });
    }
    if (c.stopped) throw Object.assign(new Error('stopped'), { stage: 'camera' });
    c.handle = {
      video: v, facing, mirrored: facing === 'user', info: c.pose.info,
      stop() { if (cam === c && --c.users <= 0) shutdown(); },
    };
    const loop = () => {
      if (c.stopped) return;
      c.raf = requestAnimationFrame(loop);
      if (v.readyState < 2 || !v.videoWidth || v.currentTime === c.lastT) return;   // new frames only
      c.lastT = v.currentTime;
      const t = performance.now();
      let res;
      try { res = c.pose.detectForVideo(v, t); } catch { return; }
      emit('pose:frame', {
        landmarks: res?.landmarks?.[0] || null, worldLandmarks: res?.worldLandmarks?.[0] || null,
        t, width: v.videoWidth, height: v.videoHeight, mirrored: facing === 'user', video: v,
      });
    };
    c.raf = requestAnimationFrame(loop);
    return c.handle;
  })();
  return c.ready;
}

function shutdown() {
  const c = cam;
  if (!c) return;
  cam = null; c.stopped = true;
  cancelAnimationFrame(c.raf);
  if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
  if (c.video) { c.video.srcObject = null; c.video.remove(); }
}

export function drawSkeleton(g, lm, w, h, { mirrored = false, color = '#9ff3ff' } = {}) {
  const X = (p) => (mirrored ? 1 - p.x : p.x) * w, Y = (p) => p.y * h;
  const vis = (p) => (p.visibility ?? 1) >= 0.4;
  g.save();
  g.lineWidth = Math.max(3, w / 110); g.lineCap = 'round';
  g.strokeStyle = color; g.shadowColor = '#ff47e0'; g.shadowBlur = 10;
  for (const [a, b] of BONES) {
    if (!vis(lm[a]) || !vis(lm[b])) continue;
    g.beginPath(); g.moveTo(X(lm[a]), Y(lm[a])); g.lineTo(X(lm[b]), Y(lm[b])); g.stroke();
  }
  g.shadowBlur = 0; g.fillStyle = '#ffd84a';
  const r = Math.max(4, w / 120);
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (vis(lm[i])) g.fillRect(X(lm[i]) - r, Y(lm[i]) - r, r * 2, r * 2);   // square pixel joints
  }
  g.restore();
}

export const LM = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};
// Skeleton edges for drawing.
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28]];

const VIS = 0.5;
const seen = (p) => p && (p.visibility ?? 1) >= VIS;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Angle at b (degrees) between b->a and b->c.
export function angle(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

export const EXERCISES = {
  squat: { name: 'Squats', target: 10, unit: 'reps', tip: 'Prop the phone up about 2 m away so I can see you from head to knees.', verb: 'squat', start: 'Squat down when you’re ready' },
  raise: { name: 'Arm raises', target: 12, unit: 'reps', tip: 'Sitting is fine. Upper body in view, raise both hands above your head.', verb: 'raise your arms', start: 'Raise both hands over your head' },
  reach: { name: 'Overhead stretch', target: 10, unit: 's', tip: 'Reach both hands high over your head and hold. Sitting is fine.', verb: 'reach up', start: 'Reach both hands over your head' },
};

// Base: counts frames a condition holds before switching phase.
class Counter {
  constructor(kind) {
    this.kind = kind; this.target = EXERCISES[kind].target;
    this.count = 0; this.phase = 'up'; this.streak = 0; this.feedback = EXERCISES[kind].start; this.depth = 0;
    this.cleanReps = 0;   // reps without a form hint, for formScore
  }
  get formScore() { return this.count ? this.cleanReps / this.count : 1; }
  get done() { return this.count >= this.target; }
  // Switch phase once `cond` held for `n` frames in a row.
  settle(cond, n = 2) { this.streak = cond ? this.streak + 1 : 0; return this.streak >= n; }
  state(extra = {}) {
    return { count: this.count, target: this.target, done: this.done, phase: this.phase, depth: this.depth, feedback: this.feedback, ...extra };
  }
}

// Squats. Two depth measures, whichever the camera can see:
//  legs:  r = thigh drop / shin length = (kneeY - hipY) / (ankleY - kneeY). About 1 standing,
//         near 0 at parallel. Works from the front and the side, independent of distance.
//  upper: shoulders drop / torso length, against a standing baseline (knees out of frame).
export class SquatCounter extends Counter {
  constructor() { super('squat'); this.base = { legs: null, upper: null, torso: null }; this.peak = 0; this.issues = new Set(); }

  update(lm) {
    if (!lm) { this.feedback = 'Step into view'; return this.state({ visible: false }); }
    const sh = [lm[LM.lShoulder], lm[LM.rShoulder]], hip = [lm[LM.lHip], lm[LM.rHip]];
    const knee = [lm[LM.lKnee], lm[LM.rKnee]], ank = [lm[LM.lAnkle], lm[LM.rAnkle]];

    // Leg ratio from whichever sides are fully visible.
    const rs = [0, 1].filter((i) => seen(hip[i]) && seen(knee[i]) && seen(ank[i]))
      .map((i) => (knee[i].y - hip[i].y) / Math.max(0.02, ank[i].y - knee[i].y));
    const legs = rs.length ? rs.reduce((a, b) => a + b) / rs.length : null;

    let upper = null;
    if (seen(sh[0]) && seen(sh[1])) {
      const s = mid(sh[0], sh[1]);
      if (seen(hip[0]) && seen(hip[1])) {
        const t = dist(s, mid(hip[0], hip[1]));
        if (this.phase === 'up' && this.depth < 0.25) this.base.torso = this.base.torso == null ? t : this.base.torso * 0.9 + t * 0.1;
      }
      const torso = this.base.torso ?? dist(sh[0], sh[1]) * 1.4;
      upper = { y: s.y, torso };
    }
    if (legs == null && !upper) { this.feedback = 'Step back so I can see you'; return this.state({ visible: false }); }

    // Depth 0 (standing) .. 1 (counted squat).
    let depth;
    if (legs != null) {
      if (this.base.legs == null) this.base.legs = Math.max(legs, 0.6);
      depth = clamp01((this.base.legs - legs) / (this.base.legs * 0.45));   // counted below 55% of standing
    } else {
      if (this.base.upper == null) this.base.upper = upper.y;
      depth = clamp01((upper.y - this.base.upper) / (upper.torso * 0.35)); // shoulders drop 35% of torso
    }
    this.depth = depth;

    // Standing baselines follow slow drift (stepping closer or farther) only while standing.
    if (this.phase === 'up' && depth < 0.25) {
      if (legs != null) this.base.legs = this.base.legs * 0.9 + legs * 0.1;
      if (upper) this.base.upper = this.base.upper == null ? upper.y : this.base.upper * 0.9 + upper.y * 0.1;
    }

    if (this.phase === 'up') {
      this.peak = Math.max(this.peak, depth);
      if (this.settle(depth >= 1)) { this.phase = 'down'; this.streak = 0; this.issues.clear(); this.feedback = 'Now stand up'; }
      else if (depth >= 0.2) { if (!this.rising) this.feedback = 'Lower...'; }
      else {
        this.rising = false;   // standing again; a dip that never reached depth is a half rep
        if (this.peak > 0.4) this.feedback = 'Go a little lower';
        this.peak = 0;
      }
    } else {
      this.checkForm(lm, legs != null);
      if (this.settle(depth < 0.35)) {
        this.phase = 'up'; this.streak = 0; this.peak = 0; this.count++; this.rising = true;
        if (!this.issues.size) this.cleanReps++;
        this.feedback = this.issues.size ? [...this.issues][0] : ['Great depth!', 'Nice one!', 'Solid squat!'][this.count % 3];
      }
    }
    return this.state({ visible: true, mode: legs != null ? 'legs' : 'upper' });
  }

  checkForm(lm, legsVisible) {
    const ls = lm[LM.lShoulder], rs = lm[LM.rShoulder], lh = lm[LM.lHip], rh = lm[LM.rHip];
    if (seen(ls) && seen(rs) && seen(lh) && seen(rh)) {
      const s = mid(ls, rs), h = mid(lh, rh);
      const lean = Math.atan2(Math.abs(s.x - h.x), Math.max(1e-3, h.y - s.y)) * 180 / Math.PI;
      if (lean > 55 || h.y <= s.y) this.issues.add('Keep your chest up');
    }
    if (legsVisible) {
      const lk = lm[LM.lKnee], rk = lm[LM.rKnee], la = lm[LM.lAnkle], ra = lm[LM.rAnkle];
      const shoulderW = seen(ls) && seen(rs) ? dist(ls, rs) : 0;
      const ankleW = Math.abs(la.x - ra.x), kneeW = Math.abs(lk.x - rk.x);
      // Front view only (feet clearly apart): knees caving in toward each other.
      if (shoulderW && ankleW > shoulderW * 0.6 && kneeW < ankleW * 0.7) this.issues.add('Push your knees out');
    }
  }
}

// Arm raises: both wrists above the nose, then back below the shoulders.
export class RaiseCounter extends Counter {
  constructor() { super('raise'); this.issues = new Set(); }

  update(lm) {
    if (!lm) { this.feedback = 'Step into view'; return this.state({ visible: false }); }
    const ls = lm[LM.lShoulder], rs = lm[LM.rShoulder], lw = lm[LM.lWrist], rw = lm[LM.rWrist];
    if (!seen(ls) || !seen(rs)) { this.feedback = 'Show me your shoulders'; return this.state({ visible: false }); }
    const sw = dist(ls, rs), shY = (ls.y + rs.y) / 2;
    const top = seen(lm[LM.nose]) ? lm[LM.nose].y : shY - sw * 0.6;
    // Each wrist's height: 0 at shoulder line, 1 at the top line. Unseen wrist counts as down.
    const h = (w) => (seen(w) ? clamp01((shY - w.y) / Math.max(0.02, shY - top)) : 0);
    const hl = h(lw), hr = h(rw);
    this.depth = Math.min(hl, hr);

    if (this.phase === 'up') {   // 'up' = arms down, waiting for a raise
      if (this.settle(hl >= 1 && hr >= 1)) {
        this.phase = 'down'; this.streak = 0; this.issues.clear(); this.feedback = 'And down';
      } else if (Math.max(hl, hr) >= 1 && Math.min(hl, hr) < 0.6) this.feedback = 'Both arms up!';
      else if (this.depth > 0.2) this.feedback = 'Higher...';
    } else {
      const ok = (s, e, w) => !(seen(s) && seen(e) && seen(w)) || angle(s, e, w) > 140;
      if (!ok(ls, lm[LM.lElbow], lw) || !ok(rs, lm[LM.rElbow], rw)) this.issues.add('Straighten your arms');
      if (this.settle((seen(lw) ? lw.y > shY : true) && (seen(rw) ? rw.y > shY : true))) {
        this.phase = 'up'; this.streak = 0; this.count++;
        if (!this.issues.size) this.cleanReps++;
        this.feedback = this.issues.size ? [...this.issues][0] : ['Nice reach!', 'Good!', 'Keep going!'][this.count % 3];
      }
    }
    return this.state({ visible: true });
  }
}

// Reach stretch: hold both hands above the head; the timer only runs while they stay up.
export class ReachHold extends Counter {
  constructor() { super('reach'); this.held = 0; this.last = null; this.drops = 0; this.wasUp = false; }
  get formScore() { return Math.max(0, 1 - this.drops * 0.25); }   // each time the arms drop costs a bit

  update(lm, t = performance.now()) {
    const dt = this.last == null ? 0 : Math.min(0.5, (t - this.last) / 1000);
    this.last = t;
    if (!lm) { this.feedback = 'Step into view'; return this.state({ visible: false }); }
    const ls = lm[LM.lShoulder], rs = lm[LM.rShoulder], lw = lm[LM.lWrist], rw = lm[LM.rWrist];
    if (!seen(ls) || !seen(rs)) { this.feedback = 'Show me your shoulders'; return this.state({ visible: false }); }
    const top = seen(lm[LM.nose]) ? lm[LM.nose].y : (ls.y + rs.y) / 2 - dist(ls, rs) * 0.6;
    const up = seen(lw) && seen(rw) && lw.y < top && rw.y < top;
    if (up) this.held += dt;
    else if (this.held > 0 && this.wasUp) this.drops = (this.drops || 0) + 1;
    this.wasUp = up;
    this.count = Math.min(this.target, Math.floor(this.held));
    this.depth = up ? 1 : 0;
    this.phase = up ? 'down' : 'up';
    this.feedback = up ? (this.target - this.held < 4 ? 'Almost there!' : 'Hold it... breathe') : (this.held > 0 ? 'Reach back up!' : 'Hands above your head');
    return this.state({ visible: true });
  }
}

export function makeCounter(kind) {
  return kind === 'squat' ? new SquatCounter() : kind === 'raise' ? new RaiseCounter() : new ReachHold();
}

// Camera-free fallback: counts reps from the phone's own motion while you hold it to your chest.
// A rep is a dip in total acceleration (going down) followed by a peak (stopping at the bottom
// or pushing back up), at least 0.7 s apart.
export class MotionReps {
  constructor(target) { this.target = target; this.count = 0; this.ema = 9.8; this.armed = false; this.lastRep = 0; }
  update(mag, t) {
    this.ema = this.ema * 0.7 + mag * 0.3;
    if (this.ema < 8.6) this.armed = true;
    if (this.armed && this.ema > 11 && t - this.lastRep > 700) { this.count++; this.armed = false; this.lastRep = t; return true; }
    return false;
  }
  get done() { return this.count >= this.target; }
}
