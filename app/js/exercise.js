// W2: Camera-verified exercise challenges.
// After a sitting nudge (pet:idle), or from the Move tab, Pebblebit asks for a short challenge:
// squats, arm raises or an overhead stretch. The camera feed goes to MediaPipe Pose Landmarker
// running in the browser (pose.js); it draws the skeleton, counts reps and gives form hints.
// Video never leaves the phone. If the camera or the model fails, the phone's motion sensor
// counts reps instead, and there is always an honor-system "I did it" (smaller reward, and it
// does not count as an answered nudge).
//
// Seam (W0): init(ctx) is called from features.js. Listens to pet:idle; emits exercise:offer
// { kind } and exercise:done { kind, reps, formScore, method }. Rewards go through
// pet.reward() and pet.answerNudge('exercise'); main.js then toasts and asks the professor.
// Camera and pose model come from the shared pose module (pose.js), never loaded twice.
import { on, emit } from './bus.js';
import { acquire, release, subscribe, drawSkeleton, loadPose } from './pose.js';
import { EXERCISES, makeCounter, MotionReps } from './reps.js';
import { sprite } from './sprites.js';

const REWARD = { verified: { happy: 10, energy: 5 }, manual: { happy: 5, energy: 2 } };
const EXERCISING = { last: { act: 'shake', conf: 1, source: 'exercise', label: 'exercising' } };
const DISMISS_COOLDOWN_MS = 2 * 60 * 1000;   // after "Not now", don't re-offer on every repeat nudge

let ctx = null;
let ui = null;          // DOM refs, built on first open
let session = null;     // the running challenge
let lastDismiss = 0;

const q = (sel) => ui.root.querySelector(sel);
const fmtTarget = (e, n = e.target) => `${n}${e.unit === 's' ? ' s' : ''}`;

// ---------------------------------------------------------------- seam entry point
export function init(c) {
  ctx = c;
  buildTab();
  ctx.showTab('move');
  on('pet:idle', () => {
    if (session || ctx.pet.isEgg) return;
    if (ctx.settings && ctx.settings.autoCoach === false) return;
    if (Date.now() - lastDismiss < DISMISS_COOLDOWN_MS) return;
    const kind = pickKind();
    emit('exercise:offer', { kind });
    openChallenge({ reason: 'nudge', kind });
  });
  // Desktop shortcut for judges: X opens a challenge.
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'x' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) openChallenge({ reason: 'button' });
  });
}

// Rotate offers so the nudge isn't always squats.
function pickKind() {
  const kinds = Object.keys(EXERCISES), st = stats();
  st.offers = (st.offers || 0) + 1; saveStats(st);
  return kinds[(st.offers - 1) % kinds.length];
}

// ---------------------------------------------------------------- stats (store key "exercise")
function stats() {
  return Object.assign({ sessions: 0, verified: 0, reps: 0, formSum: 0, nudgesAnswered: 0, last: null }, ctx.store.get('exercise', {}));
}
function saveStats(s) { ctx.store.set('exercise', s); }

// ---------------------------------------------------------------- Move tab
function buildTab() {
  const sec = document.getElementById('tab-move');
  const btn = document.querySelector('.tabs [data-tab="move"]');
  if (!sec) return;
  sec.innerHTML = `
    <p class="muted">Sitting nudges come with a quick challenge. Your camera checks the reps with a pose AI that runs on your phone. Video never leaves it.</p>
    <div class="cards">
      <div class="card"><span class="label">Challenges</span><strong class="mv-sessions">0</strong></div>
      <div class="card"><span class="label">Reps verified</span><strong class="mv-reps">0</strong></div>
      <div class="card"><span class="label">Form score</span><strong class="mv-form">n/a</strong></div>
      <div class="card"><span class="label">Nudges answered</span><strong class="mv-nudges">0</strong></div>
    </div>
    <div class="row wrap mv-start">
      ${Object.entries(EXERCISES).map(([k, e]) => `<button class="btn-chrome" data-kind="${k}">${fmtTarget(e)} ${e.name.toLowerCase()}</button>`).join('')}
    </div>
    <p class="fine mv-last"></p>`;
  sec.querySelectorAll('.mv-start button').forEach((b) => b.onclick = () => openChallenge({ reason: 'button', kind: b.dataset.kind }));
  if (btn && !btn.textContent.trim()) btn.textContent = 'Move';
  renderTab();
}
function renderTab() {
  const sec = document.getElementById('tab-move');
  if (!sec) return;
  const s = stats();
  sec.querySelector('.mv-sessions').textContent = s.sessions;
  sec.querySelector('.mv-reps').textContent = s.reps;
  sec.querySelector('.mv-form').textContent = s.verified ? Math.round(s.formSum / s.verified * 100) + '%' : 'n/a';
  sec.querySelector('.mv-nudges').textContent = s.nudgesAnswered;
  sec.querySelector('.mv-last').textContent = s.last ? `Last: ${s.last.count} ${s.last.name.toLowerCase()} (${s.last.method}).` : '';
}

// ---------------------------------------------------------------- overlay UI
function build() {
  const root = document.createElement('div');
  root.className = 'ex-overlay hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Exercise challenge');
  root.innerHTML = `
    <div class="ex-sheet">
      <section class="ex-view" data-view="pick">
        <h2 class="ex-title">Warm up <span class="ex-name"></span></h2>
        <p class="ex-reason muted"></p>
        <div class="ex-choices">
          ${Object.entries(EXERCISES).map(([k, e]) => `
            <button class="ex-choice" data-kind="${k}"><b>${fmtTarget(e)}</b><span>${e.name}</span></button>`).join('')}
        </div>
        <p class="ex-tip fine"></p>
        <div class="row wrap">
          <button class="btn-chrome big ex-go">Start camera</button>
          <button class="btn-ghost ex-later">Not now</button>
        </div>
        <p class="fine">The pose AI runs on your phone. Video never leaves it.</p>
      </section>

      <section class="ex-view hidden" data-view="live">
        <div class="ex-hud">
          <div><span class="label ex-ex"></span><strong class="ex-count">0</strong></div>
          <button class="btn-ghost ex-close">Stop</button>
        </div>
        <div class="ex-stage">
          <canvas class="ex-canvas" width="480" height="640"></canvas>
          <div class="ex-feedback"></div>
          <div class="ex-status hidden"></div>
        </div>
        <div class="progress ex-progress"><i></i></div>
        <div class="row wrap">
          <button class="btn-ghost ex-flip">Flip camera</button>
          <button class="btn-ghost ex-motion">Count with motion</button>
          <button class="btn-ghost ex-manual">I did it</button>
        </div>
      </section>

      <section class="ex-view hidden" data-view="done">
        <h2 class="ex-title">Toasty!</h2>
        <canvas class="ex-pet" width="32" height="32"></canvas>
        <p class="ex-summary"></p>
        <div class="ex-rewards"></div>
        <button class="btn-chrome big ex-back">Back to Pebblebit</button>
      </section>
    </div>`;
  document.body.appendChild(root);
  ui = { root, canvas: root.querySelector('.ex-canvas') };

  root.querySelectorAll('.ex-choice').forEach((b) => b.onclick = () => pick(b.dataset.kind));
  q('.ex-go').onclick = () => startCamera();
  q('.ex-later').onclick = () => close(true);
  q('.ex-close').onclick = () => close(true);
  q('.ex-flip').onclick = () => { session.facing = session.facing === 'user' ? 'environment' : 'user'; startCamera(); };
  q('.ex-motion').onclick = () => startMotion();
  q('.ex-manual').onclick = () => finish('manual');
  q('.ex-back').onclick = () => close(false);
}

function show(view) {
  ui.root.querySelectorAll('.ex-view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
}

function pick(kind) {
  session.kind = kind;
  ui.root.querySelectorAll('.ex-choice').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
  q('.ex-tip').textContent = EXERCISES[kind].tip;
}

// opts: { reason: 'nudge' | 'button', kind }
export function openChallenge(opts = {}) {
  if (session || !ctx) return;
  if (!ui) build();
  const pet = ctx.pet;
  session = { reason: opts.reason || 'button', kind: opts.kind || 'squat', facing: 'user', method: null, counter: null,
    cam: null, unsub: null, raf: 0, motion: null };
  q('.ex-name').textContent = pet.name;
  q('.ex-reason').textContent = session.reason === 'nudge'
    ? `${pet.name} has been still with you for ${Math.round(pet.stillStreak / 60)} minutes and is shivering. A quick challenge warms you both up.`
    : 'Pick a quick challenge. The camera counts your reps and checks your form.';
  pick(session.kind);
  show('pick');
  ui.root.classList.remove('hidden');
  document.body.classList.add('ex-open');
  loadPose().catch(() => {});   // start the ~6 MB model download while they choose
}

function close(dismissed) {
  if (!session) return;
  stopMedia();
  if (dismissed && !session.result) lastDismiss = Date.now();
  session = null;
  ui.root.classList.add('hidden');
  document.body.classList.remove('ex-open');
}

function stopMedia() {
  const s = session;
  if (!s) return;
  cancelAnimationFrame(s.raf);
  if (s.unsub) s.unsub();
  s.unsub = null;
  if (s.cam) release(s.cam);
  s.cam = null;
  if (s.motion) window.removeEventListener('devicemotion', s.motion);
  s.motion = null;
  if (s.heldActivity) { ctx.setActivitySource(null); s.heldActivity = false; }
}

function status(msg) { const el = q('.ex-status'); el.textContent = msg || ''; el.classList.toggle('hidden', !msg); }
function feedback(msg) { q('.ex-feedback').textContent = msg || ''; }

function setHud() {
  const e = EXERCISES[session.kind], n = session.counter ? session.counter.count : 0;
  q('.ex-ex').textContent = e.name + (session.method === 'motion' ? ' · motion count' : session.method === 'timer' ? ' · timer' : '');
  q('.ex-count').textContent = `${n} / ${fmtTarget(e)}`;
  q('.ex-progress i').style.width = Math.min(100, n / e.target * 100) + '%';
}

function blank(msg) {
  const cv = ui.canvas, g = cv.getContext('2d');
  g.fillStyle = '#0d2a36'; g.fillRect(0, 0, cv.width, cv.height);
  if (msg) status(msg);
}

// ---------------------------------------------------------------- camera mode (shared pose camera)
async function startCamera() {
  const s = session;
  stopMedia();
  s.method = 'camera';
  s.counter = makeCounter(s.kind);
  show('live'); setHud(); feedback(''); blank();
  q('.ex-motion').classList.remove('hidden'); q('.ex-flip').classList.remove('hidden');
  status('Starting camera...');
  const loading = setTimeout(() => session === s && status('Loading pose AI...'), 800);
  let cam;
  try { cam = await acquire({ facing: s.facing }); }
  catch (e) { clearTimeout(loading); if (session === s && s.method === 'camera') fallback(e.message); return; }
  clearTimeout(loading);
  if (session !== s || s.method !== 'camera') { release(cam); return; }
  s.cam = cam;
  status('');
  feedback(s.counter.feedback);
  ctx.chirp('hello');
  const cv = ui.canvas, g = cv.getContext('2d');
  let lastCount = 0, lostSince = 0;
  s.unsub = subscribe((f) => {
    if (session !== s || s.method !== 'camera') return;
    const now = f.t;
    const st = s.counter.update(f.landmarks, now);
    lostSince = f.landmarks ? 0 : lostSince || now;
    if (cv.width !== f.width || cv.height !== f.height) { cv.width = f.width; cv.height = f.height; }
    // Camera frame plus skeleton; it turns green while you're in the counted position.
    drawSkeleton(g, f.landmarks, { mirrored: f.mirrored, video: f.video, color: st.phase === 'down' ? '#7cff9b' : '#9ff3ff' });
    drawPet(g, cv.width, cv.height, now);
    feedback(lostSince && now - lostSince > 4000 ? 'I can’t see you. Step back into view.' : st.feedback);
    if (st.count !== lastCount) {
      lastCount = st.count;
      ctx.chirp(st.done ? 'evolve' : 'tick'); ctx.vibrate(40);
      s.bounceAt = now;
      setHud();
      if (st.done) setTimeout(() => session === s && finish('camera'), 600);
    }
  });
}

// Pebblebit cheers in the corner and hops on every rep.
function drawPet(g, w, h, now) {
  const img = sprite(ctx.pet.form, Math.floor(now / 300) % 2);
  if (!img) return;
  const size = Math.round(Math.min(w, h) / 4.5);
  const t = session.bounceAt ? (now - session.bounceAt) / 350 : 1;
  const hop = t < 1 ? Math.sin(t * Math.PI) * size * 0.4 : 0;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, w - size - 12, h - size - 12 - hop, size, size);
}

// ---------------------------------------------------------------- fallbacks
function fallback(reason) {
  stopMedia();
  session.method = null;
  blank(`${reason} Tap "Count with motion" to count reps with the phone's motion sensor, or "I did it".`);
  feedback('');
  q('.ex-flip').classList.add('hidden');
}

function startMotion() {
  const s = session;
  stopMedia();
  show('live');
  const e = EXERCISES[s.kind];
  q('.ex-motion').classList.add('hidden'); q('.ex-flip').classList.add('hidden');
  feedback('');
  const cv = ui.canvas, g = cv.getContext('2d');
  const paint = (now) => { blank(); drawPet(g, cv.width, cv.height, now); };

  if (e.unit === 's') {   // a hold can't be checked by motion, so it becomes a plain timer
    s.method = 'timer';
    s.counter = { count: 0, target: e.target, formScore: 1 };
    setHud();
    status(`Reach both hands over your head and hold for ${e.target} seconds.`);
    const t0 = performance.now();
    const tick = (now) => {
      if (session !== s || s.method !== 'timer') return;
      const n = Math.min(e.target, Math.floor((now - t0) / 1000));
      if (n !== s.counter.count) { s.counter.count = n; setHud(); ctx.chirp('tick'); }
      paint(now);
      if (n >= e.target) return finish('timer');
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
    return;
  }

  s.method = 'motion';
  s.counter = new MotionReps(e.target);
  // The reps shake the phone, which the activity detector would read as a walk and credit the
  // nudge to walking. Hold the pet on 'shake' (doesn't touch the sitting streak) until we finish.
  if (ctx.pet.mode !== 'desk') { ctx.setActivitySource(EXERCISING); s.heldActivity = true; }
  s.counter.formScore = 1;
  setHud();
  status(`Hold the phone against your chest and ${e.verb}. I count each rep by feel.`);
  let got = false;
  s.motion = (ev) => {
    const a = ev.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    got = true;
    if (s.counter.update(Math.hypot(a.x, a.y, a.z), performance.now())) {
      ctx.chirp(s.counter.done ? 'evolve' : 'tick'); ctx.vibrate(40);
      s.bounceAt = performance.now(); setHud();
      if (s.counter.done) finish('motion');
    }
  };
  window.addEventListener('devicemotion', s.motion);
  const anim = (now) => { if (session !== s || s.method !== 'motion') return; paint(now); s.raf = requestAnimationFrame(anim); };
  s.raf = requestAnimationFrame(anim);
  setTimeout(() => { if (session === s && s.method === 'motion' && !got) status('No motion sensor here either. Tap "I did it" when you finish.'); }, 2500);
}

// ---------------------------------------------------------------- finish: reward the pet
function finish(method) {
  const s = session;
  if (!s || s.result) return;
  stopMedia();
  const e = EXERCISES[s.kind], pet = ctx.pet;
  const verified = method !== 'manual';
  const count = verified ? Math.min(e.target, s.counter?.count ?? 0) : e.target;
  const formScore = verified && s.counter ? +(s.counter.formScore ?? 1).toFixed(2) : null;
  const wasNudged = !!pet.nudged;
  s.result = { kind: s.kind, reps: count, formScore, method };

  // Pet: reward, and a verified challenge answers the sitting nudge (impact counter).
  const r = verified ? REWARD.verified : REWARD.manual;
  // reason 'exercise' counts a session in pet.exercise (and the professor's summary).
  pet.reward({ ...r, reason: verified ? 'exercise' : 'exercise-honor', reps: verified && e.unit !== 's' ? count : 0 });
  // answerNudge pushes pet:move ('exercise'); main.js toasts and the professor reacts.
  if (verified) pet.answerNudge('exercise');
  ctx.store.set('pet', pet);
  if (ctx.render) ctx.render();

  const st = stats();
  st.sessions++; st.last = { kind: s.kind, name: e.name, count, method, at: Date.now() };
  if (verified) { st.verified++; st.reps += e.unit === 's' ? 0 : count; st.formSum += formScore; if (wasNudged) st.nudgesAnswered++; }
  saveStats(st); renderTab();
  emit('exercise:done', s.result);

  const how = { camera: 'Verified by the pose AI.', motion: 'Counted by the motion sensor.', timer: 'Timed hold.', manual: 'Honor system, so a smaller reward.' }[method];
  const formTxt = method === 'camera' && e.unit !== 's' ? ` Form ${Math.round(formScore * 100)}%.` : '';
  q('.ex-summary').textContent = `${fmtTarget(e, count)} ${e.name.toLowerCase()} done. ${how}${formTxt}`;
  q('.ex-rewards').innerHTML = `<span>JOY +${r.happy}</span><span>NRG +${r.energy}</span>${verified && wasNudged ? '<span>Nudge answered</span>' : ''}`;
  const pc = q('.ex-pet').getContext('2d');
  pc.clearRect(0, 0, 32, 32);
  const img = sprite(pet.form, 0); if (img) pc.drawImage(img, 0, 0, 32, 32);
  show('done');
  ctx.chirp('happy'); ctx.vibrate([80, 50, 80, 50, 160]);
  if (!wasNudged) ctx.bubble('toasty!');
}
