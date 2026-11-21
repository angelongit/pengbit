// W1 Pengbit Flock: federated learning on the phone (the Flock tab).
// This phone trains the activity model on its own recorded motion and shares only what it learned:
// model weights, a sample count and per-feature averages. Raw motion windows never leave the phone.
// The server (api/flock) averages everyone's weights (FedAvg) into a shared model each round.
import { ACTS } from './activity.js';
import { sprite } from './sprites.js';
import { split, evaluate, localUpdate, updatePayload, post, getState, toMLP } from './flock-core.js';
import { PARAM_COUNT } from './fedavg.js';

const POLL_MS = 5000;
const MIN_TRAIN = 9;          // windows needed before this phone can contribute
const TEACH = [               // guided 30 s "teach the flock" recording
  { label: 'still', secs: 10, say: 'Put the phone down on a table' },
  { label: 'shake', secs: 10, say: 'Shake the phone' },
  { label: 'walk', secs: 10, say: 'Walk around holding the phone' },
];

let ctx, el = {}, state = null, online = null, timer = null, busy = false, teach = null;
let fs;   // persisted flock settings

const $ = (id) => document.getElementById(id);
const pct = (v) => (v == null ? '--' : Math.round(v * 100) + '%');

function save() { ctx.store.set('flock', fs); }
function client() {
  return { id: ctx.deviceId.replace(/-/g, '').slice(0, 32), name: ctx.pet.name, form: ctx.pet.form };
}

function html() {
  return `
  <div class="fk-head">
    <h2>Pengbit Flock</h2>
    <span id="fkNet" class="chip">offline</span>
  </div>
  <p class="muted">Every Pengbit learns from its own owner's moves, then the flock pools what they learned.
  Your phone sends <b>what the model learned</b>, never <b>how you moved</b>.</p>

  <div class="fk-privacy">
    <div class="fk-side stay">
      <span class="label">Stays on this phone</span>
      <strong id="fkLocal">0 windows</strong>
      <small id="fkLocalSub">raw accelerometer readings and labels</small>
    </div>
    <div class="fk-arrow" aria-hidden="true">→</div>
    <div class="fk-side send">
      <span class="label">Shared with the flock</span>
      <strong>${PARAM_COUNT} weights</strong>
      <small>+ sample count + 12 feature averages</small>
    </div>
  </div>
  <p class="fk-zero">Raw motion uploaded: <b>0 bytes</b>, ever.</p>

  <div class="cards fk-cards">
    <div class="card"><span class="label">Flock round</span><strong id="fkRound">--</strong></div>
    <div class="card"><span class="label">Penguins</span><strong id="fkMembers">--</strong></div>
    <div class="card"><span class="label">Flock model on your data</span><strong id="fkAcc">--</strong></div>
    <div class="card"><span class="label">Your contributions</span><strong id="fkMine">0</strong></div>
  </div>

  <div id="fkStrip" class="fk-strip"></div>

  <div class="row wrap">
    <button id="fkJoin" class="btn-chrome">Join the flock</button>
    <button id="fkTeach" class="btn-chrome">Teach the flock (30 s)</button>
    <button id="fkShare" class="btn-ghost">Train and share now</button>
  </div>
  <div id="fkTeachBox" class="fk-teach hidden">
    <strong id="fkTeachSay"></strong>
    <div class="progress"><i id="fkTeachBar"></i></div>
  </div>
  <label class="toggle"><input type="checkbox" id="fkAuto"> Share automatically each round</label>
  <label class="toggle"><input type="checkbox" id="fkUse"> Use the flock model on this phone</label>
  <p id="fkMsg" class="fine"></p>

  <details>
    <summary>See exactly what gets sent</summary>
    <p class="fine">This is the last update this phone sent (or would send). No timestamps, no locations, no sensor readings.</p>
    <pre id="fkPayload" class="feat fk-payload">Nothing sent yet.</pre>
  </details>
  <details>
    <summary>How it works</summary>
    <ol class="fine fk-how">
      <li>The phone downloads the flock's shared model.</li>
      <li>It scores that model on 1 in 5 of your recorded windows, which are never trained on, and reports only the score.</li>
      <li>It trains the model a little more on the rest of your windows, right on the phone.</li>
      <li>It sends the new weights. The server averages everyone's weights, weighted by how much data each phone has (FedAvg), and a new round begins.</li>
    </ol>
  </details>
  <p class="fine"><a href="flock.html" target="_blank" rel="noopener">Open the live Flock screen</a></p>`;
}

export async function init(c) {
  ctx = c;
  fs = Object.assign({ joined: false, auto: true, use: true, sharedRound: -1, sharedSize: 0, evaluated: -1, adopted: -1, contributions: 0 }, ctx.store.get('flock', {}));
  const sec = $('tab-flock');
  sec.innerHTML = html();
  for (const id of ['fkNet', 'fkLocal', 'fkLocalSub', 'fkRound', 'fkMembers', 'fkAcc', 'fkMine', 'fkStrip', 'fkJoin', 'fkTeach', 'fkShare', 'fkTeachBox', 'fkTeachSay', 'fkTeachBar', 'fkAuto', 'fkUse', 'fkMsg', 'fkPayload']) el[id] = $(id);
  ctx.showTab('flock');

  el.fkAuto.checked = fs.auto; el.fkUse.checked = fs.use;
  el.fkAuto.onchange = () => { fs.auto = el.fkAuto.checked; save(); };
  el.fkUse.onchange = () => { fs.use = el.fkUse.checked; fs.adopted = -1; save(); if (fs.use) adopt(); };
  el.fkJoin.onclick = () => { fs.joined = !fs.joined; save(); render(); if (fs.joined) { msg('Joined. Your Pengbit is in the flock.'); sync(); } else msg('Left the flock. Nothing more is shared.'); };
  el.fkShare.onclick = () => share(true);
  el.fkTeach.onclick = startTeach;

  ctx.bus.on('activity:window', onWindow);
  ctx.bus.on('pet:evolved', () => fs.joined && sync());

  // Joined from the QR code (?flock): open this tab and join.
  const q = new URLSearchParams(location.search);
  if (q.has('flock') || location.hash === '#flock') { ctx.openTab('flock'); if (!fs.joined) { fs.joined = true; save(); } }

  render();
  sync();
  timer = setInterval(() => { if (!document.hidden) sync(); }, POLL_MS);
}

function msg(t) { el.fkMsg.textContent = t; }

// ---------------------------------------------------------------- sync loop
async function sync() {
  if (busy) return;
  busy = true;
  try {
    state = fs.joined ? await post({ op: 'hello', client: client() }) : await getState();
    online = true;
    await evalRound();
    adopt();
    if (fs.joined && fs.auto) await share(false);
  } catch (e) {
    online = false;
    console.warn('[flock]', e.message);
  } finally {
    busy = false;
    render();
  }
}

// Score the current flock model on this phone's held-out windows and report just the score.
async function evalRound() {
  if (!fs.joined || !state?.global?.mu || fs.evaluated === state.round) return;
  const { test } = split(ctx.getDataset());
  const ev = evaluate(state.global, test);
  if (!ev || ev.total < 3) return;
  const round = state.round;
  state = await post({ op: 'eval', client: client(), round, correct: ev.correct, total: ev.total });
  fs.evaluated = round; fs.lastAcc = ev.acc; save();
}

// Switch this phone to the flock model when a new round lands.
function adopt() {
  if (!fs.joined || !fs.use || !state?.global?.mu || state.round < 1 || fs.adopted === state.round) return;
  const m = toMLP(state.global);
  m.trainedAt = new Date().toISOString();
  m.stats = { valAcc: fs.evaluated === state.round ? fs.lastAcc : null, source: 'flock', round: state.round };
  fs.adopted = state.round; save();
  ctx.setModel(m, 'flock');
  ctx.toast(`Flock model round ${state.round} is live on this phone.`);
}

// Train on this phone from the flock model and send only the new weights.
async function share(manual) {
  if (!state) { if (manual) msg('Flock server not reachable. Training stays local.'); return; }
  if (!fs.joined) { if (manual) msg('Join the flock first.'); return; }
  const data = ctx.getDataset();
  const { train } = split(data);
  const counts = Object.fromEntries(ACTS.map((a) => [a, train.filter((r) => r.label === a).length]));
  if (train.length < MIN_TRAIN) {
    if (manual) msg(`Record a little more first (${train.length} of ${MIN_TRAIN} windows). Try "Teach the flock".`);
    return;
  }
  const me = client().id;
  if (!manual) {
    // Auto mode: once per round, and only if there's something new to learn: new data on this phone,
    // or a round that pooled other penguins' updates.
    if (fs.sharedRound === state.round || state.pending.ids.includes(me)) return;
    const last = state.history[state.history.length - 1];
    const othersHelped = last && (last.ids || []).some((id) => id !== me);
    if (data.length === fs.sharedSize && !othersHelped) return;
  }
  msg('Training on this phone...');
  await new Promise((r) => setTimeout(r, 30));
  const up = localUpdate(state.global, train);
  const payload = updatePayload(client(), state.round, up);
  const bytes = JSON.stringify(payload).length;
  el.fkPayload.textContent = `${bytes} bytes. Raw motion windows included: 0.\n\n` + JSON.stringify(payload, null, 1).slice(0, 4000) + (bytes > 4000 ? '\n...' : '');
  try {
    state = await post(payload);
    online = true;
    fs.sharedRound = state.aggregated ? state.round - 1 : state.round;
    fs.sharedSize = data.length; fs.contributions++; save();
    msg(state.aggregated ? `Shared ${up.n} windows' worth of learning. Round ${state.round} is ready!`
      : `Shared. Waiting for ${Math.max(0, state.pending.needed - state.pending.count)} more penguin(s) or ${state.pending.closesIn ?? '?'} s for the round to close.`);
    ctx.chirp('happy');
    adopt();
  } catch (e) {
    online = false;
    msg('Could not reach the flock. Your model still trained locally; it will share next time.');
  }
  render();
}

// ---------------------------------------------------------------- guided recording
function startTeach() {
  if (teach) { teach = null; el.fkTeachBox.classList.add('hidden'); el.fkTeach.textContent = 'Teach the flock (30 s)'; return; }
  if (!ctx.detector.hasSensor && !ctx.detector.sim) return ctx.toast('No motion sensor. Open this on your phone.');
  teach = { step: 0, phase: 'ready', t0: performance.now(), n: 0, rows: [] };
  el.fkTeachBox.classList.remove('hidden');
  el.fkTeach.textContent = 'Stop';
  if (!fs.joined) { fs.joined = true; save(); }
  ctx.chirp('hello');
  tickTeach();
}

function tickTeach() {
  if (!teach) return;
  const s = TEACH[teach.step];
  const el_ = (performance.now() - teach.t0) / 1000;
  if (teach.phase === 'ready') {
    const left = Math.ceil(3 - el_);
    el.fkTeachSay.textContent = `${s.say} in ${left}...`;
    el.fkTeachBar.style.width = '0';
    if (el_ >= 3) { teach.phase = 'rec'; teach.t0 = performance.now(); teach.skip = 2; ctx.vibrate(80); ctx.chirp('tick'); }
  } else {
    el.fkTeachSay.textContent = `${s.say}: ${Math.max(0, Math.ceil(s.secs - el_))} s`;
    el.fkTeachBar.style.width = Math.min(100, el_ / s.secs * 100) + '%';
    if (el_ >= s.secs) {
      teach.step++; teach.phase = 'ready'; teach.t0 = performance.now();
      if (teach.step >= TEACH.length) return finishTeach();
    }
  }
  setTimeout(tickTeach, 250);
}

function onWindow({ f }) {
  if (!teach || teach.phase !== 'rec' || !f) return;
  if (teach.skip > 0) { teach.skip--; return; }   // the 2 s window still holds the previous activity
  teach.rows.push({ f: f.map((v) => +v.toFixed(5)), label: TEACH[teach.step].label });
}

function finishTeach() {
  const rows = teach.rows;
  teach = null;
  el.fkTeachBox.classList.add('hidden');
  el.fkTeach.textContent = 'Teach the flock (30 s)';
  ctx.addData(rows);
  ctx.vibrate([80, 60, 80]); ctx.chirp('evolve');
  msg(`Recorded ${rows.length} windows. They stay on this phone. Training and sharing what was learned...`);
  share(true);
}

// ---------------------------------------------------------------- render
function render() {
  const data = ctx.getDataset();
  el.fkLocal.textContent = `${data.length} windows`;
  el.fkLocalSub.textContent = `about ${(data.length * 100).toLocaleString()} accelerometer readings, never uploaded`;
  el.fkNet.textContent = online === null ? 'connecting' : online ? (state?.store === 'redis' ? 'flock online' : 'flock online (demo store)') : 'offline';
  el.fkNet.className = 'chip' + (online ? ' ok' : '');
  el.fkJoin.textContent = fs.joined ? 'Leave the flock' : 'Join the flock';
  el.fkJoin.className = fs.joined ? 'btn-ghost' : 'btn-chrome';
  el.fkMine.textContent = fs.contributions;
  if (!state) return;
  el.fkRound.textContent = state.round;
  el.fkMembers.textContent = `${state.totals.active}/${state.totals.members}`;
  el.fkAcc.textContent = fs.evaluated === state.round ? pct(fs.lastAcc) : (fs.lastAcc != null ? pct(fs.lastAcc) + '*' : '--');
  const me = client().id;
  el.fkStrip.innerHTML = '';
  for (const m of state.members.slice(0, 16)) {
    const d = document.createElement('div');
    d.className = 'fk-peng' + (m.id === me ? ' me' : '') + (m.active ? '' : ' idle') + (state.pending.ids.includes(m.id) ? ' pending' : '');
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 32;
    const img = sprite(m.form, 0); if (img) cv.getContext('2d').drawImage(img, 0, 0, 32, 32);
    const name = document.createElement('span');
    name.textContent = (m.id === me ? 'you' : m.name) + (m.sim ? ' (sim)' : '');
    d.append(cv, name);
    el.fkStrip.appendChild(d);
  }
}
