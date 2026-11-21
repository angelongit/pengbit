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
  };
}

export function init(ctx) {
  const panel = document.getElementById('tab-focus');
  if (!panel) return;
  ctx.showTab('focus');

  let state = { ...defaultState(), ...(loadSaved() || {}) };
  let tickTimer = null;

  panel.innerHTML = `
    <div class="focus-wrap" style="display:grid;gap:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <h2 style="margin:0;">Focus Timer</h2>
        <span id="ft-badge" class="muted" style="font-size:12px;"></span>
      </div>

      <div id="ft-presets" style="display:flex;gap:6px;flex-wrap:wrap;">
        ${PRESETS.map((p) => `<button type="button" class="btn-chrome" data-preset="${p.id}">${p.label}</button>`).join('')}
      </div>

      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <label style="font-size:12px;">Custom (min):
          <input id="ft-custom-min" type="number" min="1" max="180" step="1" value="25" style="width:64px;">
        </label>
        <label style="font-size:12px;">Break (min):
          <input id="ft-custom-brk" type="number" min="1" max="60" step="1" value="5" style="width:56px;">
        </label>
        <button type="button" id="ft-apply-custom" class="btn-chrome">Set</button>
      </div>

      <div style="text-align:center;padding:14px 8px;border:2px solid rgba(255,255,255,0.2);border-radius:8px;">
        <div id="ft-phase" class="muted" style="font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Ready</div>
        <div id="ft-clock" style="font-family:var(--pix,monospace);font-size:32px;margin:8px 0;">25:00</div>
        <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
          <button type="button" id="ft-start" class="btn-chrome">Start Focus</button>
          <button type="button" id="ft-pause" class="btn-chrome" disabled>Pause</button>
          <button type="button" id="ft-cancel" class="btn-chrome" disabled>End Early</button>
        </div>
      </div>

      <div id="ft-recap"></div>
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
  const btnCustom = panel.querySelector('#ft-apply-custom');
  const elRecap = panel.querySelector('#ft-recap');

  const snapshotNow = () => takeSessionSnapshot({
    answeredNudges: ctx.pet?.nudgesAnswered || 0,
    deskEnabled: ctx.pet?.mode === 'desk',
    desk: ctx.pet?.desk || { uprightSec: 0, slouchSec: 0, awaySec: 0 },
  });

  const persist = () => saveState(state);

  function getRemainingMs() {
    if (state.status === 'running' && state.endAt) {
      return Math.max(0, state.endAt - Date.now());
    }
    return Math.max(0, state.remainingMs);
  }

  function renderUI() {
    const rem = getRemainingMs();
    elClock.textContent = fmtClock(rem);
    elBadge.textContent = state.isDemo
      ? 'DEMO MODE (no credits / no evolution)'
      : `Focus credits: ${ctx.pet?.focus?.credits ?? 0}`;

    if (state.phase === 'idle') {
      elPhase.textContent = 'Ready';
      btnStart.textContent = 'Start Focus';
      btnStart.disabled = false;
      btnPause.disabled = true;
      btnCancel.disabled = true;
    } else if (state.phase === 'focus') {
      elPhase.textContent = state.status === 'paused' ? 'Focus (Paused)' : 'Focusing';
      btnStart.textContent = 'Running...';
      btnStart.disabled = true;
      btnPause.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
      btnPause.disabled = false;
      btnCancel.disabled = false;
    } else if (state.phase === 'break') {
      elPhase.textContent = state.status === 'paused' ? 'Break (Paused)' : 'Break Time';
      btnStart.textContent = 'On Break';
      btnStart.disabled = true;
      btnPause.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
      btnPause.disabled = false;
      btnCancel.disabled = false;
    }

    if (state.lastRecap && typeof renderRecapCard === 'function') {
      renderRecapCard(elRecap, state.lastRecap, {
        onTakeBreak: () => startBreak(),
        onStartAnother: () => {
          state.lastRecap = null;
          persist();
          elRecap.innerHTML = '';
          startFocus();
        },
        onAskLiveoak: (payload) => {
          if (ctx.openTab) ctx.openTab('talk');
          if (ctx.say) ctx.say(`Session recap ready: ${payload.focus.completedMin} min focused.`);
        },
      });
    }
  }

  function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function startTicker() {
    stopTicker();
    tickTimer = setInterval(() => {
      const rem = getRemainingMs();
      elClock.textContent = fmtClock(rem);
      if (rem <= 0) {
        if (state.phase === 'focus') finishFocus('completed');
        else if (state.phase === 'break') finishBreak();
      }
    }, 250);
  }

  function startFocus() {
    const durationMs = Math.round(state.plannedMin * 60_000);
    state.phase = 'focus';
    state.status = 'running';
    state.sessionId = `focus-${Date.now()}`;
    state.startedAt = Date.now();
    state.endAt = state.startedAt + durationMs;
    state.remainingMs = durationMs;
    state.pausedAt = null;
    state.pauseSec = 0;
    state.awarded = false;
    state.startSnap = snapshotNow();
    state.lastRecap = null;
    elRecap.innerHTML = '';
    persist();
    startTicker();
    renderUI();
    ctx.chirp?.('start');
  }

  function startBreak() {
    const durationMs = Math.round(state.breakMin * 60_000);
    state.phase = 'break';
    state.status = 'running';
    state.endAt = Date.now() + durationMs;
    state.remainingMs = durationMs;
    state.pausedAt = null;
    state.breaksStarted += 1;
    persist();
    startTicker();
    renderUI();
    ctx.toast?.('Break started — stretch or walk around!', 2500);
  }

  function finishBreak() {
    stopTicker();
    state.phase = 'idle';
    state.status = 'idle';
    state.endAt = null;
    state.remainingMs = Math.round(state.plannedMin * 60_000);
    state.breaksFinished += 1;
    persist();
    renderUI();
    ctx.chirp?.('done');
    ctx.toast?.('Break finished! Ready for another focus block.', 3000);
  }

  function finishFocus(outcome) {
    stopTicker();
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
    state.remainingMs = plannedMs;
    state.lastRecap = recap;
    persist();
    renderUI();

    ctx.chirp?.(outcome === 'completed' ? 'done' : 'cancel');
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
      state.remainingMs = Math.round(p.focusMin * 60_000);
      persist();
      renderUI();
    });
  });

  btnCustom.addEventListener('click', () => {
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
    if (state.phase === 'focus') finishFocus('canceled');
    else if (state.phase === 'break') finishBreak();
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
