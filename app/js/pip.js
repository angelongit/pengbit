// Pengbit's floating window (Daniel, W6): a Y2K mini window that stays on top of your homework,
// using Chrome's Document Picture-in-Picture API. Shows the pet, its stats and posture, and
// Professor Liveoak's lines in a Clippy-style speech bubble.
// If Picture-in-Picture isn't available (Safari, Firefox, phones), the button never appears and
// Pengbit simply stays in the normal tab.
//
// Talks to the app only through the seam: ctx (pet, getActivity, toast) and bus events
// (pet:*, desk:posture, mode:changed). Exposes ctx.pip = { open, close, isOpen } so other
// features (e.g. the Desk tab) can offer a "Float" button too, and sets ctx.pipOpen while open.
import { sprite } from './sprites.js';
import { MODE_LABELS } from './pet.js';

const SUPPORTED = typeof window !== 'undefined' && 'documentPictureInPicture' in window;
const W = 48, H = 40;                       // virtual pixels of the floating scene

let ctx = null;
let win = null;                             // the PiP window
let els = {};
let raf = 0;
let bubbleTimer = 0, petTalkTimer = 0;
let lastProfText = '';
let slouchSince = 0;
const extra = {};                           // slouch_a / slouch_b / professor images

function loadImg(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}

export async function init(c) {
  ctx = c;
  ctx.pip = { open, close, isOpen: () => !!win, supported: SUPPORTED };
  ctx.pipOpen = false;
  if (!SUPPORTED) return;                   // stay in the normal tab, show nothing broken

  [extra.slouch_a, extra.slouch_b, extra.professor] = await Promise.all(
    ['sprites/slouch_a.png', 'sprites/slouch_b.png', 'sprites/professor.png'].map(loadImg));

  addLaunchButton();
  listen();
}

// ------------------------------------------------------------ launcher in the main page
function addLaunchButton() {
  const scene = document.getElementById('scene');
  if (!scene || document.getElementById('pipLaunch')) return;
  const b = document.createElement('button');
  b.id = 'pipLaunch';
  b.className = 'pip-launch';
  b.type = 'button';
  b.title = 'Float Pengbit over your other windows';
  b.textContent = 'FLOAT';
  b.onclick = () => (win ? close() : open());
  Object.assign(b.style, {
    position: 'absolute', top: '6px', right: '6px', zIndex: 5, padding: '2px 7px', cursor: 'pointer',
    font: 'bold 10px "Lucida Console", monospace', letterSpacing: '1px', color: '#0d2a36',
    background: '#c9d3e0', border: '2px solid', borderColor: '#fff #6b7684 #6b7684 #fff',
  });
  const host = scene.parentElement;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(b);
}

// ------------------------------------------------------------ open / close
export async function open() {
  if (!SUPPORTED) { ctx?.toast?.('The floating window needs Chrome on a laptop. Pengbit stays here.'); return false; }
  if (win) { win.focus(); return true; }
  try {
    win = await window.documentPictureInPicture.requestWindow({ width: 280, height: 330 });
  } catch (e) {
    console.warn('[pip] could not open', e);
    ctx?.toast?.('Could not open the floating window. Pengbit stays here.');
    win = null;
    return false;
  }
  const link = win.document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../css/pip.css', import.meta.url).href;
  win.document.head.appendChild(link);
  win.document.title = 'Pengbit';
  build(win.document);
  win.addEventListener('pagehide', onClosed);
  ctx.pipOpen = true;
  setLauncher(true);
  loop();
  // Show the professor's latest line right away so the window never opens empty.
  const t = document.getElementById('dexText')?.textContent?.trim();
  if (t && !/writing\.\.\.$/.test(t)) profSay(t, 8000);
  return true;
}

function setLauncher(on) {
  const b = document.getElementById('pipLaunch');
  if (!b) return;
  b.textContent = on ? 'DOCK' : 'FLOAT';
  b.style.background = on ? '#9ff3ff' : '#c9d3e0';
}

export function close() { if (win) win.close(); }

function onClosed() {
  cancelAnimationFrame(raf);
  win = null; els = {};
  ctx.pipOpen = false;
  setLauncher(false);
}

function build(doc) {
  doc.body.innerHTML = `
  <div class="pip-window">
    <div class="pip-titlebar"><span class="pip-icon"></span><span class="pip-title">PENGBIT.EXE</span>
      <span class="pip-btns"><b>_</b><b>&#9633;</b><b class="pip-x" title="Close">x</b></span></div>
    <div class="pip-screen">
      <canvas class="pip-scene" width="${W}" height="${H}"></canvas>
      <div class="pip-petbubble hidden"></div>
      <div class="pip-chip"></div>
    </div>
    <div class="pip-stats">
      <label>HAPPY</label><div class="pip-bar"><i class="pip-happy"></i></div>
      <label>ENERGY</label><div class="pip-bar"><i class="pip-energy"></i></div>
    </div>
    <div class="pip-status"><span class="pip-name"></span><span class="pip-streak"></span></div>
    <div class="pip-prof hidden">
      <canvas class="pip-face" width="32" height="32"></canvas>
      <div class="pip-say"><p></p><button type="button">OK</button></div>
    </div>
  </div>`;
  const q = (s) => doc.querySelector(s);
  els = {
    scene: q('.pip-scene'), g: q('.pip-scene').getContext('2d'),
    petBubble: q('.pip-petbubble'), chip: q('.pip-chip'),
    happy: q('.pip-happy'), energy: q('.pip-energy'),
    name: q('.pip-name'), streak: q('.pip-streak'),
    prof: q('.pip-prof'), profText: q('.pip-say p'), face: q('.pip-face'),
  };
  els.g.imageSmoothingEnabled = false;
  q('.pip-x').onclick = close;
  q('.pip-say button').onclick = () => els.prof.classList.add('hidden');
  drawFace();
}

function drawFace() {
  const fg = els.face.getContext('2d');
  fg.imageSmoothingEnabled = false;
  fg.clearRect(0, 0, 32, 32);
  if (extra.professor) fg.drawImage(extra.professor, 0, 0, 32, 32);
  else { const f = document.getElementById('profFace'); if (f) fg.drawImage(f, 0, 0, 32, 32); }
}

// ------------------------------------------------------------ events
function listen() {
  const bus = ctx.bus;
  if (!bus) return;
  const petLines = {
    'pet:hatched': 'hi!', 'pet:evolved': '!!!', 'pet:hungry': 'hungry...', 'pet:sad': ':(',
    'pet:idle': 'brrr...', 'pet:move': 'warm!',
  };
  for (const [type, line] of Object.entries(petLines)) bus.on(type, () => petSay(line, type === 'pet:idle' ? 4000 : 2500));
  bus.on('exercise:done', (p) => petSay(p?.reps ? `${p.reps} reps!` : 'strong!', 3000));
  bus.on('desk:posture', (p) => {
    if (p?.label === 'slouch') {
      if (!slouchSince) slouchSince = Date.now();
      else if (Date.now() - slouchSince > 8000 && !petTalkTimer) petSay('sit up!', 2500);
    } else slouchSince = 0;
  });
  bus.on('mode:changed', () => win && render());

  // Professor lines: main.js writes every dex entry and coaching tip into #dexText.
  const dexText = document.getElementById('dexText');
  if (dexText) new MutationObserver(() => {
    const t = dexText.textContent.trim();
    if (!t || t === lastProfText) return;
    if (/writing\.\.\.$/.test(t)) { profSay('...', 0); return; }
    profSay(t);
  }).observe(dexText, { childList: true, characterData: true, subtree: true });
}

function petSay(text, ms = 2500) {
  if (!win) return;
  els.petBubble.textContent = text;
  els.petBubble.classList.remove('hidden');
  clearTimeout(petTalkTimer);
  petTalkTimer = setTimeout(() => { petTalkTimer = 0; els.petBubble?.classList.add('hidden'); }, ms);
}

function profSay(text, ms) {
  lastProfText = text;
  if (!win) return;
  els.profText.textContent = text.length > 260 ? text.slice(0, 257) + '...' : text;
  els.prof.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  const stay = ms ?? Math.min(30000, 6000 + text.length * 70);     // long enough to read along with the voice
  if (stay) bubbleTimer = setTimeout(() => els.prof?.classList.add('hidden'), stay);
}

// ------------------------------------------------------------ drawing
function render() {
  const pet = ctx.pet, a = ctx.getActivity ? ctx.getActivity() : { act: 'still' };
  const labels = MODE_LABELS[pet.mode] || MODE_LABELS.phone;
  els.happy.style.width = pet.happy + '%';
  els.energy.style.width = pet.energy + '%';
  els.happy.classList.toggle('low', pet.happy < 20);
  els.energy.classList.toggle('low', pet.energy < 20);
  els.name.textContent = (pet.name || 'Pengbit').toUpperCase();
  els.streak.textContent = pet.isEgg ? 'hatching...' : `seated ${Math.floor((pet.stillStreak || 0) / 60)}m`;
  const conf = a.conf ? ` ${Math.round(a.conf * 100)}%` : '';
  els.chip.textContent = `${labels[a.act] || a.act || ''}${conf}`;
  els.chip.className = 'pip-chip ' + (a.act || '');
}

let lastStatus = 0;
function loop(now = performance.now()) {
  if (!win) return;
  raf = win.requestAnimationFrame(loop);
  if (now - lastStatus > 250) { lastStatus = now; render(); }
  draw(now);
}

function draw(now) {
  const g = els.g, pet = ctx.pet;
  const act = (ctx.getActivity ? ctx.getActivity() : {}).act || 'still';
  const slouching = pet.mode === 'desk' && act === 'shake' && !pet.isEgg;
  g.fillStyle = pet.form === 'frost' ? '#0d3040' : pet.form === 'glitch' ? '#1a0d2e' : '#0d2a36';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1f5566'; g.fillRect(0, 36, W, 1);

  if (pet.shivering || pet.form === 'frost') {               // a few snowflakes
    g.fillStyle = '#d8f6ff';
    for (let i = 0; i < 6; i++) g.fillRect((i * 9 + 3) % W, Math.floor((now / 40 + i * 13) % 36), 1, 1);
  }

  const period = act === 'shake' ? 140 : act === 'walk' ? 260 : 800;
  const frame = Math.floor(now / period) % 2;
  let x = 8, y = 4;
  if (pet.isEgg) { if (Math.floor(now / 1800) % 3 === 0) x += Math.round(Math.sin(now / 60) * 1.5); }
  else if (act === 'walk') y += frame ? -1 : 0;
  else if (!slouching) y += frame;
  if (pet.shivering) x += (Math.floor(now / 50) % 2) ? 1 : -1;

  const img = slouching && extra.slouch_a ? (frame ? extra.slouch_b : extra.slouch_a) : sprite(pet.form, frame);
  if (img) { if (ctx.paintPet) ctx.paintPet(g, img, x, y, now, frame); else g.drawImage(img, x, y, 32, 32); }

  if (pet.mode === 'desk' && act === 'walk' && !pet.isEgg) {   // away: empty desk chair hint
    g.fillStyle = '#ffd84a'; g.fillRect(41, 6, 3, 1); g.fillRect(42, 5, 1, 3);
  }
  if ((slouching || pet.form === 'glitch') && Math.random() < (slouching ? 0.3 : 0.12)) {
    const sy = Math.floor(Math.random() * H), sh = 1 + Math.floor(Math.random() * 3);
    g.putImageData(g.getImageData(0, sy, W, sh), Math.round((Math.random() - 0.5) * 6), sy);
  }
  if (pet.hungry) { g.fillStyle = '#ff7a7a'; g.fillRect(2, 2, 2, 2); }
  if (pet.sad) { g.fillStyle = '#ff7a7a'; g.fillRect(5, 2, 2, 2); }
}
