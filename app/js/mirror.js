// The Neglect Mirror (Daniel, W6). When Pengbit's joy hits zero, it pops up in a Y2K error window
// and blames you for its neglect. Then the webcam opens and slowly morphs YOU into the same state:
// greyer, puffier, a scruffy beard, eye bags, a bathrobe, a rain cloud and a sad cigarette.
// "Keep ignoring" closes the window and turns the camera off; "Play with Pengbit" plays and closes.
//
// Uses the shared pose module (one camera, one MediaPipe model for the whole app). Video never
// leaves the device. Re-arms once joy is back above 20. Setup has a test button for demos.
import { acquire, release, subscribe, LM } from './pose.js';
import { sprite } from './sprites.js';

const REARM_JOY = 20;
const MORPH_MS = 5000;
const LW = 192, LH = 144;          // low-res mirror, scaled up pixelated for the Y2K look

const BLAME = [
  'Zero joy. ZERO.',
  'You did this to me.',
  'I waited and waited. You never came.',
  'Do you even remember my name?',
  'Look at me. Now look at you.',
  "Let's see how YOU'RE doing...",
];

let ctx = null;
let ui = null;                     // open window state
let armed = true;

export function init(c) {
  ctx = c;
  addTestButton();
  setInterval(() => {
    const pet = ctx.pet;
    if (!pet || pet.isEgg || ctx.store.get('dead', null)) return;
    if (pet.happy >= REARM_JOY) armed = true;
    if (armed && !ui && pet.happy <= 0 && !document.hidden) { armed = false; open(); }
  }, 1000);
}

function addTestButton() {
  const setup = document.getElementById('tab-setup');
  if (!setup || document.getElementById('mirrorTest')) return;
  const b = document.createElement('button');
  b.id = 'mirrorTest'; b.type = 'button'; b.className = 'btn';
  b.textContent = 'Test: joy hits zero (Neglect Mirror)';
  b.style.marginTop = '8px';
  b.onclick = () => {
    if (ctx.pet.isEgg) return ctx.toast?.('Hatch Pengbit first.');
    ctx.pet.happy = 0; ctx.render?.();
    armed = false; open();
  };
  setup.appendChild(b);
}

// ------------------------------------------------------------ window
function open() {
  if (ui) return;
  ctx.chirp?.('sad'); ctx.vibrate?.([300, 100, 300]);
  const wrap = document.createElement('div');
  wrap.id = 'mirrorWin';
  wrap.innerHTML = `
    <div class="mw">
      <div class="mw-bar"><span>PENGBIT.EXE - Neglect Error</span><b class="mw-x" title="Keep ignoring">x</b></div>
      <div class="mw-body">
        <div class="mw-top">
          <canvas class="mw-pet" width="64" height="64"></canvas>
          <div class="mw-say"></div>
        </div>
        <div class="mw-cam hidden">
          <canvas class="mw-view" width="${LW}" height="${LH}"></canvas>
          <div class="mw-cap">YOU, if this keeps up</div>
        </div>
        <p class="mw-note"></p>
        <div class="mw-btns">
          <button type="button" class="mw-play">Play with Pengbit</button>
          <button type="button" class="mw-ignore">Keep ignoring</button>
        </div>
        <p class="mw-fine">Camera stays on this device.</p>
      </div>
    </div>`;
  const css = document.createElement('style');
  css.textContent = STYLE;
  wrap.appendChild(css);
  document.body.appendChild(wrap);
  const q = (s) => wrap.querySelector(s);
  ui = {
    wrap, say: q('.mw-say'), pet: q('.mw-pet').getContext('2d'), cam: q('.mw-cam'),
    view: q('.mw-view'), note: q('.mw-note'), handle: null, unsub: null, lm: null,
    start: 0, line: 0, raf: 0, timers: [],
  };
  ui.pet.imageSmoothingEnabled = false;
  q('.mw-x').onclick = close;
  q('.mw-ignore').onclick = close;
  q('.mw-play').onclick = () => {
    if (ctx.pet.play()) { ctx.chirp?.('happy'); ctx.bubble?.('...fine.', 2500); ctx.store.set('pet', ctx.pet); ctx.render?.(); }
    close();
  };
  // blame, one line every 2.4 s; the last line opens the mirror
  const next = () => {
    if (!ui) return;
    ui.say.textContent = BLAME[ui.line];
    if (ui.line === BLAME.length - 1) { startCamera(); return; }
    ui.line++;
    ui.timers.push(setTimeout(next, 2400));
  };
  next();
  loop();
}

function close() {
  if (!ui) return;
  ui.timers.forEach(clearTimeout);
  cancelAnimationFrame(ui.raf);
  ui.unsub?.();
  if (ui.handle) release(ui.handle);        // camera off (unless Desk mode is also using it)
  ui.wrap.remove();
  ui = null;
}

async function startCamera() {
  if (!ui) return;
  ui.note.textContent = 'Opening the mirror...';
  try {
    const h = await acquire({ facing: 'user' });
    if (!ui) { release(h); return; }
    ui.handle = h;
    ui.unsub = subscribe((f) => { if (ui && !ui.debug) ui.lm = f.landmarks; });
    ui.cam.classList.remove('hidden');
    ui.note.textContent = '';
    ui.start = performance.now();
  } catch (e) {
    if (!ui) return;
    // Some browsers only open the camera from a tap.
    ui.note.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = 'Look in the mirror';
    b.onclick = () => startCamera();
    ui.note.append(e?.stage === 'camera' ? "Pengbit can't see you. " : 'The mirror is foggy. ', b);
  }
}

// test hook: feed landmarks without a real person in front of the camera
export function _debugLandmarks(lm) { if (ui) { ui.debug = true; ui.lm = lm; } }

// ------------------------------------------------------------ drawing
function loop(now = performance.now()) {
  if (!ui) return;
  ui.raf = requestAnimationFrame(loop);
  drawPet(now);
  if (ui.handle) drawMirror(now);
}

function drawPet(now) {
  const g = ui.pet;
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#1a0d2e'; g.fillRect(0, 0, 64, 64);
  const frame = Math.floor(now / 400) % 2;
  const img = sprite(ctx.pet.form, frame);
  if (!img) return;
  const x = 16 + ((Math.floor(now / 70) % 2) ? 1 : 0), y = 22;     // trembling with rage
  if (ctx.paintPet) ctx.paintPet(g, img, x, y, now, frame); else g.drawImage(img, x, y, 32, 32);
}

const ease = (t) => t * t * (3 - 2 * t);
const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const STUBBLE = Array.from({ length: 520 }, () => { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()); return [Math.cos(a) * r, Math.sin(a) * r, rnd()]; });

function drawMirror(now) {
  const v = ui.handle.video, cv = ui.view, g = cv.getContext('2d');
  if (!v || v.readyState < 2 || !v.videoWidth) return;
  const t = ease(Math.min(1, (now - ui.start) / MORPH_MS));
  g.imageSmoothingEnabled = false;

  // mirrored, cropped to 4:3, greyer and dimmer as the morph progresses
  const vw = v.videoWidth, vh = v.videoHeight, srcW = Math.min(vw, vh * 4 / 3), srcX = (vw - srcW) / 2;
  g.save();
  g.translate(LW, 0); g.scale(-1, 1);
  g.filter = `saturate(${1 - 0.65 * t}) brightness(${1 - 0.18 * t}) contrast(${1 + 0.1 * t})`;
  g.drawImage(v, srcX, 0, srcW, vh, 0, 0, LW, LH);
  g.restore();
  g.filter = 'none';

  const lm = ui.lm;
  const P = (i) => lm && lm[i] && (lm[i].visibility ?? 1) > 0.4
    ? { x: (1 - (lm[i].x * vw - srcX) / srcW) * LW, y: lm[i].y * LH } : null;   // mirrored low-res coords
  const nose = P(LM.NOSE ?? 0), eL = P(2), eR = P(5), earL = P(LM.LEFT_EAR ?? 7), earR = P(LM.RIGHT_EAR ?? 8);
  const mL = P(9), mR = P(10), sL = P(LM.LEFT_SHOULDER ?? 11), sR = P(LM.RIGHT_SHOULDER ?? 12);

  if (nose && eL && eR) {
    const fw = (earL && earR) ? Math.abs(earL.x - earR.x) * 1.05 : Math.abs(eL.x - eR.x) * 2.4;
    const eyeY = (eL.y + eR.y) / 2;
    const mouth = mL && mR ? { x: (mL.x + mR.x) / 2, y: (mL.y + mR.y) / 2 } : { x: nose.x, y: nose.y + fw * 0.28 };
    const cx = nose.x, top = eyeY - fw * 0.55, bot = mouth.y + fw * 0.45;

    // puffier face and a double chin: redraw the face wider, then the jaw wider still
    puff(g, cv, cx, top, bot, fw * 1.15, 1 + 0.28 * t, 0);
    puff(g, cv, cx, mouth.y - fw * 0.05, bot + fw * 0.15, fw * 1.0, 1 + 0.25 * t, Math.round(3 * t));

    // eye bags
    g.fillStyle = `rgba(70,50,80,${0.45 * t})`;
    for (const e of [eL, eR]) { g.beginPath(); g.ellipse(e.x, e.y + fw * 0.11, fw * 0.13, fw * 0.05, 0, 0, Math.PI); g.fill(); }

    // scruffy beard and stubble around the jaw, growing in
    const n = Math.floor(STUBBLE.length * t);
    const bx = cx, by = mouth.y + fw * 0.16, rx = fw * 0.58 * (1 + 0.25 * t), ry = fw * 0.42;
    for (let i = 0; i < n; i++) {
      const [ux, uy, s] = STUBBLE[i];
      if (uy < -0.35 && Math.abs(ux) < 0.45) continue;                      // keep the mouth visible
      const x = bx + ux * rx, y = by + uy * ry;
      g.fillStyle = s < 0.35 ? 'rgba(90,74,60,0.85)' : 'rgba(42,34,28,0.85)';
      g.fillRect(Math.round(x), Math.round(y), 1, s > 0.8 ? 2 : 1);
    }

    // rain cloud over the head
    if (t > 0.5) {
      const a = (t - 0.5) * 2, hy = top - fw * 0.55;
      g.fillStyle = `rgba(80,90,104,${0.9 * a})`;
      g.beginPath(); g.ellipse(cx, hy, fw * 0.55, fw * 0.16, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx - fw * 0.15, hy - fw * 0.1, fw * 0.25, fw * 0.14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(127,179,217,${a})`;
      for (let i = 0; i < 7; i++) { const yy = ((now / 12 + i * 37) % (fw * 0.5)); g.fillRect(Math.round(cx - fw * 0.45 + i * fw * 0.15), Math.round(hy + fw * 0.12 + yy), 1, 3); }
    }

    // sad cigarette from the mouth corner on the right side of the picture, with smoke
    if (t > 0.7) {
      const c = mL && mR ? (mL.x > mR.x ? mL : mR) : { x: mouth.x + fw * 0.15, y: mouth.y };
      const len = Math.max(8, fw * 0.4), th = Math.max(1, Math.round(fw / 40));
      g.fillStyle = '#d99a4e'; g.fillRect(Math.round(c.x), Math.round(c.y), Math.round(len * 0.25), th);
      g.fillStyle = '#f4f4ee'; g.fillRect(Math.round(c.x + len * 0.25), Math.round(c.y), Math.round(len * 0.7), th);
      g.fillStyle = Math.floor(now / 280) % 3 ? '#ff5a1f' : '#ffc04d'; g.fillRect(Math.round(c.x + len * 0.95), Math.round(c.y), th + 1, th);
      g.fillStyle = 'rgba(210,218,228,0.7)';
      for (let i = 0; i < 6; i++) {
        const k = ((now / 90) + i * 9) % 40;
        g.fillRect(Math.round(c.x + len + Math.sin((k + i) / 4) * 3 + k / 8), Math.round(c.y - 2 - k), 2, 2);
      }
    }
  }

  // bathrobe over the shoulders, open V-neck, terry stripes
  if (sL && sR && t > 0.3) {
    const a = Math.min(1, (t - 0.3) / 0.4);
    const l = sL.x < sR.x ? sL : sR, r = sL.x < sR.x ? sR : sL;
    const sw = r.x - l.x, sy = (l.y + r.y) / 2, mx = (l.x + r.x) / 2;
    const vY = sy + sw * 0.45;
    g.globalAlpha = 0.9 * a;
    g.fillStyle = '#9a6a7e';
    g.beginPath(); g.moveTo(l.x - sw * 0.35, l.y + sw * 0.05); g.lineTo(mx - sw * 0.16, sy - sw * 0.06); g.lineTo(mx, vY); g.lineTo(mx, LH); g.lineTo(l.x - sw * 0.45, LH); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(r.x + sw * 0.35, r.y + sw * 0.05); g.lineTo(mx + sw * 0.16, sy - sw * 0.06); g.lineTo(mx, vY); g.lineTo(mx, LH); g.lineTo(r.x + sw * 0.45, LH); g.closePath(); g.fill();
    g.strokeStyle = '#6d4456'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(mx - sw * 0.16, sy - sw * 0.06); g.lineTo(mx, vY); g.lineTo(mx + sw * 0.16, sy - sw * 0.06); g.stroke();
    g.fillStyle = 'rgba(176,127,147,0.6)';
    for (let y = Math.round(sy); y < LH; y += 4) g.fillRect(0, y, LW, 1);
    g.globalAlpha = 1;
  }

  // scanlines for the Y2K screen
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < LH; y += 3) g.fillRect(0, y, LW, 1);
}

// Redraw a horizontal band of the picture wider (and optionally lower) inside a soft oval.
function puff(g, cv, cx, y0, y1, w, scale, drop) {
  if (scale <= 1.001) return;
  const h = y1 - y0, sx = Math.max(0, cx - w / 2), sw = Math.min(LW - sx, w);
  if (h <= 2 || sw <= 2) return;
  g.save();
  g.beginPath(); g.ellipse(cx, y0 + h / 2 + drop, (sw * scale) / 2, h / 2 + drop, 0, 0, Math.PI * 2); g.clip();
  g.drawImage(cv, sx, y0, sw, h, cx - (sw * scale) / 2, y0 + drop, sw * scale, h + drop);
  g.restore();
}

const STYLE = `
#mirrorWin { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: rgba(10,6,20,.55); }
#mirrorWin .mw { width: min(92vw, 380px); background: #c9d3e0; color: #101418; font: 12px/1.35 "Lucida Console", "Courier New", monospace;
  border: 2px solid; border-color: #fff #6b7684 #6b7684 #fff; box-shadow: 4px 4px 0 #0006; }
#mirrorWin .mw-bar { display: flex; justify-content: space-between; align-items: center; padding: 3px 5px; color: #fff; font-weight: bold;
  background: linear-gradient(90deg, #6d0f2a, #b3243f 60%, #e05a6b); }
#mirrorWin .mw-x { cursor: pointer; width: 16px; height: 14px; display: grid; place-items: center; color: #101418; background: #c9d3e0;
  border: 1px solid; border-color: #fff #6b7684 #6b7684 #fff; }
#mirrorWin .mw-body { padding: 8px; }
#mirrorWin .mw-top { display: grid; grid-template-columns: 72px 1fr; gap: 8px; align-items: center; }
#mirrorWin .mw-pet { width: 72px; height: 72px; image-rendering: pixelated; border: 2px solid; border-color: #6b7684 #fff #fff #6b7684; }
#mirrorWin .mw-say { position: relative; min-height: 40px; padding: 8px; font-size: 14px; font-weight: bold; background: #fff; border: 2px solid #000; border-radius: 8px; }
#mirrorWin .mw-say::before { content: ""; position: absolute; left: -10px; top: 14px; border: 5px solid transparent; border-right: 5px solid #000; border-width: 5px 10px 5px 0; }
#mirrorWin .mw-cam { margin-top: 8px; position: relative; }
#mirrorWin .mw-view { width: 100%; image-rendering: pixelated; display: block; background: #0d2a36; border: 2px solid; border-color: #6b7684 #fff #fff #6b7684; }
#mirrorWin .mw-cap { position: absolute; left: 6px; bottom: 6px; padding: 1px 6px; color: #fff; background: #b3243f; font-weight: bold; }
#mirrorWin .mw-note { min-height: 1em; margin: 6px 0 0; }
#mirrorWin .mw-note button, #mirrorWin .mw-btns button { font: inherit; padding: 4px 10px; cursor: pointer; background: #c9d3e0;
  border: 2px solid; border-color: #fff #6b7684 #6b7684 #fff; }
#mirrorWin .mw-btns { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
#mirrorWin .mw-fine { margin: 6px 0 0; font-size: 10px; color: #4a5462; }
#mirrorWin .hidden { display: none; }
`;
