// Roam (desktop companion seam). Two jobs:
//  1. Broadcasts the pet's state, its little lines and Professor Liveoak's lines on the
//     BroadcastChannel 'pengbit-roam', so roam.html (the desktop overlay from desktop/, or any
//     other same-origin window) can show the same Pengbit walking around.
//  2. Adds a ROAM button on the pet screen. In the desktop app it turns the desktop overlay on and off;
//     in a normal browser it lets Pengbit roam over this page (the fallback when the desktop app
//     isn't running).
// Uses only the seam: ctx (pet, getActivity, chirp) and bus events.
import { createRoamer, loadSprites } from './roamer.js';

const CH = 'pengbit-roam';
let ctx = null, chan = null, roamer = null, layer = null;
let posture = null, dead = false;
const desktop = typeof window !== 'undefined' ? window.pengbitDesktop : null;   // set by desktop/preload.cjs

function snapshot() {
  const p = ctx.pet || {};
  const a = ctx.getActivity ? ctx.getActivity() : {};
  return {
    t: Date.now(), name: p.name || 'Pengbit', form: p.form, isEgg: !!p.isEgg, happy: p.happy, energy: p.energy,
    hungry: !!p.hungry, sad: !!p.sad, shivering: !!p.shivering, stillMin: Math.floor((p.stillStreak || 0) / 60),
    mode: p.mode, act: a.act, posture, dead,
    graves: (ctx.names?.graveyard?.() || []).map((g) => g.name).filter(Boolean).slice(-6),
  };
}

function send(msg) {
  try { chan?.postMessage(msg); } catch { /* closed */ }
  if (roamer) {
    if (msg.type === 'state') roamer.setState(msg.state);
    else if (msg.type === 'say') roamer.say(msg.text, msg);
  }
}

export async function init(c) {
  ctx = c;
  if ('BroadcastChannel' in window) {
    chan = new BroadcastChannel(CH);
    chan.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'poke') poke();
      else if (m.type === 'hello') send({ type: 'state', state: snapshot() });
    };
  }
  setInterval(() => send({ type: 'state', state: snapshot() }), 500);

  const bus = ctx.bus;
  if (bus) {
    const lines = { 'pet:hungry': 'hungry...', 'pet:sad': ':(', 'pet:idle': 'brrr... walk with me?', 'pet:move': 'warm!' };
    for (const [type, text] of Object.entries(lines)) bus.on(type, () => send({ type: 'say', who: 'pet', text, ms: 3500 }));
    bus.on('exercise:done', (p) => send({ type: 'say', who: 'pet', text: p?.reps ? `${p.reps} reps!` : 'strong!', ms: 3000 }));
    bus.on('desk:posture', (p) => { posture = p?.label || null; });
    bus.on('mode:changed', () => { posture = null; });
    bus.on('pet:died', () => { dead = true; });
    bus.on('pet:named', (p) => p?.name && send({ type: 'say', who: 'pet', text: `I'm ${p.name}!`, ms: 4000 }));
    bus.on('pet:hatched', () => { dead = false; });
  }
  // A new egg after a death: the pet is an egg again and alive.
  setInterval(() => { if (dead && ctx.pet?.isEgg && !document.getElementById('moodRip')) dead = false; }, 1000);

  // Professor lines: main.js writes every dex entry and coaching tip into #dexText.
  const dexText = document.getElementById('dexText');
  let lastProf = '';
  if (dexText) new MutationObserver(() => {
    const t = dexText.textContent.trim();
    if (!t || t === lastProf || /writing\.\.\.$/.test(t)) return;
    lastProf = t;
    send({ type: 'say', who: 'prof', text: t });
  }).observe(dexText, { childList: true, characterData: true, subtree: true });

  addButton();
  if (desktop?.onRoamChanged) desktop.onRoamChanged((on) => setLabel(on));
}

function poke() {
  // Clicking the roaming penguin counts as playing with it (button B).
  const b = document.getElementById('btnB');
  if (!b) return;
  b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
}

// ------------------------------------------------------------ button
function addButton() {
  const scene = document.getElementById('scene');
  if (!scene || document.getElementById('roamLaunch')) return;
  const b = document.createElement('button');
  b.id = 'roamLaunch';
  b.type = 'button';
  b.title = desktop ? 'Let Pengbit loose on your desktop' : 'Let Pengbit roam around this page';
  b.onclick = toggle;
  Object.assign(b.style, {
    position: 'absolute', top: '6px', left: '6px', zIndex: 5, padding: '2px 7px', cursor: 'pointer',
    font: 'bold 10px "Lucida Console", monospace', letterSpacing: '1px', color: '#0d2a36',
    background: '#c9d3e0', border: '2px solid', borderColor: '#fff #6b7684 #6b7684 #fff',
  });
  const host = scene.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(b);
  setLabel(false);
  if (desktop?.isRoaming) Promise.resolve(desktop.isRoaming()).then(setLabel).catch(() => {});
}

function setLabel(on) {
  const b = document.getElementById('roamLaunch');
  if (!b) return;
  b.textContent = on ? 'CATCH' : 'ROAM';
  b.style.background = on ? '#9ff3ff' : '#c9d3e0';
}

async function toggle() {
  if (desktop?.toggleRoam) { setLabel(await desktop.toggleRoam()); return; }
  if (roamer) { stopInPage(); return; }
  await startInPage();
}

// ------------------------------------------------------------ in-page fallback
async function startInPage() {
  await loadSprites();
  layer = document.createElement('div');
  layer.id = 'roamLayer';
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: 9999, pointerEvents: 'none', overflow: 'hidden' });
  document.body.appendChild(layer);
  roamer = createRoamer(layer, { onPoke: poke });
  roamer.setState(snapshot());
  window.addEventListener('mousemove', onMove);
  setLabel(true);
  roamer.say(`${ctx.pet?.name || 'Pengbit'} is loose! Press CATCH to put me back.`, { ms: 4000 });
}
function onMove(e) { roamer?.setCursor(e.clientX, e.clientY); }
function stopInPage() {
  roamer?.destroy(); roamer = null;
  layer?.remove(); layer = null;
  window.removeEventListener('mousemove', onMove);
  setLabel(false);
}
