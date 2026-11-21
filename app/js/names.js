// Pet names and the Pebblebit memorial.
//
// Naming: when the egg hatches, a dialog asks for the chick's name. Names of Pebblebits that have
// passed away are retired for good (case and spaces don't matter), and Professor Liveoak gently
// says why when you try one. The Setup name field follows the same rule.
//
// Memorial: when a Pebblebit dies (mood.js emits pet:died), it gets a permanent tombstone with its
// name, form and dates. Tombstones stand in the background of every later pet's scene, and the
// scene takes turns showing each one's name above its stone. The list lives in localStorage
// (pengbit.graveyard) and is also shown in Setup.
//
// Shared state for other features (e.g. the desktop-roaming Pebblebit): ctx.pet.name is the name,
// the bus emits pet:named {name} when it changes, and ctx.names = { current(), isRetired(name),
// graveyard() }.
//
// Seam: init(ctx) sets ctx.paintBackdrop(g, now, W, H), which main.js calls after the ground and
// before the pet. Uses ctx.store, ctx.pet, ctx.bus, ctx.say, ctx.toast, ctx.bubble, ctx.render.
import { FORMS } from './pet.js';
import { sprite } from './sprites.js';

const MAX_LEN = 12;
const KEY = 'graveyard';
const SUGGEST = ['Pip', 'Waddles', 'Bitsy', 'Floppy', 'Nibbles', 'Pixel', 'Tux Jr', 'Sprocket', 'Byte', 'Glacier',
  'Mochi', 'Zip', 'Pebble', 'Dial-Up', 'Gizmo', 'Flipper', 'Kilobyte', 'Sleet', 'Bubbles', 'Neon', 'Chirp', 'Frosty'];

// Same name = same letters, ignoring case, accents' width forms and all whitespace.
export const normName = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);

let ctx = null;
let graves = [];      // [{id, name, form, formName, age, hatchedAt, diedAt}] oldest first
let mourning = false; // mood.js is showing the current pet's own grave
let dialog = null;

const retired = (name) => {
  const n = normName(name);
  return n ? graves.find((g) => normName(g.name) === n) || null : null;
};

function fmtAge(s) {
  const m = Math.floor((s || 0) / 60);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`;
}
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '?');

// ------------------------------------------------------------ Professor Liveoak
const formWord = (g) => (g.form && g.form !== 'baby' && g.form !== 'egg' ? FORMS[g.form]?.name || 'Pebblebit' : 'little Pebblebit');
const DISCOURAGE = [
  (g) => `Ah. ${g.name}. That name is already carved on a little stone out back, where ${g.name} the ${formWord(g)} is resting. Let's leave it with them, and give this chick a name of its very own.`,
  (g) => `Hmm, I'm afraid ${g.name} is taken, in the gentlest way. It belongs to an old friend who lived ${g.age}. We honor them best by letting this little one be someone new.`,
  (g) => `I remember ${g.name}. A fine penguin. Let's not ask this chick to fill those flippers. A fresh name, for a fresh start.`,
];
let discourageN = 0;
function discourage(g) {
  const text = DISCOURAGE[discourageN++ % DISCOURAGE.length](g);
  ctx.say?.(text);
  const el = document.getElementById('dexText');
  if (el) el.textContent = text;
  const src = document.getElementById('aiSource');
  if (src) src.textContent = 'From Professor Liveoak.';
  return text;
}

// ------------------------------------------------------------ graveyard
function save() { ctx.store.set(KEY, graves); }

function bury(dead) {
  if (!dead) return;
  const id = dead.at || Date.now();
  if (graves.some((g) => g.id === id)) return;
  const pet = ctx.pet;
  graves.push({
    id,
    name: dead.name || pet.name || 'Pebblebit',
    form: pet.form,
    formName: FORMS[pet.form]?.name || 'Pebblebit',
    age: dead.age || fmtAge(pet.age),
    hatchedAt: pet.hatchedAt || null,
    diedAt: id,
  });
  save();
  renderMemorial();
}

// ------------------------------------------------------------ naming
function setName(name) {
  const pet = ctx.pet;
  pet.name = name;
  pet.named = true;
  ctx.store.set('pet', pet);
  const input = document.getElementById('nameInput');
  if (input) input.value = name;
  ctx.render?.();
  ctx.bus?.emit('pet:named', { name });
}

function suggestion() {
  const free = SUGGEST.filter((s) => !retired(s) && normName(s) !== normName(ctx.pet.name));
  return free.length ? free[Math.floor(Math.random() * free.length)] : `Pebblebit ${graves.length + 1}`;
}

function openNameDialog() {
  if (dialog) return;
  const pet = ctx.pet;
  dialog = document.createElement('div');
  dialog.className = 'nm-overlay';
  dialog.innerHTML = `
    <form class="nm-box" autocomplete="off">
      <div class="nm-title">IT HATCHED!</div>
      <canvas class="nm-chick" width="32" height="32"></canvas>
      <label class="nm-label" for="nmInput">Give your Pebblebit a name</label>
      <input id="nmInput" class="nm-input" maxlength="${MAX_LEN}" placeholder="name" enterkeyhint="done">
      <p class="nm-note" aria-live="polite"></p>
      <div class="nm-row">
        <button type="button" class="btn-ghost nm-suggest">Suggest</button>
        <button type="submit" class="btn-chrome">Name it</button>
      </div>
      ${graves.length ? `<p class="nm-fine">Retired names: ${graves.map((g) => esc(g.name)).join(', ')}</p>` : ''}
    </form>`;
  document.body.appendChild(dialog);

  const img = sprite('baby', 0);
  if (img) { const c = dialog.querySelector('.nm-chick').getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(img, 0, 0, 32, 32); }

  const input = dialog.querySelector('.nm-input');
  const note = dialog.querySelector('.nm-note');
  const form = dialog.querySelector('form');
  const prev = clean(pet.name);
  input.value = prev && prev !== 'Pebblebit' && prev !== 'Pengbit' && prev !== 'Egg' && !retired(prev) ? prev : '';
  input.addEventListener('input', () => { note.textContent = ''; note.classList.remove('bad'); input.classList.remove('bad'); });
  dialog.querySelector('.nm-suggest').onclick = () => { input.value = suggestion(); input.dispatchEvent(new Event('input')); input.focus(); };
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = clean(input.value);
    if (!name) { note.textContent = 'Every Pebblebit deserves a name.'; note.classList.add('bad'); input.focus(); return; }
    const g = retired(name);
    if (g) {
      discourage(g);
      note.textContent = `Professor Liveoak: "${g.name} rests out back. Let's choose a new name."`;
      note.classList.add('bad'); input.classList.add('bad');
      input.select();
      return;
    }
    close();
    setName(name);
    ctx.toast?.(`Welcome to the world, ${name}!`, 3500);
    ctx.bubble?.('peep!', 2500);
  };
  setTimeout(() => input.focus(), 50);
}

function close() { dialog?.remove(); dialog = null; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Setup's name field: same rule as the dialog. main.js sets onchange first; this replaces it.
function guardSetupField() {
  const input = document.getElementById('nameInput');
  if (!input) return;
  input.onchange = () => {
    const name = clean(input.value);
    if (!name) { input.value = ctx.pet.name; return; }
    if (normName(name) === normName(ctx.pet.name)) { if (name !== ctx.pet.name) setName(name); return; }
    const g = retired(name);
    if (g) { input.value = ctx.pet.name; discourage(g); ctx.toast?.(`${g.name} is a retired name.`, 3000); return; }
    setName(name);
  };
}

// ------------------------------------------------------------ memorial list in Setup
function renderMemorial() {
  const setup = document.getElementById('tab-setup');
  if (!setup) return;
  let box = document.getElementById('nmMemorial');
  if (!graves.length) { box?.remove(); return; }
  if (!box) {
    box = document.createElement('details');
    box.id = 'nmMemorial';
    box.className = 'nm-memorial';
    setup.appendChild(box);
  }
  box.innerHTML = `<summary>Memorial (${graves.length})</summary><ul>${[...graves].reverse().map((g) =>
    `<li><b>${esc(g.name)}</b> <span>${esc(g.formName)} · ${g.hatchedAt ? fmtDate(g.hatchedAt) + ' – ' : ''}${fmtDate(g.diedAt)} · lived ${esc(g.age)}</span></li>`).join('')}</ul>
    <p class="fine">Names on these stones are retired.</p>`;
}

// ------------------------------------------------------------ backdrop: tombstones in the scene
// 3x5 pixel font for names over the stones.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', '-': '000000111000000', '.': '000000000000010', "'": '010010000000000', '!': '010010010000010',
  '?': '110001010000010', '&': '010101010101011', '+': '000010111010000', '_': '000000000000111', ' ': '000000000000000',
};
function text(g, s, x, y) {
  let cx = x;
  for (const ch of s) {
    const bits = FONT[ch] || FONT['?'];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(cx + (i % 3), y + Math.floor(i / 3), 1, 1);
    cx += 4;
  }
}
const label = (s) => s.toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Stone tint per form, so you can tell who rests where.
const STONE = {
  sprinter: ['#6f6a55', '#8c8565', '#ffd84a'], frost: ['#55707c', '#6f8f9c', '#9ff3ff'],
  glitch: ['#66557a', '#806c98', '#ff6bf1'], baby: ['#5e6b7c', '#7a8798', '#bfe3ff'], egg: ['#5e6b7c', '#7a8798', '#e8f4ff'],
};
// Front row then back row (x, groundY, scale). Newest graves take the front spots.
const SLOTS = [[3, 55, 1], [86, 55, 1], [14, 55, 1], [75, 55, 1], [8, 51, 0], [80, 51, 0], [20, 51, 0], [69, 51, 0], [26, 50, 0], [63, 50, 0]];

function stone(g, x, base, big, tint) {
  const [body, hi, accent] = tint;
  if (big) {   // 7 wide, 9 tall
    const t = base - 9;
    g.fillStyle = body; g.fillRect(x + 1, t, 5, 1); g.fillRect(x, t + 1, 7, 8);
    g.fillStyle = hi; g.fillRect(x + 1, t + 1, 1, 6);
    g.fillStyle = '#2a3442'; g.fillRect(x + 3, t + 2, 1, 4); g.fillRect(x + 2, t + 3, 3, 1);   // engraved cross
    g.fillStyle = '#2f5d3c'; g.fillRect(x - 1, base - 1, 9, 1);                                    // grass
    g.fillStyle = '#4f8a5e'; g.fillRect(x - 1, base - 2, 1, 1); g.fillRect(x + 7, base - 2, 1, 1);
    g.fillStyle = accent; g.fillRect(x + 7, base - 3, 1, 1);                                       // a flower in its color
  } else {     // 5 wide, 6 tall, dimmer: further back
    const t = base - 6;
    g.globalAlpha = 0.7;
    g.fillStyle = body; g.fillRect(x + 1, t, 3, 1); g.fillRect(x, t + 1, 5, 5);
    g.fillStyle = '#2a3442'; g.fillRect(x + 2, t + 2, 1, 3); g.fillRect(x + 1, t + 3, 3, 1);
    g.fillStyle = accent; g.fillRect(x + 5, base - 2, 1, 1);
    g.globalAlpha = 1;
  }
}

const SHOW_MS = 4000;
function paintBackdrop(g, now, W = 96) {
  if (!graves.length) return;
  const list = graves.slice(0, mourning ? -1 : undefined).reverse().slice(0, SLOTS.length);   // newest first
  if (!list.length) return;
  const placed = list.map((gr, i) => ({ gr, slot: SLOTS[i] }));
  // back row first so front stones overlap them
  for (const p of [...placed].reverse()) stone(g, p.slot[0], p.slot[1], p.slot[2], STONE[p.gr.form] || STONE.baby);

  // take turns showing each name above its stone, fading in and out
  const k = Math.floor(now / SHOW_MS) % placed.length;
  const { gr, slot } = placed[k];
  const s = label(gr.name);
  const w = s.length * 4 - 1;
  const stoneW = slot[2] ? 7 : 5, top = slot[1] - (slot[2] ? 9 : 6);
  const x = Math.max(1, Math.min(W - w - 1, Math.round(slot[0] + stoneW / 2 - w / 2)));
  const y = top - 8;
  const phase = (now % SHOW_MS) / SHOW_MS;
  const a = Math.min(1, phase * 5, (1 - phase) * 5);
  g.globalAlpha = 0.85 * a;
  g.fillStyle = '#0a1f28'; g.fillRect(x - 1, y - 1, w + 2, 7);
  g.fillStyle = '#c9d3e0'; text(g, s, x, y);
  g.fillStyle = (STONE[gr.form] || STONE.baby)[2];
  g.fillRect(Math.round(slot[0] + stoneW / 2), y + 6, 1, Math.max(0, top - y - 7));   // tiny tether down to the stone
  g.globalAlpha = 1;
}

// ------------------------------------------------------------ feature entry
export function init(c) {
  ctx = c;
  graves = ctx.store.get(KEY, []);
  if (!Array.isArray(graves)) graves = [];

  // A pet that died before this feature existed (or before it loaded) still gets its stone.
  const dead = ctx.store.get('dead', null);
  if (dead) { mourning = true; bury(dead); }

  ctx.bus.on('pet:died', () => { mourning = true; bury(ctx.store.get('dead', null)); });
  ctx.bus.on('pet:hatched', () => {
    ctx.pet.hatchedAt = Date.now();
    ctx.pet.named = false;
    openNameDialog();
  });

  // New egg after a death (or Setup's New egg): a retired name never carries over to the egg.
  setInterval(() => {
    const pet = ctx.pet;
    if (mourning && !ctx.store.get('dead', null)) mourning = false;
    if (pet?.isEgg && retired(pet.name)) { pet.name = 'Egg'; ctx.store.set('pet', pet); ctx.render?.(); }
  }, 1000);

  ctx.paintBackdrop = (g, now, W, H) => paintBackdrop(g, now, W, H);
  ctx.names = { current: () => ctx.pet.name, isRetired: (n) => !!retired(n), graveyard: () => graves.slice() };

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../css/names.css', import.meta.url).href;
  document.head.appendChild(link);

  guardSetupField();
  renderMemorial();
  if (ctx.pet.isEgg && retired(ctx.pet.name)) { ctx.pet.name = 'Egg'; ctx.store.set('pet', ctx.pet); ctx.render?.(); }
}
