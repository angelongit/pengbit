// Focus Timer feature module (Pomodoro + custom + Demo mode).
// Drift-free deadline math, pause exclusion, single-award idempotency, and recap.js integration.
import { takeSessionSnapshot, buildSessionRecap, renderRecapCard } from './recap.js';

const STORAGE_KEY = 'pebblebit.focusTimer.v1';

const PRESETS = [
  { id: '25-5', label: '25 / 5', focusMin: 25, breakMin: 5, isDemo: false },
  { id: '50-10', label: '50 / 10', focusMin: 50, breakMin: 10, isDemo: false },
  { id: '15-3', label: '15 / 3', focusMin: 15, breakMin: 3, isDemo: false },
  { id: 'demo', label: 'Demo (10s)', focusMin: 10 / 60, breakMin: 5 / 60, isDemo: true },
];
const STUDY_ACTIONS = ['Reading', 'Writing', 'Typing'];
const FRAME_MS = 260;
const ACTIVITY_MS = 6500;

const fmtClock = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function defaultState() {
  return {
    phase: 'idle',          // 'idle' | 'focus' | 'break'
    status: 'idle',         // 'idle' | 'running' | 'paused'
    sessionId: null,
    isDemo: false,
    plannedMin: 25,
    breakMin: 5,
    endAt: null,            // epoch ms when running
    remainingMs: 25 * 60_000,
    startedAt: null,
    pausedAt: null,
    pauseSec: 0,
    breaksStarted: 0,
    breaksFinished: 0,
    awarded: false,         // single-award idempotency guard
    startSnap: null,
    lastRecap: null,
    deskSeconds: null,
  };
}

export function init(ctx) {
  const panel = document.getElementById('tab-focus');
  if (!panel) return;
  ctx.showTab('focus');

  let state = { ...defaultState(), ...(loadSaved() || {}) };
  let tickTimer = null;

  panel.innerHTML = `
    <div class="focus-wrap">
      <section class="focus-stage" aria-label="Focus timer">
        <div>
          <h2>Focus Timer</h2>
          <p id="ft-phase" class="focus-phase" role="status">Ready to study</p>
          <div id="ft-clock" class="focus-clock" role="timer">25:00</div>
          <p id="ft-badge" class="focus-note"></p>
          <progress id="ft-progress" class="focus-progress" aria-label="Session progress" max="100" value="0"></progress>
          <div class="focus-actions">
            <button type="button" id="ft-start" class="btn-chrome focus-primary">Start focus</button>
            <button type="button" id="ft-pause" class="btn-chrome focus-primary" hidden>Pause</button>
            <button type="button" id="ft-cancel" class="btn-chrome" hidden>End early</button>
          </div>
        </div>
        <figure class="focus-pet">
          <canvas id="ft-pet" width="64" height="48" aria-hidden="true"></canvas>
          <figcaption id="ft-pet-action">Pebblebit’s study desk</figcaption>
        </figure>
      </section>
      <section class="focus-card" id="ft-plan">
        <h3>Plan a session</h3>
        <div class="focus-presets" aria-label="Focus and break presets">
          ${PRESETS.map((p) => `<button type="button" class="btn-chrome" data-preset="${p.id}" aria-pressed="false">${p.label}</button>`).join('')}
        </div>
        <form class="focus-custom">
          <label>Focus (min)<input id="ft-custom-min" type="number" min="1" max="180" step="1" value="25" required></label>
          <label>Break (min)<input id="ft-custom-brk" type="number" min="1" max="60" step="1" value="5" required></label>
          <button type="submit" class="btn-chrome">Set custom</button>
        </form>
        <p class="focus-inline-note">Presets show focus / break minutes. Each completed focus minute earns one credit.</p>
      </section>
      <div id="ft-recap"></div>
      <section class="focus-card">
        <h3>Study progress</h3>
        <dl class="focus-metrics">
          <div><dt>Focus time</dt><dd data-focus-stat="minutes">0 min</dd></div>
          <div><dt>Sessions</dt><dd data-focus-stat="sessions">0</dd></div>
          <div><dt>Credits earned</dt><dd data-focus-stat="credits">0</dd></div>
        </dl>
      </section>
    </div>
  `;

  const elBadge = panel.querySelector('#ft-badge');
  const elPhase = panel.querySelector('#ft-phase');
  const elClock = panel.querySelector('#ft-clock');
  const btnStart = panel.querySelector('#ft-start');
  const btnPause = panel.querySelector('#ft-pause');
  const btnCancel = panel.querySelector('#ft-cancel');
  const inCustomMin = panel.querySelector('#ft-custom-min');
  const inCustomBrk = panel.querySelector('#ft-custom-brk');
  const formCustom = panel.querySelector('.focus-custom');
  const elRecap = panel.querySelector('#ft-recap');
  const plan = panel.querySelector('#ft-plan');
  const progress = panel.querySelector('#ft-progress');
  const petAction = panel.querySelector('#ft-pet-action');
  const scene = panel.querySelector('#ft-pet').getContext('2d');
  const sheet = new Image();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let previousFrame = -1;
  sheet.onload = () => renderClock();
  sheet.src = 'sprites/study-actions.png';
  const health = document.getElementById('study-health');
  if (!state.isDemo) {
    inCustomMin.value = state.plannedMin;
    inCustomBrk.value = state.breakMin;
  }
  ctx.bus?.on('desk:posture', sample => {
    if (state.phase !== 'focus' || state.status !== 'running' || !sample?.observed) return;
    const field = { upright: 'uprightSec', slouch: 'slouchSec', away: 'awaySec' }[sample.label];
    if (!field) return;
    state.deskSeconds ||= { uprightSec: 0, slouchSec: 0, awaySec: 0 };
    state.deskSeconds[field]++;
    persist();
  });
  if (health) {
    health.hidden = false;
    document.getElementById('study-start-from-health').onclick = () => ctx.openTab('focus');
  }

  const snapshotNow = () => takeSessionSnapshot({
    answeredNudges: ctx.pet?.nudgesAnswered || 0,
    deskEnabled: ctx.pet?.mode === 'desk' || !!state.deskSeconds,
    desk: state.deskSeconds,
  });

  const persist = () => saveState(state);

  function getRemainingMs() {
    if (state.status === 'running' && state.endAt) {
      return Math.max(0, state.endAt - Date.now());
    }
    return Math.max(0, state.remainingMs);
  }

  function renderClock() {
    const rem = getRemainingMs();
    const duration = Math.max(1, (state.phase === 'break' ? state.breakMin : state.plannedMin) * 60_000);
    elClock.textContent = fmtClock(rem);
    progress.value = state.phase === 'idle' ? 0 : Math.min(100, (1 - rem / duration) * 100);
    const elapsed = state.phase === 'focus' ? Math.max(0, duration - rem) : 0;
    const action = Math.floor(elapsed / ACTIVITY_MS) % STUDY_ACTIONS.length;
    const frame = reducedMotion.matches ? 0 : Math.floor(elapsed / FRAME_MS) % 4;
    const imageIndex = action * 4 + frame;
    if (sheet.complete && sheet.naturalWidth && previousFrame !== imageIndex) {
      scene.clearRect(0, 0, 64, 48);
      scene.drawImage(sheet, frame * 64, action * 48, 64, 48, 0, 0, 64, 48);
      previousFrame = imageIndex;
    }
    const caption = state.phase === 'focus'
      ? (state.status === 'paused' ? 'Study paused' : STUDY_ACTIONS[action])
      : state.phase === 'break' ? 'Taking a break' : 'Pebblebit’s study desk';
    if (petAction.textContent !== caption) petAction.textContent = caption;
  }

  function renderStats() {
    const focus = ctx.pet?.focus || {};
    const values = {
      minutes: (focus.completedMinutes || 0) + ' min',
      sessions: focus.completedSessions || 0,
      credits: focus.credits || 0
    };
    for (const el of document.querySelectorAll('[data-focus-stat]')) {
      el.textContent = values[el.dataset.focusStat];
    }
  }

  function encouragement(recap) {
    if (recap.isDemo) return 'Nicely done! Pebblebit finished the practice timer with you. Ready for a stretch?';
    const minutes = recap.focus.completedMin;
    return `Well done! You finished ${minutes} minute${minutes === 1 ? '' : 's'} of focus. Pebblebit studied right alongside you. Take a short break before the next session.`;
  }

  function renderUI() {
    const idle = state.phase === 'idle';
    plan.hidden = !idle;
    btnStart.hidden = !idle;
    btnPause.hidden = idle;
    btnCancel.hidden = idle;
    elBadge.textContent = state.isDemo
      ? 'Practice timer · no study credits'
      : `${state.plannedMin} min focus · ${state.breakMin} min break`;
    for (const button of plan.querySelectorAll('[data-preset]')) {
      const preset = PRESETS.find(p => p.id === button.dataset.preset);
      const selected = preset.focusMin === state.plannedMin && preset.breakMin === state.breakMin && preset.isDemo === state.isDemo;
      button.setAttribute('aria-pressed', String(selected));
    }

    if (idle) {
      elPhase.textContent = 'Ready to study';
    } else if (state.phase === 'focus') {
      elPhase.textContent = state.status === 'paused' ? 'Focus paused' : 'Focus in progress';
    } else {
      elPhase.textContent = state.status === 'paused' ? 'Break paused' : 'Break in progress';
    }
    btnPause.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
    btnCancel.textContent = state.phase === 'break' ? 'End break' : 'End early';
    renderStats();
    renderClock();

    if (state.lastRecap) {
      renderRecapCard(elRecap, state.lastRecap, {
        canStart: idle,
        encourage: state.lastRecap.focus.status === 'completed' ? encouragement(state.lastRecap) : '',
        onTakeBreak: startBreak,
        onStartAnother: startFocus,
        onAskLiveoak: () => ctx.say?.(encouragement(state.lastRecap))
      });
    } else {
      elRecap.replaceChildren();
    }
  }

  function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function startTicker() {
    stopTicker();
    tickTimer = setInterval(() => {
      const rem = getRemainingMs();
      renderClock();
      if (rem <= 0) {
        if (state.phase === 'focus') finishFocus('completed');
        else if (state.phase === 'break') finishBreak();
      }
    }, 250);
  }

  function startFocus() {
    if (state.phase !== 'idle') return;
    const durationMs = Math.round(state.plannedMin * 60_000);
    state.phase = 'focus';
    state.status = 'running';
    state.sessionId = `focus-${Date.now()}`;
    state.startedAt = Date.now();
    state.endAt = state.startedAt + durationMs;
    state.remainingMs = durationMs;
    state.pausedAt = null;
    state.pauseSec = 0;
    state.breaksStarted = 0;
    state.breaksFinished = 0;
    state.deskSeconds = null;
    state.awarded = false;
    state.startSnap = snapshotNow();
    state.lastRecap = null;
    elRecap.innerHTML = '';
    persist();
    startTicker();
    renderUI();
    ctx.chirp?.('hello');
  }

  function startBreak() {
    if (state.phase !== 'idle') return;
    const durationMs = Math.round(state.breakMin * 60_000);
    state.phase = 'break';
    state.status = 'running';
    state.endAt = Date.now() + durationMs;
    state.remainingMs = durationMs;
    state.pausedAt = null;
    state.breaksStarted += 1;
    if (state.lastRecap) state.lastRecap.breaks.started = state.breaksStarted;
    persist();
    startTicker();
    renderUI();
    ctx.toast?.('Break started — stretch or walk around!', 2500);
  }

  function finishBreak(completed = true) {
    stopTicker();
    state.phase = 'idle';
    state.status = 'idle';
    state.endAt = null;
    state.remainingMs = Math.round(state.plannedMin * 60_000);
    if (completed) state.breaksFinished += 1;
    if (state.lastRecap) state.lastRecap.breaks.finished = state.breaksFinished;
    persist();
    renderUI();
    if (completed) ctx.chirp?.('happy');
    ctx.toast?.(completed ? 'Break finished! Ready for another focus block.' : 'Break ended.', 3000);
  }

  function finishFocus(outcome) {
    stopTicker();
    if (state.pausedAt) state.pauseSec += (Date.now() - state.pausedAt) / 1000;
    const remMs = outcome === 'completed' ? 0 : getRemainingMs();
    const plannedMs = Math.round(state.plannedMin * 60_000);
    const elapsedMs = Math.max(0, plannedMs - remMs);
    const completedMin = outcome === 'completed'
      ? state.plannedMin
      : +(elapsedMs / 60_000).toFixed(1);

    // Single-award idempotency guard: only award once per sessionId, never for demo or canceled.
    let creditsAwarded = 0;
    if (outcome === 'completed' && !state.awarded && !state.isDemo && ctx.pet?.recordFocusSession) {
      creditsAwarded = ctx.pet.recordFocusSession({ completedMin, isDemo: false });
      state.awarded = true;
      ctx.store?.set('pet', ctx.pet);
      ctx.render?.();
    }

    const endSnap = snapshotNow();
    const recap = buildSessionRecap({
      sessionResult: {
        sessionId: state.sessionId,
        plannedMin: state.plannedMin,
        completedMin,
        pauseSec: Math.round(state.pauseSec),
        status: outcome,
        isDemo: state.isDemo,
        breaksStarted: state.breaksStarted,
        breaksFinished: state.breaksFinished,
        creditsAwarded,
        unlockedEvolution: null,
      },
      startSnap: state.startSnap || endSnap,
      endSnap,
      lifetimeSignals: ctx.pet?.evolutionSignals ? ctx.pet.evolutionSignals() : {},
    });

    state.phase = 'idle';
    state.status = 'idle';
    state.endAt = null;
    state.pausedAt = null;
    state.remainingMs = plannedMs;
    state.lastRecap = recap;
    persist();
    renderUI();

    if (outcome === 'completed') {
      ctx.chirp?.('happy');
      ctx.say?.(encouragement(recap));
    }
    ctx.toast?.(
      outcome === 'completed'
        ? (state.isDemo ? 'Demo session complete (no credits awarded).' : `Focus complete! +${creditsAwarded} focus credits.`)
        : 'Focus session ended early.',
      3000
    );
  }

  // Event wiring
  panel.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.phase !== 'idle') return;
      const p = PRESETS.find((x) => x.id === btn.dataset.preset);
      if (!p) return;
      state.plannedMin = p.focusMin;
      state.breakMin = p.breakMin;
      state.isDemo = p.isDemo;
      if (!p.isDemo) {
        inCustomMin.value = p.focusMin;
        inCustomBrk.value = p.breakMin;
      }
      state.remainingMs = Math.round(p.focusMin * 60_000);
      persist();
      renderUI();
    });
  });

  formCustom.addEventListener('submit', e => {
    e.preventDefault();
    if (state.phase !== 'idle') return;
    const fMin = Math.max(1, Math.min(180, Math.round(Number(inCustomMin.value) || 25)));
    const bMin = Math.max(1, Math.min(60, Math.round(Number(inCustomBrk.value) || 5)));
    state.plannedMin = fMin;
    state.breakMin = bMin;
    state.isDemo = false;
    state.remainingMs = fMin * 60_000;
    persist();
    renderUI();
  });

  btnStart.addEventListener('click', () => startFocus());

  btnPause.addEventListener('click', () => {
    if (state.status === 'running') {
      state.remainingMs = getRemainingMs();
      if (state.remainingMs <= 0) {
        if (state.phase === 'focus') finishFocus('completed');
        else finishBreak();
        return;
      }
      state.endAt = null;
      state.status = 'paused';
      state.pausedAt = Date.now();
      stopTicker();
    } else if (state.status === 'paused') {
      if (state.pausedAt) state.pauseSec += (Date.now() - state.pausedAt) / 1000;
      state.pausedAt = null;
      state.endAt = Date.now() + state.remainingMs;
      state.status = 'running';
      startTicker();
    }
    persist();
    renderUI();
  });

  btnCancel.addEventListener('click', () => {
    if (state.phase === 'focus' && confirm('End this focus session without earning credits?')) {
      finishFocus(getRemainingMs() <= 0 ? 'completed' : 'canceled');
    } else if (state.phase === 'break') finishBreak(false);
  });

  // Resume active timer cleanly after a page reload.
  if (state.status === 'running') {
    if (getRemainingMs() <= 0) {
      if (state.phase === 'focus') finishFocus('completed');
      else if (state.phase === 'break') finishBreak();
    } else {
      startTicker();
    }
  }
  renderUI();
}
