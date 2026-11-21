// W1 Pebblebit Flock: the live screen (flock.html). Polls /api/flock and draws the flock around
// the shared model, the accuracy by round, and optionally runs simulated penguins in this browser.
import { loadSprites, sprite } from './sprites.js';
import { getState, post } from './flock-core.js';
import { SimPenguin } from './flock-sim.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 2000;
let state = null, prevRound = null, pulses = [], online = null;
let sims = [], simTimer = null;

// ---------------------------------------------------------------- QR
function drawQR() {
  const url = new URL('./?flock=1', location.href).href;
  $('joinUrl').textContent = url.replace(/^https?:\/\//, '').replace(/\/\?flock=1$/, '');
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(url); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch { $('qr').textContent = url; }
}

// ---------------------------------------------------------------- polling
async function poll() {
  try {
    state = await getState();
    online = true;
  } catch { online = false; }
  render();
}

function render() {
  $('net').textContent = online ? (state.store === 'redis' ? 'live' : 'live (demo store)') : online === false ? 'server unreachable' : 'connecting';
  $('net').className = 'chip' + (online ? ' ok' : '');
  if (!state) return;
  if (prevRound !== null && state.round > prevRound) { pulses.push({ t: performance.now() }); }
  prevRound = state.round;

  $('round').textContent = state.round;
  $('members').textContent = state.totals.active;
  const lastAcc = [...state.history].reverse().find((h) => h.acc != null);
  $('acc').textContent = lastAcc ? Math.round(lastAcc.acc * 100) + '%' : '--';
  $('onPhones').textContent = `${state.totals.samplesOnPhones.toLocaleString()} motion windows stay on phones`;
  const p = state.pending;
  $('pendingLine').textContent = !state.members.length ? 'Waiting for penguins...'
    : p.count ? `${p.count} update${p.count > 1 ? 's' : ''} in · round ${state.round + 1} closes at ${p.needed} or in ${p.closesIn} s`
    : `Round ${state.round} model is out. Waiting for updates...`;

  $('log').innerHTML = [...state.history].reverse().slice(0, 12).map((h) =>
    `<li><b>Round ${h.round}</b> · ${h.clients} penguin${h.clients > 1 ? 's' : ''} (${esc(h.names.join(', '))}) · ${h.samples} windows${h.acc != null ? ` · ${Math.round(h.acc * 100)}%` : ''}</li>`).join('');
  drawChart();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- chart
function drawChart() {
  const c = $('chart'), g = c.getContext('2d'), W = c.width, H = c.height;
  const L = 48, R = 14, T = 14, B = 34;
  g.clearRect(0, 0, W, H);
  g.font = '18px VT323, monospace'; g.fillStyle = '#b9b2de'; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  for (const v of [0, 0.5, 1]) {
    const y = T + (1 - v) * (H - T - B);
    g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke();
    g.fillText(Math.round(v * 100) + '%', 6, y + 5);
  }
  // chance line (3 classes)
  const yc = T + (1 - 1 / 3) * (H - T - B);
  g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,0.3)';
  g.beginPath(); g.moveTo(L, yc); g.lineTo(W - R, yc); g.stroke(); g.setLineDash([]);
  g.fillText('chance', W - R - 52, yc - 6);

  const pts = state.history.filter((h) => h.acc != null);
  if (!pts.length) { g.fillText('Accuracy appears after the first round is scored', L + 8, H / 2 - 30); return; }
  const r0 = pts[0].round, r1 = Math.max(r0 + 1, pts[pts.length - 1].round);
  const X = (r) => L + (r - r0) / (r1 - r0) * (W - L - R);
  const Y = (a) => T + (1 - a) * (H - T - B);
  g.fillStyle = '#b9b2de';
  g.fillText(`round ${r0}`, L, H - 8); g.fillText(`round ${r1}`, W - R - 70, H - 8);
  g.strokeStyle = '#ff6bf1'; g.lineWidth = 3; g.beginPath();
  pts.forEach((h, i) => (i ? g.lineTo(X(h.round), Y(h.acc)) : g.moveTo(X(h.round), Y(h.acc))));
  g.stroke();
  g.fillStyle = '#ffd84a';
  for (const h of pts) { g.beginPath(); g.arc(X(h.round), Y(h.acc), 4, 0, 7); g.fill(); }
}

// ---------------------------------------------------------------- ring animation
function drawRing(now) {
  const c = $('ring'), g = c.getContext('2d'), W = c.width, H = c.height, cx = W / 2, cy = H / 2 - 6;
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  const ms = state ? state.members.slice(0, 24) : [];
  const rad = Math.min(W, H) / 2 - 64;
  const pos = ms.map((m, i) => {
    const a = -Math.PI / 2 + i / Math.max(1, ms.length) * Math.PI * 2;
    return { m, x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad };
  });

  // spokes
  g.strokeStyle = 'rgba(159,243,255,0.18)'; g.lineWidth = 2;
  for (const p of pos) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(p.x, p.y); g.stroke(); }

  // round pulses (new shared model going out to everyone)
  pulses = pulses.filter((p) => now - p.t < 1600);
  for (const p of pulses) {
    const k = (now - p.t) / 1600;
    g.strokeStyle = `rgba(255,216,74,${1 - k})`; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, cy, 40 + k * rad, 0, 7); g.stroke();
    g.fillStyle = `rgba(255,216,74,${1 - k})`;
    for (const q of pos) { g.beginPath(); g.arc(cx + (q.x - cx) * k, cy + (q.y - cy) * k, 5, 0, 7); g.fill(); }
  }

  // pending updates travel in (weights only)
  const pend = new Set(state?.pending.ids || []);
  for (const p of pos) {
    if (!pend.has(p.m.id)) continue;
    for (let j = 0; j < 3; j++) {
      const k = ((now / 1400) + j / 3) % 1;
      g.fillStyle = '#ff6bf1';
      g.beginPath(); g.arc(p.x + (cx - p.x) * k, p.y + (cy - p.y) * k, 5, 0, 7); g.fill();
    }
  }

  // the shared model
  const glow = 6 + Math.sin(now / 400) * 3;
  const grad = g.createRadialGradient(cx, cy, 6, cx, cy, 58 + glow);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, '#9ff3ff'); grad.addColorStop(1, 'rgba(80,200,255,0)');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, 58 + glow, 0, 7); g.fill();
  g.fillStyle = '#1b1442'; g.textAlign = 'center';
  g.font = '12px "Press Start 2P", monospace'; g.fillText('SHARED', cx, cy - 8);
  g.font = '12px "Press Start 2P", monospace'; g.fillText('MODEL', cx, cy + 8);
  g.font = '22px VT323, monospace'; g.fillText(`round ${state?.round ?? 0}`, cx, cy + 30);

  // penguins
  for (const p of pos) {
    const m = p.m;
    g.globalAlpha = m.active ? 1 : 0.4;
    const bob = m.active ? Math.round(Math.sin(now / 300 + p.x) * 2) : 0;
    const img = sprite(m.form, Math.floor(now / 500 + p.y) % 2);
    if (pend.has(m.id)) { g.fillStyle = 'rgba(255,107,241,0.25)'; g.beginPath(); g.arc(p.x, p.y, 40, 0, 7); g.fill(); }
    if (img) g.drawImage(img, p.x - 32, p.y - 40 + bob, 64, 64);
    g.fillStyle = m.sim ? '#b9b2de' : '#f3f0ff';
    g.font = '20px VT323, monospace';
    g.fillText(m.name + (m.sim ? ' (sim)' : ''), p.x, p.y + 38);
    g.fillStyle = '#ffd84a';
    g.fillText(`${m.contributions} update${m.contributions === 1 ? '' : 's'}`, p.x, p.y + 56);
    g.globalAlpha = 1;
  }
  g.textAlign = 'start';
  requestAnimationFrame(drawRing);
}

// ---------------------------------------------------------------- simulated penguins
async function simStep() {
  if (!sims.length) return;
  try {
    let s = await getState();
    for (const b of sims) { const r = await b.step(s); if (r) s = r; }
  } catch (e) { console.warn('[flock sim]', e.message); }
  poll();
}

function setSims(on) {
  clearInterval(simTimer); simTimer = null;
  sims = on ? [0, 1, 2, 3].map((i) => new SimPenguin(i)) : [];
  $('simNote').classList.toggle('hidden', !on);
  if (on) { simStep(); simTimer = setInterval(simStep, 6000); }
}

// ---------------------------------------------------------------- boot
async function boot() {
  drawQR();
  await loadSprites();
  $('closeRound').onclick = async () => { try { state = await post({ op: 'aggregate' }); render(); } catch {} };
  $('sims').onchange = (e) => setSims(e.target.checked);
  if (new URLSearchParams(location.search).has('sim')) { $('sims').checked = true; setSims(true); }
  await poll();
  setInterval(poll, POLL_MS);
  requestAnimationFrame(drawRing);
}
boot();
