// Roaming Pebblebit engine: a Clippy-style penguin that walks around a full-screen layer, hops,
// chases your cursor, naps, nags you about posture and long sits, and can be picked up and thrown.
//
// Used in two places:
//   - roam.html, loaded by the desktop companion (desktop/) in a transparent always-on-top window,
//     so Pebblebit walks over every other app on the real desktop.
//   - js/roam.js, the in-page fallback: the same penguin roams over the web app itself.
//
// createRoamer(root, opts) -> { setState(snap), say(text, opts), setCursor(x, y), destroy() }
//   root   element that covers the area to roam (position: fixed/absolute, any size)
//   opts   onPoke()            the pet was clicked
//          onHover(bool)       pointer entered/left the pet (desktop uses it for click-through)
//          scale               pixel scale of the 32 px sprites (default 3)
// snap (all optional): { name, form, isEgg, happy, energy, hungry, sad, shivering, stillMin,
//                        mode, act, posture, dead }
import { sprite, loadSprites } from './sprites.js';
import { paintPet } from './mood.js';

const VW = 40, VH = 44;                  // virtual canvas: sprite plus room for the mood rain cloud
const GRAVITY = 2200;                    // px/s^2
const TIPS = [
  'Professor Liveoak says: stand up and stretch for a minute!',
  'Roll your shoulders back. Your spine will thank you.',
  'Water break? Pebblebit is thirsty too.',
  'Look 20 feet away for 20 seconds. Eyes need recess.',
  'A 5 minute walk resets your focus. Science!',
  'Feet flat, screen at eye level. Professor\'s orders.',
  'You have been still a while. Wiggle something!',
  'Deep breath in... and out. Better.',
];
const SLOUCH_LINES = ['Sit up straight!', 'Hey! Posture!', 'Shoulders back!', 'Unslouch me, please...'];
const SHIVER_LINES = ['brrr... walk with me?', 'so cold... stand up?', 'my feet are frozen! move!'];
const POKE_LINES = ['hi!', 'hehe', '!!', 'wheee', 'pet me more', '<3'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function createRoamer(root, opts = {}) {
  const S = opts.scale || 3;
  const BW = VW * S, BH = VH * S;

  // ---- DOM
  const el = document.createElement('div');
  el.className = 'roam-pet';
  Object.assign(el.style, {
    position: 'absolute', left: '0', top: '0', width: BW + 'px', height: BH + 'px',
    pointerEvents: 'auto', cursor: 'grab', touchAction: 'none', userSelect: 'none', zIndex: 2,
    willChange: 'transform',
  });
  const cv = document.createElement('canvas');
  cv.width = VW; cv.height = VH;
  Object.assign(cv.style, { width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' });
  el.appendChild(cv);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;

  const bub = document.createElement('div');
  bub.className = 'roam-bubble';
  Object.assign(bub.style, {
    position: 'absolute', left: '0', top: '0', maxWidth: '260px', padding: '8px 11px', zIndex: 3,
    font: 'bold 13px/1.35 "Lucida Console", "Courier New", monospace', color: '#0d2a36',
    background: '#fffbe6', border: '2px solid #0d2a36', borderRadius: '10px',
    boxShadow: '3px 3px 0 rgba(13,42,54,0.35)', pointerEvents: 'none', display: 'none',
    whiteSpace: 'normal', wordBreak: 'break-word',
  });
  root.appendChild(bub);
  root.appendChild(el);

  // ---- state
  let snap = { form: 'baby', happy: 80, energy: 80 }, synced = false;
  let x = rnd(40, Math.max(60, W() - BW - 40)), y = -BH;     // drop in from the top
  let vx = 0, vy = 0, dir = 1;
  let mode = 'fall', until = 0;                              // idle walk chase nag hop fall drag sleep ghost
  let cursor = { x: -1, y: -1, at: 0 };
  let hover = false, dragging = null, glitchUntil = 0;
  let bubbleUntil = 0, nextChatter = performance.now() + rnd(15000, 30000);
  let slouchSince = 0, lastSlouchNag = 0, lastShiverNag = 0;
  let raf = 0, last = performance.now(), alive = true;
  const flakes = Array.from({ length: 10 }, () => ({ x: Math.random() * VW, y: Math.random() * VH, v: rnd(8, 20) }));

  function W() { return root.clientWidth || window.innerWidth; }
  function H() { return root.clientHeight || window.innerHeight; }
  const floor = () => H() - BH + S;                          // sprite feet sit on the bottom edge
  const onFloor = () => y >= floor() - 0.5;

  // ---- talking
  function say(text, o = {}) {
    if (!text) return;
    const prof = o.who === 'prof';
    const t = String(text);
    bub.innerHTML = '';
    if (prof) {
      const h = document.createElement('div');
      h.textContent = 'PROF. LIVEOAK';
      Object.assign(h.style, { fontSize: '10px', letterSpacing: '1px', color: '#7a5b00', marginBottom: '3px' });
      bub.appendChild(h);
    }
    const p = document.createElement('div');
    p.textContent = t.length > 220 ? t.slice(0, 217) + '...' : t;
    bub.appendChild(p);
    bub.style.display = 'block';
    bub.style.background = prof ? '#fff3b0' : '#fffbe6';
    bubbleUntil = performance.now() + (o.ms ?? Math.min(20000, 3000 + t.length * 60));
    placeBubble();
  }

  function placeBubble() {
    if (bub.style.display === 'none') return;
    const bw = bub.offsetWidth, bh = bub.offsetHeight;
    let bx = x + BW / 2 - bw / 2, by = y - bh + 6 * S;
    bx = Math.max(6, Math.min(W() - bw - 6, bx));
    if (by < 6) by = y + BH;                                 // no room above: put it below
    bub.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`;
  }

  // ---- behaviour
  const slouching = () => !snap.isEgg && (snap.posture === 'slouch' || (snap.mode === 'desk' && snap.act === 'shake'));
  const speed = () => (snap.form === 'sprinter' ? 190 : snap.form === 'frost' ? 70 : 110) * (snap.energy < 25 ? 0.6 : 1);

  function decide(now) {
    if (snap.dead) { mode = 'ghost'; until = now + 1e9; return; }
    if (snap.isEgg) { mode = 'idle'; until = now + rnd(1500, 3000); return; }
    if (slouching() && now - lastSlouchNag > 12000) {         // run to the cursor and complain
      lastSlouchNag = now; mode = 'chase'; until = now + 9000; chaseLine = pick(SLOUCH_LINES); return;
    }
    if (snap.shivering && now - lastShiverNag > 20000) {
      lastShiverNag = now; mode = 'chase'; until = now + 9000; chaseLine = pick(SHIVER_LINES); return;
    }
    if (snap.energy != null && snap.energy < 25 && Math.random() < 0.5) { mode = 'sleep'; until = now + rnd(6000, 12000); return; }
    const r = Math.random();
    if (r < 0.42) { mode = 'walk'; dir = Math.random() < 0.5 ? -1 : 1; until = now + rnd(2500, 7000); }
    else if (r < 0.62) { mode = 'idle'; until = now + rnd(1500, 4000); }
    else if (r < 0.76) { hop(); }
    else if (r < 0.9) { mode = 'chase'; until = now + 8000; chaseLine = Math.random() < 0.5 ? pick(TIPS) : ''; }
    else special(now);
  }
  let chaseLine = '';

  function hop(power = 1) {
    mode = 'fall';
    vy = -rnd(650, 950) * power;
    vx = dir * rnd(80, 220);
  }

  function special(now) {
    if (snap.form === 'glitch') {                             // teleport somewhere on screen, then drop
      glitchUntil = now + 400;
      x = rnd(0, W() - BW); y = rnd(H() * 0.1, H() * 0.6); vx = 0; vy = 0; mode = 'fall';
    } else if (snap.form === 'sprinter') {                    // dash across the screen
      mode = 'walk'; dir = x < W() / 2 ? 1 : -1; until = now + 3000; dashing = true;
    } else if (snap.form === 'frost') {                       // belly slide
      mode = 'walk'; dir = Math.random() < 0.5 ? -1 : 1; until = now + 2500; dashing = true;
    } else hop(1.3);
  }
  let dashing = false;

  function step(now, dt) {
    if (dragging) return;
    if (mode === 'ghost') {                                   // float around, no gravity
      x += Math.sin(now / 2400) * 40 * dt; y = H() * 0.35 + Math.sin(now / 900) * 30;
      x = Math.max(0, Math.min(W() - BW, x));
      return;
    }
    if (!onFloor() || mode === 'fall') {
      vy += GRAVITY * dt; x += vx * dt; y += vy * dt;
      if (x < 0 || x > W() - BW) { vx = -vx * 0.6; x = Math.max(0, Math.min(W() - BW, x)); }
      if (y >= floor()) {
        y = floor(); vy = 0; vx = 0;
        if (mode === 'fall' || mode === 'drag') { mode = 'idle'; until = now + rnd(600, 1500); }
      }
      return;
    }
    y = floor();
    if (now > until) { dashing = false; decide(now); return; }
    if (mode === 'walk') {
      const sp = speed() * (dashing ? (snap.form === 'frost' ? 3.2 : 3) : 1);
      x += dir * sp * dt;
      if (x < 0) { x = 0; dir = 1; } else if (x > W() - BW) { x = W() - BW; dir = -1; }
    } else if (mode === 'chase') {
      const tx = cursor.x >= 0 ? cursor.x - BW / 2 + (x < cursor.x ? -BW * 0.6 : BW * 0.6) : W() / 2 - BW / 2;
      const d = tx - x;
      if (Math.abs(d) < 12) {
        mode = 'nag'; until = now + 4500; dir = cursor.x > x + BW / 2 ? 1 : -1;
        if (chaseLine) say(chaseLine);
        else say(pick(POKE_LINES), { ms: 1800 });
        // Jump up toward a cursor that is high on the screen: properly in your way.
        if (cursor.y >= 0 && cursor.y < floor() - BH) { vy = -Math.min(1300, Math.sqrt(2 * GRAVITY * (floor() - cursor.y))); mode = 'fall'; }
      } else {
        dir = Math.sign(d);
        x += dir * speed() * 1.4 * dt;
      }
    }
  }

  // ---- drawing
  function draw(now) {
    g.clearRect(0, 0, VW, VH);
    const moving = mode === 'walk' || mode === 'chase';
    const period = snap.isEgg ? 900 : moving ? (dashing ? 110 : 220) : mode === 'sleep' ? 1400 : 700;
    const frame = Math.floor(now / period) % 2;
    let px = 4, py = 10;
    if (snap.isEgg) { if (Math.floor(now / 1800) % 3 === 0) px += Math.round(Math.sin(now / 60) * 1.5); }
    else if (moving) py += frame ? -1 : 0;
    else if (mode === 'sleep') py += 1;
    else py += frame;
    if (snap.shivering) px += Math.floor(now / 50) % 2 ? 1 : -1;

    const form = snap.form || 'baby';
    const img = slouching() && extra.slouch_a ? (frame ? extra.slouch_b : extra.slouch_a) : sprite(form, frame);
    if (img) {
      g.save();
      if (snap.dead) g.globalAlpha = 0.55;
      paintPet(g, img, px, py, { isEgg: !!snap.isEgg, happy: snap.happy ?? 80 }, now);
      g.restore();
    }
    if (snap.dead) {                                          // halo
      g.fillStyle = '#ffd84a'; g.fillRect(px + 10, py - 2, 12, 1); g.fillRect(px + 9, py - 1, 1, 1); g.fillRect(px + 22, py - 1, 1, 1); g.fillRect(px + 10, py, 12, 1);
    }
    if (snap.shivering || form === 'frost') {
      g.fillStyle = '#d8f6ff';
      for (const f of flakes) { f.y += f.v / 60; if (f.y > VH) { f.y = 0; f.x = Math.random() * VW; } g.fillRect(f.x | 0, f.y | 0, 1, 1); }
    }
    if (mode === 'sleep') {
      g.fillStyle = '#9ff3ff';
      const zz = Math.floor(now / 500) % 3;
      for (let i = 0; i <= zz; i++) g.fillRect(30 + i * 3, 8 - i * 3, 2, 1);
    }
    if (form === 'sprinter' && dashing) {
      g.fillStyle = '#ffd84a';
      for (let i = 0; i < 3; i++) g.fillRect(dir > 0 ? 0 : VW - 5, 18 + i * 6, 4, 1);
    }
    const glitchy = slouching() || form === 'glitch' || now < glitchUntil;
    if (glitchy && Math.random() < (slouching() || now < glitchUntil ? 0.35 : 0.12)) {
      const sy = Math.floor(Math.random() * VH), sh = 1 + Math.floor(Math.random() * 3);
      g.putImageData(g.getImageData(0, sy, VW, sh), Math.round((Math.random() - 0.5) * 6), sy);
    }
    if (snap.hungry) { g.fillStyle = '#ff7a7a'; g.fillRect(1, 1, 2, 2); }
    if (snap.sad) { g.fillStyle = '#ff7a7a'; g.fillRect(4, 1, 2, 2); }

    const flip = !snap.isEgg && dir < 0 ? -1 : 1;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scaleX(${flip})`;
    el.style.cursor = dragging ? 'grabbing' : 'grab';
  }

  // ---- chatter: random Liveoak tips and status lines so it stays a little intrusive
  function chatter(now) {
    if (now < nextChatter || now < bubbleUntil) return;
    nextChatter = now + rnd(25000, 50000);
    if (snap.dead) return say(`${snap.name || 'Pebblebit'} watches over you now.`);
    if (snap.isEgg) return say('*wobble wobble*', { ms: 2000 });
    if (snap.hungry) return say('hungry... (press A to feed me)');
    if (snap.sad) return say('play with me? :(');
    say(pick(TIPS));
  }

  // ---- loop
  function loop(now) {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(now, dt);
    draw(now);
    chatter(now);
    if (bub.style.display !== 'none' && now > bubbleUntil) bub.style.display = 'none';
    placeBubble();
    checkHover();
  }
  raf = requestAnimationFrame(loop);

  // ---- pointer: drag, throw, poke
  function rect() { return { l: x + 4 * S, t: y + 8 * S, r: x + BW - 4 * S, b: y + BH }; }
  function checkHover() {
    if (cursor.x < 0) return;
    const r = rect();
    const over = !!dragging || (cursor.x >= r.l && cursor.x <= r.r && cursor.y >= r.t && cursor.y <= r.b);
    if (over !== hover) { hover = over; opts.onHover?.(over); }
  }

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    dragging = { id: e.pointerId, ox: e.clientX - x, oy: e.clientY - y, sx: e.clientX, sy: e.clientY, hist: [], moved: false };
    mode = 'drag'; vx = vy = 0;
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    x = e.clientX - dragging.ox; y = Math.min(floor(), e.clientY - dragging.oy);
    if (Math.hypot(e.clientX - dragging.sx, e.clientY - dragging.sy) > 6 && !dragging.moved) { dragging.moved = true; say('whoa!', { ms: 1200 }); }
    dragging.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (dragging.hist.length > 6) dragging.hist.shift();
  });
  const release = (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const d = dragging; dragging = null;
    if (!d.moved) { mode = 'idle'; until = performance.now() + 2500; say(pick(POKE_LINES), { ms: 1500 }); opts.onPoke?.(); return; }
    const h = d.hist, a = h[0], b = h[h.length - 1];
    const dt = a && b ? Math.max(0.016, (b.t - a.t) / 1000) : 1;
    vx = a && b ? Math.max(-1500, Math.min(1500, (b.x - a.x) / dt)) : 0;
    vy = a && b ? Math.max(-1500, Math.min(1500, (b.y - a.y) / dt)) : 0;
    if (vx) dir = Math.sign(vx);
    mode = 'fall';
    if (Math.abs(vx) + Math.abs(vy) > 900) say('wheeeee!', { ms: 1500 });
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  // ---- tombstones of past Pebblebits, standing along the floor behind the new one
  const graveEls = [];
  function drawGraves() {
    graveEls.splice(0).forEach((g) => g.remove());
    (snap.graves || []).forEach((name, i, all) => {
      const d = document.createElement('div');
      d.className = 'roam-grave';
      d.title = `Here lies ${name}`;
      const fx = (i + 1) / (all.length + 1);
      Object.assign(d.style, {
        position: 'absolute', left: `calc(${(fx * 100).toFixed(1)}% - 34px)`, bottom: '0', width: '68px', height: '78px',
        background: 'linear-gradient(#a9b3bf, #7d8794)', border: '3px solid #4c5562', borderBottom: '0',
        borderRadius: '34px 34px 0 0', color: '#2b313a', textAlign: 'center', zIndex: 1, pointerEvents: 'none',
        font: 'bold 11px/1.2 "Lucida Console", monospace', paddingTop: '14px', boxSizing: 'border-box', opacity: 0.92,
        overflow: 'hidden', wordBreak: 'break-word',
      });
      d.innerHTML = '<div style="font-size:13px">RIP</div>';
      const n = document.createElement('div');
      n.textContent = name.length > 10 ? name.slice(0, 9) + '.' : name;
      d.appendChild(n);
      root.insertBefore(d, el);
      graveEls.push(d);
    });
  }

  // ---- slouch / sprite extras
  const extra = {};
  Promise.all(['slouch_a', 'slouch_b'].map((k) => new Promise((res) => {
    const im = new Image(); im.onload = () => { extra[k] = im; res(); }; im.onerror = res; im.src = new URL(`../sprites/${k}.png`, import.meta.url).href;
  })));

  return {
    setState(s) {
      const first = !synced;
      const was = synced ? snap : { ...snap, ...s };       // no greeting/evolve lines for the first sync
      synced = true;
      snap = { ...snap, ...s };
      if (s.posture === 'slouch' || (s.mode === 'desk' && s.act === 'shake')) slouchSince ||= performance.now(); else slouchSince = 0;
      if (was.dead && !snap.dead) { mode = 'fall'; }
      if (!was.dead && snap.dead) { mode = 'ghost'; say(`${snap.name || 'Pebblebit'}... :(`); }
      if (was.isEgg && !snap.isEgg) { hop(1.2); say('hi!! I hatched!'); }
      if (first || String(was.graves) !== String(snap.graves)) drawGraves();
      if (was.form && snap.form && was.form !== snap.form && !was.isEgg && !snap.isEgg && snap.form !== 'baby') { hop(1.5); say('I evolved!!!'); }
    },
    say,
    setCursor(cx, cy) { cursor = { x: cx, y: cy, at: performance.now() }; },
    poke() { hop(1.2); },
    destroy() { alive = false; cancelAnimationFrame(raf); el.remove(); bub.remove(); graveEls.forEach((g) => g.remove()); if (hover) opts.onHover?.(false); },
  };
}

export { loadSprites };
