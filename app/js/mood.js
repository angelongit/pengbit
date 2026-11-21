// Pengbit's mood look (Daniel, W6). As joy (happiness) drops, Pengbit visibly declines:
// duller colors, a rounder body, scruffy feathers, a little rain cloud, and at rock bottom a sad
// cigarette with drifting smoke. Every stage reverses as joy comes back.
//
// Seam: init(ctx) sets ctx.paintPet(g, img, x, y, now, frame). main.js and pip.js call it in place
// of g.drawImage(img, x, y, 32, 32) when it exists. Nothing here changes game rules.

export const MOOD = {
  START: 55,          // joy at or above this looks normal
  BOTTOM: 12,         // joy at or below this is the worst look
  STEPS: 4,           // visual stages between them
  CIGARETTE: true,    // set false to drop the cigarette and keep the rest
  SIGH_EVERY_MS: 25000,
};

// 0 = fine ... STEPS = rock bottom
export function moodStep(happy) {
  const t = (MOOD.START - happy) / (MOOD.START - MOOD.BOTTOM);
  return Math.max(0, Math.min(MOOD.STEPS, Math.round(t * MOOD.STEPS)));
}

// ------------------------------------------------------------ sprite variants (cached per image + step)
const cache = new WeakMap();   // img -> Map(step -> canvas)

function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

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
  const bw = Math.round(32 * fat);
  g.drawImage(img, Math.floor((W - bw) / 2), 2, bw, 32);

  const d = g.getImageData(0, 0, W, H), p = d.data;
  const at = (x, y) => (y * W + x) * 4;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < W && y < H && p[at(x, y) + 3] > 0;

  // duller and greyer as joy drops
  const grey = 0.16 * step, dim = 1 - 0.06 * step;
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    for (let k = 0; k < 3; k++) p[i + k] = Math.round((p[i + k] * (1 - grey) + l * grey) * dim);
  }

  // scruffy: stray feather pixels poking out of the outline
  if (step >= 2) {
    const chance = 0.07 * (step - 1);
    const adds = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!opaque(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) {
        if (!opaque(x + dx, y + dy) && hash(x, y, dx * 3 + dy + step) < chance) adds.push([x + dx, y + dy, at(x, y)]);
      }
    }
    for (const [x, y, src] of adds) { const i = at(x, y); p[i] = p[src]; p[i + 1] = p[src + 1]; p[i + 2] = p[src + 2]; p[i + 3] = 255; }
    // messy bedhead on top
    let top = 0; while (top < H && ![...Array(W).keys()].some((x) => opaque(x, top))) top++;
    const cx = W >> 1;
    const tuft = step >= 3 ? [[-2, -1], [-1, -2], [0, -1], [1, -3], [2, -2], [3, -1]] : [[0, -1], [1, -2]];
    let ref = at(cx, Math.min(H - 1, top + 1));
    for (const [dx, dy] of tuft) {
      const x = cx + dx, y = top + dy;
      if (x >= 0 && y >= 0 && x < W) { const i = at(x, y); p[i] = p[ref]; p[i + 1] = p[ref + 1]; p[i + 2] = p[ref + 2]; p[i + 3] = 255; }
    }
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
  // filter at the beak, paper, glowing ember, with a dark underside so it reads on the white face
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

export function paintPet(g, img, x, y, pet, now) {
  const step = pet && !pet.isEgg ? moodStep(pet.happy) : 0;
  if (!step) { g.drawImage(img, x, y, 32, 32); return; }
  const v = variant(img, step);
  const sag = step >= 3 ? 1 : 0;                          // slumps a pixel lower
  g.drawImage(v, x + 16 - v.width / 2, y - 2 + sag);
  if (step >= 3) rainCloud(g, x + 9, y - 9, now);
  if (step >= MOOD.STEPS && MOOD.CIGARETTE) cigarette(g, x + 17, y + 17 + sag, now);
}

// ------------------------------------------------------------ feature entry
export function init(ctx) {
  ctx.paintPet = (g, img, x, y, now) => paintPet(g, img, x, y, ctx.pet, now);
  let lastSigh = 0;
  setInterval(() => {
    const pet = ctx.pet;
    if (!pet || pet.isEgg || document.hidden) return;
    if (moodStep(pet.happy) >= MOOD.STEPS && Date.now() - lastSigh > MOOD.SIGH_EVERY_MS) {
      lastSigh = Date.now();
      ctx.bubble?.('sigh...', 2500);
    }
  }, 5000);
}
