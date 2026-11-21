// Pebblebit Campus Wellness (W9). Opt in, pick where you're studying (no GPS), and the app shares
// only today's rounded walk and sit minutes for that place. The board shows how active each campus
// spot is today, and a place appears only once 3+ people shared there. "Sample campus" is a clearly
// labelled demo board for judging, never mixed with real data.
const PLACES = [
  { id: 'library', label: 'Evans Library' },
  { id: 'msc', label: 'MSC' },
  { id: 'engineering', label: 'Zachry Engineering' },
  { id: 'rec', label: 'Rec Center' },
  { id: 'dorms', label: 'Residence halls' },
  { id: 'home', label: 'Off campus / home' },
];
const SAMPLE = [
  { id: 'rec', label: 'Rec Center', users: 9, walkMin: 310, sitMin: 140 },
  { id: 'msc', label: 'MSC', users: 14, walkMin: 260, sitMin: 820 },
  { id: 'engineering', label: 'Zachry Engineering', users: 11, walkMin: 150, sitMin: 990 },
  { id: 'library', label: 'Evans Library', users: 18, walkMin: 120, sitMin: 1650 },
  { id: 'dorms', label: 'Residence halls', users: 6, walkMin: 95, sitMin: 410 },
];
const POST_EVERY_MS = 60000, REFRESH_MS = 30000;

const day = () => new Date().toISOString().slice(0, 10);
let ctx, el = {}, board = null, sample = false, lastPost = 0, net = 'unknown';

function loadToday() {
  const t = ctx.store.get('campusToday', null);
  return t && t.day === day() ? t : { day: day(), walkMin: 0, stillMin: 0 };
}

export function init(c) {
  ctx = c;
  const tab = document.getElementById('tab-campus');
  if (!tab) return;
  tab.innerHTML = `
    <div class="cw">
      <h2>Campus Wellness</h2>
      <p class="fine">See how active each campus spot is today. Opt in, pick where you're studying, and Pebblebit
        shares only today's walk and sit minutes for that place. No GPS, no name, no pet. A place shows up only once
        <b>3 or more</b> people share there.</p>
      <label class="toggle"><input type="checkbox" id="cwOpt"> Share my minutes with my campus spot</label>
      <label class="field">I'm studying at <select id="cwPlace">${PLACES.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select></label>
      <p class="cw-me" id="cwMe"></p>
      <div class="cw-head"><b id="cwTitle">Today on campus</b><button type="button" class="btn-ghost" id="cwSample">Show sample campus</button></div>
      <div id="cwBoard" class="cw-board"></div>
      <p class="fine" id="cwNote"></p>
    </div>`;
  for (const id of ['cwOpt', 'cwPlace', 'cwMe', 'cwTitle', 'cwSample', 'cwBoard', 'cwNote']) el[id] = document.getElementById(id);
  el.cwOpt.checked = !!ctx.store.get('campusOptIn', false);
  el.cwPlace.value = ctx.store.get('campusPlace', 'library');
  el.cwOpt.onchange = () => { ctx.store.set('campusOptIn', el.cwOpt.checked); if (el.cwOpt.checked) post(true); render(); };
  el.cwPlace.onchange = () => { ctx.store.set('campusPlace', el.cwPlace.value); if (el.cwOpt.checked) post(true); render(); };
  el.cwSample.onclick = () => { sample = !sample; render(); if (!sample) refresh(); };

  // Count real minutes (demo mode speeds pet time 60x, so scale it back).
  ctx.bus?.on('pet:minute', ({ act } = {}) => {
    const t = loadToday();
    const real = ctx.settings?.demo ? 1 / 60 : 1;
    if (act === 'walk') t.walkMin += real;
    else if (act === 'still' || (ctx.pet?.mode === 'desk' && act === 'shake')) t.stillMin += real;
    ctx.store.set('campusToday', t);
    if (el.cwOpt.checked && Date.now() - lastPost > POST_EVERY_MS) post();
  });

  ctx.showTab('campus');
  refresh();
  setInterval(() => { if (!document.hidden && !sample) refresh(); }, REFRESH_MS);
  render();
}

async function post(force) {
  if (!force && Date.now() - lastPost < POST_EVERY_MS) return;
  lastPost = Date.now();
  const t = loadToday();
  try {
    const r = await fetch('api/campus', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: ctx.deviceId, place: el.cwPlace.value, day: t.day, walkMin: Math.round(t.walkMin), stillMin: Math.round(t.stillMin) }),
    });
    net = r.ok ? 'ok' : 'down';
    if (r.ok) refresh();
  } catch { net = 'down'; render(); }
}

async function refresh() {
  try {
    const r = await fetch('api/campus?day=' + day(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    board = await r.json(); net = 'ok';
  } catch { net = 'down'; }
  render();
}

function render() {
  const t = loadToday();
  const label = PLACES.find((p) => p.id === el.cwPlace.value)?.label || '';
  el.cwMe.textContent = el.cwOpt.checked
    ? `Sharing for ${label}: ${Math.round(t.walkMin)} min walking, ${Math.round(t.stillMin)} min sitting today.`
    : `Not sharing. Today so far: ${Math.round(t.walkMin)} min walking, ${Math.round(t.stillMin)} min sitting (stays on this phone).`;
  el.cwSample.textContent = sample ? 'Back to live campus' : 'Show sample campus';
  el.cwTitle.textContent = sample ? 'Sample campus (made-up demo data)' : 'Today on campus';

  const places = (sample ? SAMPLE : board?.places || [])
    .map((p) => ({ ...p, active: p.walkMin + p.sitMin ? p.walkMin / (p.walkMin + p.sitMin) : 0 }))
    .sort((a, b) => b.active - a.active);
  el.cwBoard.innerHTML = '';
  if (!places.length) {
    el.cwBoard.innerHTML = `<p class="cw-empty">${net === 'down' ? "Campus board is offline right now." : 'No campus spot has 3 sharers yet today. Be one of them!'}</p>`;
  }
  places.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'cw-row' + (!sample && p.id === el.cwPlace.value && el.cwOpt.checked ? ' me' : '');
    const pct = Math.round(p.active * 100);
    row.innerHTML = `
      <span class="cw-rank">${i + 1}</span>
      <span class="cw-name">${p.label}<small>${p.users} people · avg ${Math.round(p.sitMin / p.users)} min sitting</small></span>
      <span class="cw-bar" title="${pct}% of tracked time spent moving"><i style="width:${pct}%"></i></span>
      <span class="cw-pct">${pct}%</span>`;
    el.cwBoard.appendChild(row);
  });
  const hidden = sample ? 0 : board?.hidden || 0;
  el.cwNote.textContent = sample
    ? 'Sample data for demos only. Real numbers come from people who opt in.'
    : `Bars show the share of tracked time spent moving.${hidden ? ` ${hidden} spot${hidden > 1 ? 's are' : ' is'} hidden until 3 people share there.` : ''}`;
}
