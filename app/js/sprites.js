// Sprite loader. Uses Daniel's PNGs from app/sprites/<form>_<a|b>.png when they exist,
// otherwise the firmware's 1-bit placeholders (sprites-builtin.js).
import { BUILTIN } from './sprites-builtin.js';

export const FORM_KEYS = ['egg', 'baby', 'sprinter', 'frost', 'glitch',
  'scholar', 'hunchling', 'trail_mage', 'library_sage', 'static_mage'];   // study evolutions (Daniel's art)
// Tint for the built-in 1-bit sprites, per form.
const TINT = { egg: '#e8f4ff', baby: '#bfe3ff', sprinter: '#ffd84a', frost: '#9ff3ff', glitch: '#ff6bf1' };

const cache = {};   // key -> CanvasImageSource

function fromBits(rows, color) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = color;
  rows.forEach((row, y) => { for (let x = 0; x < 32; x++) if (row[x] === '1') g.fillRect(x, y, 1, 1); });
  return c;
}

function loadImg(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

export async function loadSprites() {
  await Promise.all(FORM_KEYS.flatMap((f) => ['a', 'b'].map(async (fr) => {
    const key = `${f}_${fr}`;
    cache[key] = (await loadImg(`sprites/${key}.png`)) || (BUILTIN[key] ? fromBits(BUILTIN[key], TINT[f] || '#bfe3ff') : null);
  })));
}

// Any form without art (e.g. a new evolution) falls back to the baby, so the pet is never invisible.
export function sprite(form, frame) { const k = frame ? 'b' : 'a'; return cache[`${form}_${k}`] || cache[`baby_${k}`]; }
