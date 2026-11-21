// Pengbit phone app: glue between the pet, the motion detector, the canvas and the professor.
import { Pet, CFG, FORMS, MODE_LABELS } from './pet.js';
import { ActivityDetector, MLP, ACTS, FEATURE_NAMES, requestMotionPermission } from './activity.js';
import { loadSprites, sprite } from './sprites.js';
import { unlockAudio, chirp, vibrate, speak, stopSpeaking } from './audio.js';
import { dexEntry, coach } from './ai.js';
import { on, off, emit } from './bus.js';
import { ctx } from './ctx.js';
import { initFeatures } from './features.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- storage (never throws)
const store = {
  get(k, d) { try { const v = localStorage.getItem('pengbit.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pengbit.' + k, JSON.stringify(v)); } catch {} },
};

const settings = Object.assign({ demo: false, voice: true, autoCoach: true, wake: true, useModel: true }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

const pet = new Pet(store.get('pet', null));
const detector = new ActivityDetector();
// Another feature (Desk mode) can drive the pet instead of the phone's motion: src.last = {act, conf, source, label}.
let activitySource = null;
const activity = () => (activitySource && activitySource.last) || detector.last;
let dataset = store.get('dataset', []);       // [{f, label}]
let model = null;
let dexHistory = store.get('dex', []);        // [{form, text, at}]
let lastSpoken = '';

// ---------------------------------------------------------------- model loading
async function loadModel() {
  const saved = store.get('model', null);
  if (saved) model = new MLP(saved);
  else {
    try {
      const r = await fetch('model/activity-model.json', { cache: 'no-cache' });
      if (r.ok) model = new MLP(await r.json());
    } catch {}
  }
  applyModel();
}
// Make a model live on this phone (local training or Flock). Everyone else learns via model:changed.
function setModel(m, source = 'local') {
  model = m; store.set('model', m.toJSON());
  settings.useModel = true; saveSettings(); applyModel();
  emit('model:changed', { source, valAcc: m.stats?.valAcc ?? null });
}
function applyModel() {
  detector.model = settings.useModel && model ? model : null;
  $('useModel').checked = settings.useModel;
  $('useModel').disabled = !model;
}

// ---------------------------------------------------------------- UI helpers
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
let bubbleTimer;
function bubble(msg, ms = 2500) {
  const b = $('bubble');
  b.textContent = msg; b.classList.remove('hidden');
  clearTimeout(bubbleTimer); bubbleTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
const fmtMin = (s) => `${Math.floor(s / 60)} min`;
function fmtAge(s) {
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- professor
async function askDex(auto = false) {
  const el = $('dexText');
  el.classList.add('loading'); el.textContent = 'Professor Liveoak is writing...';
  const { text, source } = await dexEntry(pet.summary());
  el.classList.remove('loading'); el.textContent = text;
  $('aiSource').textContent = source === 'ai' ? 'Written by the AI professor.' : 'Offline entry (AI proxy not set up yet).';
  dexHistory.unshift({ form: pet.form, text, at: Date.now() });
  dexHistory = dexHistory.slice(0, 20); store.set('dex', dexHistory);
  renderHistory();
  say(text, auto);
}

let lastCoachAt = 0;
async function askCoach(situation = 'checkin', auto = false) {
  if (auto) {
    if (!settings.autoCoach || Date.now() - lastCoachAt < 45000) return;
  }
  lastCoachAt = Date.now();
  const { text, source } = await coach(pet.summary(), situation);
  $('dexText').textContent = text;
  $('aiSource').textContent = source === 'ai' ? 'Coaching from the AI professor.' : 'Offline coaching (AI proxy not set up yet).';
  say(text, auto);
}

function say(text, auto) {
  lastSpoken = text;
  if (settings.voice) speak(text, { onStart: (src) => { if (src === 'browser' && !auto) $('aiSource').textContent += ' Voice: browser fallback.'; } });
}

function renderHistory() {
  $('dexHistory').innerHTML = '';
  for (const e of dexHistory) {
    const li = document.createElement('li');
    li.textContent = `${FORMS[e.form]?.name || e.form}: ${e.text}`;
    $('dexHistory').appendChild(li);
  }
}

// ---------------------------------------------------------------- pet events
let flashUntil = 0;
function handleEvents() {
  for (const e of pet.drainEvents()) {
    emit('pet:' + e.type, e.value);
    switch (e.type) {
      case 'hatched':
        chirp('hatch'); vibrate([60, 40, 60]); flashUntil = performance.now() + 1500;
        toast(`${pet.name} hatched!`); askDex(true); break;
      case 'evolved':
        chirp('evolve'); vibrate([100, 50, 100, 50, 200]); flashUntil = performance.now() + 3000;
        toast(`${pet.name} evolved into ${FORMS[e.value].name}!`, 4000); askDex(true); break;
      case 'hungry': chirp('sad'); bubble('hungry...'); toast(`${pet.name} is hungry. Press A to feed.`); break;
      case 'sad': chirp('sad'); bubble(':('); toast(`${pet.name} is sad. Go for a walk or press B to play.`); break;
      case 'idle':
        chirp('nudge'); vibrate([200, 100, 200, 100, 200]); bubble('brrr...', 4000);
        toast(`${pet.name} is shivering after ${e.value} minutes still. Time for a walk!`, 4500);
        askCoach('nudge', true); break;
      case 'move':
        chirp('happy'); bubble('warm!'); toast(e.value === 'exercise' ? 'Nudge answered with exercise!' : 'Nudge answered. Nice walk!');
        askCoach('moved', true); break;
    }
  }
}

// ---------------------------------------------------------------- game loop (1 Hz)
let lastTick = performance.now();
let petMinuteAcc = 0;
function tick() {
  const now = performance.now();
  const real = Math.min(5, Math.round((now - lastTick) / 1000)) || 1;   // cap catch-up after a stall
  lastTick = now;
  if (document.hidden) return;
  const dt = real * (settings.demo ? CFG.DEMO_SPEEDUP : 1);
  pet.tick(dt, activity().act);
  handleEvents();
  petMinuteAcc += dt;
  while (petMinuteAcc >= 60) { petMinuteAcc -= 60; emit('pet:minute', { act: activity().act, at: Date.now() }); }
  store.set('pet', pet);
  renderStatus();
}

function renderStatus() {
  $('petName').textContent = pet.name.toUpperCase();
  $('petAge').textContent = pet.isEgg ? `EGG ${Math.max(0, Math.ceil((CFG.HATCH_AGE_S - pet.age) / 60))}m` : `AGE ${fmtAge(pet.age)}`;
  for (const [id, v] of [['barHappy', pet.happy], ['barEnergy', pet.energy]]) {
    $(id).style.width = v + '%'; $(id).classList.toggle('low', v < CFG.LOW_STAT);
  }
  const a = activity();
  $('actName').textContent = (MODE_LABELS[pet.mode] || MODE_LABELS.phone)[a.act] || a.act; $('actName').className = a.act;
  $('actConf').textContent = a.source === 'ml' ? `AI ${Math.round(a.conf * 100)}% sure`
    : a.source === 'thresholds' ? 'threshold rules' : a.source === 'sim' ? 'simulated' : a.source === 'none' ? 'no motion sensor' : (a.label || a.source || '');

  if (pet.isEgg) { $('leanName').textContent = 'hatching'; $('evoEta').textContent = 'keep it with you'; }
  else if (pet.form === 'baby') {
    $('leanName').textContent = FORMS[pet.dominantForm()].name.replace(' Pengbit', '');
    const left = Math.max(0, CFG.EVOLVE_AGE_S - pet.age);
    const realS = left / (settings.demo ? CFG.DEMO_SPEEDUP : 1);
    $('evoEta').textContent = left ? `evolves in ~${realS < 120 ? Math.ceil(realS) + ' s' : Math.ceil(realS / 60) + ' min'}` : (pet.happy < CFG.EVOLVE_MIN_HAPPY ? 'needs more joy' : 'any moment');
  } else { $('leanName').textContent = FORMS[pet.form].name.replace(' Pengbit', ''); $('evoEta').textContent = 'fully evolved'; }

  // chips
  const sensor = detector.hasSensor;
  $('chipSensor').textContent = detector.sim ? 'simulated' : sensor ? 'motion on' : 'no sensor';
  $('chipSensor').className = 'chip' + (sensor || detector.sim ? ' ok' : '');
  $('chipModel').textContent = detector.model ? 'ML model' : 'thresholds';
  $('chipModel').className = 'chip' + (detector.model ? ' ml' : '');
  $('chipDemo').classList.toggle('hidden', !settings.demo);
  $('chipDemo').className = 'chip demo' + (settings.demo ? '' : ' hidden');

  // health
  const t = pet.totals, sum = t.walk + t.still + t.shake || 1;
  $('hStreak').textContent = fmtMin(pet.stillStreak);
  $('hNudges').textContent = `${pet.nudgesAnswered} / ${pet.nudges}`;
  $('hRate').textContent = pet.nudges ? Math.round(pet.nudgesAnswered / pet.nudges * 100) + '%' : 'n/a';
  $('hWalk').textContent = fmtMin(t.walk); $('hStill').textContent = fmtMin(t.still); $('hShake').textContent = fmtMin(t.shake);
  $('mixWalk').style.width = (t.walk / sum * 100) + '%';
  $('mixStill').style.width = (t.still / sum * 100) + '%';
  $('mixShake').style.width = (t.shake / sum * 100) + '%';
}

// ---------------------------------------------------------------- scene (canvas, 96x64 virtual px)
const scene = $('scene').getContext('2d');
const snow = Array.from({ length: 18 }, () => ({ x: Math.random() * 96, y: Math.random() * 64, v: 0.2 + Math.random() * 0.4 }));
let walkX = 32, walkDir = 1;

function draw(now) {
  const g = scene, W = 96, H = 64;
  const act = activity().act;
  const form = pet.form;
  g.fillStyle = form === 'frost' ? '#0d3040' : form === 'glitch' ? '#1a0d2e' : '#0d2a36';
  g.fillRect(0, 0, W, H);

  // ground
  g.fillStyle = '#1f5566'; g.fillRect(0, 54, W, 1);
  g.fillStyle = '#16404d'; for (let x = (now / 60 * (act === 'walk' ? 1 : 0)) % 8; x < W; x += 8) g.fillRect(W - x, 57, 3, 1);
  if (ctx.paintBackdrop) ctx.paintBackdrop(g, now, W, H);   // tombstones of past Pengbits (names.js)

  // snow when frost or shivering
  if (form === 'frost' || pet.shivering) {
    g.fillStyle = '#d8f6ff';
    for (const s of snow) { s.y += s.v; if (s.y > 54) { s.y = 0; s.x = Math.random() * W; } g.fillRect(s.x | 0, s.y | 0, 1, 1); }
  }

  const period = act === 'shake' ? 120 : act === 'walk' ? 260 : 800;
  const frame = Math.floor(now / period) % 2;
  let x = 32, y = 22;
  if (pet.isEgg) {
    if (Math.floor(now / 1800) % 3 === 0) x += Math.round(Math.sin(now / 60) * 1.5);
  } else if (act === 'walk') {
    walkX += walkDir * 0.25; if (walkX > 56 || walkX < 8) walkDir *= -1;
    x = Math.round(walkX); y += frame ? -2 : 0;
  } else if (act === 'shake') {
    x += Math.round((Math.random() - 0.5) * 4); y += Math.round((Math.random() - 0.5) * 4);
  } else {
    y += frame;   // breathing
  }
  if (pet.shivering) x += (Math.floor(now / 50) % 2) ? 1 : -1;

  const img = sprite(form, frame);
  if (img) {
    g.save();
    if (act === 'walk' && walkDir < 0 && !pet.isEgg) { g.translate(x * 2 + 32, 0); g.scale(-1, 1); }
    if (ctx.paintPet) ctx.paintPet(g, img, x, y, now, frame); else g.drawImage(img, x, y, 32, 32);   // W6 mood look
    g.restore();
  }

  // sprinter speed lines
  if (form === 'sprinter' && act === 'walk') {
    g.fillStyle = '#ffd84a';
    for (let i = 0; i < 3; i++) g.fillRect(walkDir > 0 ? x - 8 - i * 3 : x + 34 + i * 3, y + 10 + i * 6, 5, 1);
  }
  // glitch slices
  if (form === 'glitch' && Math.random() < 0.15) {
    const sy = Math.floor(Math.random() * H), sh = 2 + Math.floor(Math.random() * 4);
    const slice = g.getImageData(0, sy, W, sh);
    g.putImageData(slice, Math.round((Math.random() - 0.5) * 8), sy);
  }
  // status icons
  g.fillStyle = '#ff7a7a';
  if (pet.hungry) g.fillRect(4, 4, 3, 3);
  if (pet.sad) g.fillRect(9, 4, 3, 3);
  // evolve / hatch flash
  if (now < flashUntil && Math.floor(now / 120) % 2) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, W, H); }

  requestAnimationFrame(draw);
}

// Professor Liveoak portrait: Daniel's sprites/professor.png if it exists, else the inline 16x16 face.
function loadProfessor() {
  const im = new Image();
  im.onload = () => {
    const c = $('profFace');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
  };
  im.onerror = drawProfessor;
  im.src = 'sprites/professor.png';
}

// Original pixel art: penguin with round glasses.
function drawProfessor() {
  const art = [
    '.....######.....',
    '...##########...',
    '..############..',
    '.######..######.',
    '.##WWW####WWW##.',
    '#WO..OW##WO..OW#',
    '#WO..OWWWWO..OW#',
    '#.WOOW.WW.WOOW.#',
    '#..WW..YY..WW..#',
    '#.....YYYY.....#',
    '.#WWWWWWWWWWWW#.',
    '.#WWWWWWWWWWWW#.',
    '..#WWWWWWWWWW#..',
    '..##WWWWWWWW##..',
    '...##########...',
    '....YY....YY....',
  ];
  const c = $('profFace').getContext('2d');
  const col = { '#': '#26314f', W: '#e8f4ff', O: '#ffd84a', Y: '#ff9f2a', '.': null };
  art.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { c.fillStyle = col[ch]; c.fillRect(x, y, 1, 1); } }));
}

// ---------------------------------------------------------------- buttons A/B/C
function holdable(el, onTap, onHold, ms = 1500) {
  let t = null, held = false;
  const down = (e) => { e.preventDefault(); el.classList.add('down'); held = false; t = setTimeout(() => { held = true; onHold(); }, ms); };
  const up = () => { el.classList.remove('down'); clearTimeout(t); if (!held && t) onTap(); t = null; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', () => { el.classList.remove('down'); clearTimeout(t); t = null; });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

function feed() {
  if (!pet.feed()) return toast('Still an egg!');
  chirp('feed'); bubble('nom!'); handleEvents(); renderStatus(); store.set('pet', pet);
}
function play() {
  if (!pet.play()) return toast('Still an egg!');
  chirp('happy'); bubble('yay!'); handleEvents(); renderStatus(); store.set('pet', pet);
}
function setDemo(on) {
  settings.demo = on; saveSettings(); $('demoToggle').checked = on;
  toast(on ? 'Demo mode: 1 second = 1 pet minute' : 'Demo mode off'); chirp('tick'); renderStatus();
}
function evolveNow() {
  if (!pet.forceEvolve()) return toast('Already evolved. Start a new egg in Setup.');
  handleEvents(); renderStatus(); store.set('pet', pet);
}

// ---------------------------------------------------------------- training UI
let recording = null;
function countData() {
  const c = { walk: 0, still: 0, shake: 0 };
  for (const d of dataset) c[d.label]++;
  $('cWalk').textContent = c.walk; $('cStill').textContent = c.still; $('cShake').textContent = c.shake;
  $('btnTrain').disabled = ACTS.some((a) => c[a] < 5);
  return c;
}
function selectedLabel() { return document.querySelector('#labelSeg .on').dataset.label; }

function startRecording() {
  if (recording) { stopRecording(); return; }
  if (!detector.hasSensor) return toast('No motion sensor. Open this on your phone.');
  const label = selectedLabel(), secs = +$('recSecs').value;
  let count = 3;
  $('btnRec').textContent = 'Stop';
  recording = { label, secs, start: 0, n: 0, countdown: true };
  $('recMsg').textContent = `Get ready to ${label}... ${count}`;
  const cd = setInterval(() => {
    count--;
    if (!recording) return clearInterval(cd);
    if (count > 0) { $('recMsg').textContent = `Get ready to ${label}... ${count}`; chirp('tick'); return; }
    clearInterval(cd);
    chirp('hello'); vibrate(80);
    recording.countdown = false; recording.start = performance.now();
    $('recMsg').textContent = `Recording ${label}...`;
  }, 1000);
}
function stopRecording(done) {
  if (!recording) return;
  const { n, label } = recording;
  recording = null;
  $('btnRec').textContent = 'Record'; $('recBar').style.width = '0';
  store.set('dataset', dataset); countData();
  $('recMsg').textContent = `Saved ${n} ${label} windows.`;
  if (done) { chirp('happy'); vibrate([80, 60, 80]); }
}

function onWindow(f, result) {
  emit('activity:window', { f, result });
  if (f) {
    const probs = result.probs ? '\n' + ACTS.map((a, i) => `${a.padEnd(6)} ${(result.probs[i] * 100).toFixed(0)}%`).join('\n') : '';
    $('liveFeat').textContent = FEATURE_NAMES.map((n, i) => `${n.padEnd(12)} ${f[i].toFixed(3)}`).join('\n') + `\n-> ${result.rawAct} (${result.source})` + probs;
  }
  if (recording && !recording.countdown && f) {
    dataset.push({ f: f.map((v) => +v.toFixed(5)), label: recording.label });
    recording.n++;
    const el = (performance.now() - recording.start) / 1000;
    $('recBar').style.width = Math.min(100, el / recording.secs * 100) + '%';
    countData();
    if (el >= recording.secs) stopRecording(true);
  }
}

function trainModel() {
  $('trainOut').textContent = 'Training...';
  $('btnTrain').disabled = true;
  setTimeout(() => {
    const m = new MLP();
    const s = m.train(dataset, { epochs: 400 });
    setModel(m, 'local');
    const pct = (v) => v == null ? 'n/a' : Math.round(v * 100) + '%';
    const rows = ACTS.map((t, i) => `<tr><th>${t}</th>${s.confusion[i].map((v) => `<td>${v}</td>`).join('')}</tr>`).join('');
    $('trainOut').innerHTML = `<p><b>Validation accuracy ${pct(s.valAcc)}</b> (train ${pct(s.trainAcc)}), ${s.nTrain} train / ${s.nVal} held-out windows. Model is live.</p>
      <table><tr><th>true \\ predicted</th>${ACTS.map((a) => `<th>${a}</th>`).join('')}</tr>${rows}</table>`;
    countData(); renderStatus(); chirp('evolve');
  }, 30);
}

function download(name, obj) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- wake lock
let wakeLock = null;
async function keepAwake() {
  if (!settings.wake || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); lastTick = performance.now(); } });

// ---------------------------------------------------------------- tabs (features unhide their own)
function openTab(name) {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + name));
}
function showTab(name, show = true) {
  const b = document.querySelector(`.tabs button[data-tab="${name}"]`);
  if (b) b.classList.toggle('hidden', !show);
}

function deviceId() {
  let id = store.get('deviceId', null);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('deviceId', id);
  }
  return id;
}

// The shared context every feature gets (see ctx.js).
function fillCtx() {
  Object.assign(ctx, {
    pet, detector, store, settings, saveSettings,
    getModel: () => model, setModel,
    setActivitySource(src) { activitySource = src || null; renderStatus(); },
    getActivity: activity,
    getDataset: () => dataset,
    addData(rows) { dataset = dataset.concat(rows); store.set('dataset', dataset); countData(); },
    toast, bubble, say: (text) => say(text, false), chirp, vibrate,
    showTab, openTab, render: renderStatus,
    deviceId: deviceId(),
    bus: { on, off, emit },
  });
}

// ---------------------------------------------------------------- wiring
function wire() {
  holdable($('btnA'), feed, feed);
  holdable($('btnB'), play, play);
  holdable($('btnC'), () => setDemo(!settings.demo), evolveNow);

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => openTab(b.dataset.tab)));

  $('btnDex').onclick = () => askDex(false);
  $('btnCoach').onclick = () => askCoach('checkin', false);
  $('btnSpeak').onclick = () => { const t = $('dexText').textContent; if (t) { stopSpeaking(); speak(t); } };

  document.querySelectorAll('#labelSeg button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('#labelSeg button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('btnRec').onclick = startRecording;
  $('btnTrain').onclick = trainModel;
  $('useModel').onchange = (e) => { settings.useModel = e.target.checked; saveSettings(); applyModel(); renderStatus(); };
  $('btnExportModel').onclick = () => model ? download('activity-model.json', model.toJSON()) : toast('Train a model first.');
  $('btnExportData').onclick = () => download(`pengbit-data-${Date.now()}.json`, { kind: 'pengbit-dataset', features: FEATURE_NAMES, rows: dataset });
  $('importData').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      const rows = (j.rows || j).filter((r) => Array.isArray(r.f) && r.f.length === FEATURE_NAMES.length && ACTS.includes(r.label));
      dataset = dataset.concat(rows); store.set('dataset', dataset); countData(); toast(`Imported ${rows.length} windows.`);
    } catch { toast('Not a Pengbit data file.'); }
    e.target.value = '';
  };
  $('btnClearData').onclick = () => { if (confirm('Delete all recorded training data on this phone?')) { dataset = []; store.set('dataset', dataset); countData(); } };

  $('nameInput').value = pet.name;
  $('nameInput').onchange = (e) => { pet.name = e.target.value.trim().slice(0, 12) || 'Pengbit'; store.set('pet', pet); renderStatus(); };
  $('demoToggle').checked = settings.demo; $('demoToggle').onchange = (e) => setDemo(e.target.checked);
  $('voiceToggle').checked = settings.voice; $('voiceToggle').onchange = (e) => { settings.voice = e.target.checked; saveSettings(); if (!settings.voice) stopSpeaking(); };
  $('coachToggle').checked = settings.autoCoach; $('coachToggle').onchange = (e) => { settings.autoCoach = e.target.checked; saveSettings(); };
  $('wakeToggle').checked = settings.wake; $('wakeToggle').onchange = (e) => { settings.wake = e.target.checked; saveSettings(); if (settings.wake) keepAwake(); else if (wakeLock) wakeLock.release(); };
  document.querySelectorAll('#simSeg button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('#simSeg button').forEach((x) => x.classList.toggle('on', x === b));
    detector.sim = b.dataset.sim || null; renderStatus();
  });
  $('btnEvolve').onclick = evolveNow;
  $('btnReset').onclick = () => {
    if (!confirm(`Start over with a new egg? ${pet.name} will be gone.`)) return;
    pet.reset(); store.set('pet', pet); dexHistory = []; store.set('dex', dexHistory); renderHistory();
    $('dexText').textContent = 'A new egg! Ask me for a dex entry once it hatches.'; renderStatus(); chirp('hello');
  };

  // Desktop keys for judges without a phone: W/S/K simulate, D demo, E evolve.
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    const sim = { w: 'walk', s: 'still', k: 'shake', o: '' }[k];
    if (sim !== undefined) document.querySelector(`#simSeg [data-sim="${sim}"]`).click();
    if (k === 'd') setDemo(!settings.demo);
    if (k === 'e') evolveNow();
  });
}

async function boot() {
  loadProfessor();
  wire();
  renderHistory();
  if (dexHistory[0]) $('dexText').textContent = dexHistory[0].text;
  countData();
  await Promise.all([loadSprites(), loadModel()]);
  detector.onWindow = onWindow;
  fillCtx();
  initFeatures(ctx);   // not awaited: a slow feature never delays the pet
  renderStatus();
  requestAnimationFrame(draw);

  $('startBtn').onclick = async () => {
    unlockAudio();
    const ok = await requestMotionPermission();
    detector.start();
    $('start').classList.add('hidden');
    chirp('hello');
    keepAwake();
    if (!ok) toast('Motion access denied. Use Setup > Simulate, or allow motion in Settings.', 5000);
    setTimeout(() => { if (!detector.hasSensor && !detector.sim) toast('No motion sensor found. On a laptop, use Setup > Simulate or keys W / S / K.', 5000); }, 2500);
    setInterval(tick, 1000);
  };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
