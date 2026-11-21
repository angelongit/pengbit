// Pengbit's mood look and lifespan (Daniel, W6).
//
// Mood: as joy (happiness) drops, Pengbit visibly declines: duller colors, a rounder body,
// an outgrown scruffy beard, a tatty bathrobe, a rain cloud, and at rock bottom a sad
// cigarette with smoke. Every stage reverses as joy comes back.
//
// Lifespan: if nobody interacts with the app for a week, Pengbit passes away. The screen shows a
// tombstone with its name and a little ghost Pengbit with a halo, plus a button to hatch a new egg.
// Setup has a "Skip a week" test button so the team can demo it without waiting.
//
// Seam: init(ctx) sets ctx.paintPet(g, img, x, y, now, frame), which main.js and pip.js call in
// place of g.drawImage(img, x, y, 32, 32). Uses ctx.store, ctx.pet, ctx.render, ctx.bubble.

export const MOOD = {
  START: 55,          // joy at or above this looks normal
  BOTTOM: 12,         // joy at or below this is the worst look
  STEPS: 4,           // visual stages between them
  CIGARETTE: true,    // set false to drop the cigarette and keep the rest
  SIGH_EVERY_MS: 25000,
};
export const LIFESPAN_MS = 7 * 24 * 60 * 60 * 1000;   // a week without any interaction

export function moodStep(happy) {
  const t = (MOOD.START - happy) / (MOOD.START - MOOD.BOTTOM);
  return Math.max(0, Math.min(MOOD.STEPS, Math.round(t * MOOD.STEPS)));
}

// ------------------------------------------------------------ sprite variants (cached per image + step)
const cache = new WeakMap();   // img -> Map(step -> canvas)
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const ROBE = { a: hex('#9a6a7e'), b: hex('#b07f93'), edge: hex('#6d4456'), belt: hex('#5b3447'), stain: hex('#7b5a49') };
const BEARD = { a: hex('#5d5146'), b: hex('#7d6e60') };

function variant(img, step) {
  let byStep = cache.get(img);
  if (!byStep) { byStep = new Map(); cache.set(img, byStep); }
  if (byStep.has(step)) return byStep.get(step);

  const fat = 1 + 0.08 * step;                       // up to ~1.32x wider
  const W = Math.ceil(32 * fat) + 4, H = 34;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  const bw = Math.round(32 * fat), x0 = Math.floor((W - bw) / 2);
  g.drawImage(img, x0, 2, bw, 32);
  const cx = Math.round(x0 + 16 * fat);              // face center in this canvas; beak sits around y 19-20

  const d = g.getImageData(0, 0, W, H), p = d.data;
  const at = (x, y) => (y * W + x) * 4;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const opaque = (x, y) => inside(x, y) && p[at(x, y) + 3] > 0;
  const set = (x, y, rgb) => { if (!inside(x, y)) return; const i = at(x, y); p[i] = rgb[0]; p[i + 1] = rgb[1]; p[i + 2] = rgb[2]; p[i + 3] = 255; };
  const isBeak = (x, y) => { const i = at(x, y); return p[i] > 200 && p[i + 1] > 120 && p[i + 1] < 200 && p[i + 2] < 110; };

  // bathrobe over the body from the chest down, open V-neck, belt with a dangling knot
  if (step >= 2) {
    const top = 23, belt = 28;
    for (let y = top; y <= 31; y++) for (let x = 0; x < W; x++) {
      if (!opaque(x, y)) continue;
      const v = Math.max(0, 4 - (y - top));            // V-neck half-width, closes at the belt
      if (y < belt && Math.abs(x - cx) < v) continue;   // belly shows through the V
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || (y < belt && Math.abs(x - cx) === v);
      set(x, y, y === belt ? ROBE.belt : edge ? ROBE.edge : (x + 2 * y) % 3 === 0 ? ROBE.b : ROBE.a);
    }
    for (const [dx, dy] of [[2, 1], [3, 2], [2, 3], [4, 3]]) set(cx + dx, belt + dy, ROBE.belt);
    if (step >= 4) for (const [dx, dy] of [[-5, -2], [-4, -2], [5, 1], [-6, 2]]) if (opaque(cx + dx, belt + dy)) set(cx + dx, belt + dy, ROBE.stain);
  }

  // outgrown scruffy beard under the beak, longer and wilder each stage
  if (step >= 1) {
    const len = [0, 1, 3, 5, 7][step], half = [0, 3, 4, 5, 6][step], dens = [0, 0.35, 0.75, 0.85, 0.9][step];
    for (let dy = 0; dy <= len; dy++) {
      const y = 20 + dy;
      const w = Math.max(1, Math.round(half * (1 - dy / (len + 3))));
      for (let x = cx - w; x <= cx + w; x++) {
        if (isBeak(x, y)) continue;
        const edge = Math.abs(x - cx) >= w - 1 || dy >= len - 1;
        if (hash(x, y, step) < (edge ? dens * 0.6 : dens)) set(x, y, hash(y, x, 7) < 0.35 ? BEARD.b : BEARD.a);
      }
    }
    if (step >= 3) for (let y = 15; y <= 20; y++) for (const sx of [cx - 6, cx + 6]) if (hash(sx, y, 3) < 0.55) set(sx, y, BEARD.a);   // sideburns
    if (step >= 4) for (const [dx, dy] of [[-2, 28], [1, 29], [3, 28]]) set(cx + dx, dy, BEARD.b);                                         // stray long hairs
  }

  // bedhead on top
  if (step >= 2) {
    let top = 0; while (top < H && ![...Array(W).keys()].some((x) => opaque(x, top))) top++;
    const ref = at(cx, Math.min(H - 1, top + 1)), col = [p[ref], p[ref + 1], p[ref + 2]];
    const tuft = step >= 3 ? [[-2, -1], [-1, -2], [0, -1], [1, -3], [2, -2], [3, -1]] : [[0, -1], [1, -2]];
    for (const [dx, dy] of tuft) set(cx + dx, top + dy, col);
  }

  // duller and greyer as joy drops (applied last so robe and beard fade with the rest)
  const grey = 0.16 * step, dim = 1 - 0.06 * step;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    for (let k = 0; k < 3; k++) p[i + k] = Math.round((p[i + k] * (1 - grey) + l * grey) * dim);
  }
  g.putImageData(d, 0, 0);
  byStep.set(step, c);
  return c;
}

// ------------------------------------------------------------ painting
function rainCloud(g, x, y, now) {
  g.fillStyle = '#5b6573';
  g.fillRect(x + 2, y, 8, 1); g.fillRect(x + 1, y + 1, 12, 2); g.fillRect(x, y + 3, 14, 2); g.fillRect(x + 1, y + 5, 12, 1);
  g.fillStyle = '#7a8594'; g.fillRect(x + 3, y + 1, 4, 1); g.fillRect(x + 2, y + 2, 3, 1);
  g.fillStyle = '#7fb3d9';
  for (let i = 0; i < 5; i++) {
    const t = ((now / 80) + i * 3.7) % 10;
    g.fillRect(x + 1 + i * 3, y + 7 + Math.floor(t), 1, 2);
  }
}

function cigarette(g, bx, by, now) {
  g.fillStyle = '#2b3442'; g.fillRect(bx, by + 1, 8, 1);
  g.fillStyle = '#d99a4e'; g.fillRect(bx, by, 2, 1);
  g.fillStyle = '#f4f4ee'; g.fillRect(bx + 2, by, 5, 1);
  g.fillStyle = Math.floor(now / 280) % 3 ? '#ff5a1f' : '#ffc04d'; g.fillRect(bx + 7, by, 1, 1);
  g.fillStyle = 'rgba(205,214,224,0.8)';
  for (let i = 0; i < 5; i++) {
    const t = ((now / 110) + i * 4) % 20;
    const sx = bx + 7 + Math.round(Math.sin((t + i) / 2.5) * 2) + Math.floor(t / 7);
    const sz = t > 8 ? 2 : 1;
    g.fillRect(sx, by - 2 - Math.floor(t), sz, sz);
  }
}

// Tombstone with RIP, and a little ghost Pengbit with a halo bobbing above it.
const RIP = ['###.###.###', '#.#..#..#.#', '##...#..###', '#.#..#..#..', '#.#.###.#..'];
function grave(g, img, x, y, now) {
  const sx = x + 6, sy = y + 12;
  g.fillStyle = '#8a96a6'; g.fillRect(sx + 2, sy, 16, 20); g.fillRect(sx + 1, sy + 1, 18, 19); g.fillRect(sx, sy + 3, 20, 17);
  g.fillStyle = '#a9b4c2'; g.fillRect(sx + 2, sy + 2, 3, 14);
  g.fillStyle = '#4a5462';
  RIP.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === '#') g.fillRect(sx + 4 + rx, sy + 5 + ry, 1, 1); }));
  g.fillRect(sx + 4, sy + 13, 11, 1);
  g.fillStyle = '#3d6b4a'; g.fillRect(sx - 3, sy + 19, 26, 2);                       // grass
  g.fillStyle = '#5c9a6b'; for (let i = 0; i < 26; i += 3) g.fillRect(sx - 3 + i, sy + 18, 1, 1);
  g.fillStyle = '#e8c547'; g.fillRect(sx - 2, sy + 16, 1, 3); g.fillRect(sx - 3, sy + 15, 3, 1);   // a little flower

  const bob = Math.round(Math.sin(now / 500) * 2);
  const gx = x + 28, gy = y - 6 + bob;
  g.save();
  g.globalAlpha = 0.55;
  g.drawImage(img, gx, gy, 20, 20);
  g.globalAlpha = 0.6;
  g.fillStyle = '#e8f4ff';                                                         // wings
  g.fillRect(gx - 2, gy + 9, 2, 3); g.fillRect(gx - 3, gy + 10, 1, 2); g.fillRect(gx + 20, gy + 9, 2, 3); g.fillRect(gx + 22, gy + 10, 1, 2);
  g.restore();
  g.fillStyle = '#ffd84a';                                                         // halo
  g.fillRect(gx + 6, gy - 3, 8, 1); g.fillRect(gx + 5, gy - 2, 1, 1); g.fillRect(gx + 14, gy - 2, 1, 1); g.fillRect(gx + 6, gy - 1, 8, 1);
}

let dead = null;   // { name, at, age } while Pengbit has passed away

export function paintPet(g, img, x, y, pet, now) {
  if (dead) { grave(g, img, x, y, now); return; }
  const step = pet && !pet.isEgg ? moodStep(pet.happy) : 0;
  if (!step) { g.drawImage(img, x, y, 32, 32); return; }
  const v = variant(img, step);
  const sag = step >= 3 ? 1 : 0;
  g.drawImage(v, x + 16 - v.width / 2, y - 2 + sag);
  if (step >= 3) rainCloud(g, x + 9, y - 9, now);
  if (step >= MOOD.STEPS && MOOD.CIGARETTE) cigarette(g, x + 17, y + 17 + sag, now);
}

// ------------------------------------------------------------ lifespan
function fmtAge(s) {
  const m = Math.floor((s || 0) / 60);
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`;
}

function showMemorial(ctx) {
  let box = document.getElementById('moodRip');
  if (!dead) { box?.remove(); return; }
  const scene = document.getElementById('scene');
  if (!scene) return;
  if (!box) {
    box = document.createElement('div');
    box.id = 'moodRip';
    Object.assign(box.style, {
      position: 'absolute', left: '50%', bottom: '8px', transform: 'translateX(-50%)', zIndex: 6,
      display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', whiteSpace: 'nowrap',
      font: '11px "Lucida Console", monospace', color: '#e8f4ff', background: 'rgba(13,42,54,0.85)',
      border: '1px solid #5b6573', borderRadius: '4px',
    });
    const host = scene.parentElement;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(box);
  }
  box.innerHTML = '';
  const t = document.createElement('span');
  t.textContent = `R.I.P. ${dead.name} · lived ${dead.age}`;
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = 'New egg';
  Object.assign(b.style, { font: 'inherit', fontWeight: 'bold', padding: '1px 8px', cursor: 'pointer', color: '#0d2a36', background: '#c9d3e0', border: '2px solid', borderColor: '#fff #6b7684 #6b7684 #fff' });
  b.onclick = () => rebirth(ctx);
  box.append(t, b);
}

function die(ctx) {
  if (dead) return;
  const pet = ctx.pet;
  dead = { name: pet.name || 'Pengbit', at: Date.now(), age: fmtAge(pet.age) };
  ctx.store.set('dead', dead);
  showMemorial(ctx);
  ctx.toast?.(`${dead.name} waited a whole week for you and passed away.`, 6000);
  ctx.bus?.emit('pet:died', { name: dead.name });
  ctx.render?.();
}

function rebirth(ctx) {
  dead = null;
  ctx.store.set('dead', null);
  ctx.store.set('lastInteraction', Date.now());
  ctx.pet.reset();
  ctx.store.set('pet', ctx.pet);
  showMemorial(ctx);
  ctx.chirp?.('hello');
  ctx.render?.();
}

function addTestButton(ctx) {
  const setup = document.getElementById('tab-setup');
  if (!setup || document.getElementById('moodSkipWeek')) return;
  const b = document.createElement('button');
  b.id = 'moodSkipWeek'; b.type = 'button';
  b.textContent = 'Test: skip a week without visits';
  b.className = 'btn';
  b.style.marginTop = '8px';
  b.onclick = () => {
    if (dead) return ctx.toast?.('Already passed away. Tap New egg on the screen.');
    ctx.store.set('lastInteraction', Date.now() - LIFESPAN_MS - 60000);
    check(ctx);
    ctx.openTab?.('dex');
  };
  setup.appendChild(b);
}

function check(ctx) {
  if (dead || !ctx.pet || ctx.pet.isEgg) return;
  const last = ctx.store.get('lastInteraction', null);
  if (last == null) { ctx.store.set('lastInteraction', Date.now()); return; }
  if (Date.now() - last >= LIFESPAN_MS) die(ctx);
}

// ------------------------------------------------------------ feature entry
export function init(ctx) {
  ctx.paintPet = (g, img, x, y, now) => paintPet(g, img, x, y, ctx.pet, now);

  dead = ctx.store.get('dead', null);
  check(ctx);                      // a week away before this visit counts, so check before recording the visit
  showMemorial(ctx);

  // Any tap or key in the app is an interaction. Saved at most every 10 s.
  let lastSave = 0;
  const touch = () => {
    if (dead) return;
    const now = Date.now();
    if (now - lastSave > 10000) { lastSave = now; ctx.store.set('lastInteraction', now); }
  };
  document.addEventListener('pointerdown', touch, true);
  document.addEventListener('keydown', touch, true);

  addTestButton(ctx);

  let lastSigh = 0;
  setInterval(() => {
    check(ctx);
    const pet = ctx.pet;
    if (dead || !pet || pet.isEgg || document.hidden) return;
    if (moodStep(pet.happy) >= MOOD.STEPS && Date.now() - lastSigh > MOOD.SIGH_EVERY_MS) {
      lastSigh = Date.now();
      ctx.bubble?.('sigh...', 2500);
    }
  }, 5000);
}
