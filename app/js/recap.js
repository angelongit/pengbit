// app/js/recap.js
import { getEvolutionProgress } from './evolutions.js';

/**
 * Capture a local snapshot at session start or end.
 */
export function takeSessionSnapshot(state) {
  return {
    ts: Date.now(),
    answeredNudges: state.answeredNudges || 0,
    desk: {
      enabled: Boolean(state.deskEnabled),
      uprightSec: state.desk?.uprightSec || 0,
      slouchSec: state.desk?.slouchSec || 0,
      awaySec: state.desk?.awaySec || 0,
    },
  };
}

/**
 * Build the structured recap object from timer result + start/end snapshots.
 */
export function buildSessionRecap({
  sessionResult, // { plannedMin, completedMin, pauseSec, status: 'completed'|'canceled', isDemo, breaksStarted, breaksFinished, creditsAwarded, unlockedEvolution }
  startSnap,
  endSnap,
  lifetimeSignals,
}) {
  const answeredNudgesDelta = Math.max(0, (endSnap.answeredNudges || 0) - (startSnap.answeredNudges || 0));

  const uprightSec = Math.max(0, (endSnap.desk?.uprightSec || 0) - (startSnap.desk?.uprightSec || 0));
  const slouchSec = Math.max(0, (endSnap.desk?.slouchSec || 0) - (startSnap.desk?.slouchSec || 0));
  const awaySec = Math.max(0, (endSnap.desk?.awaySec || 0) - (startSnap.desk?.awaySec || 0));
  const totalObservedSec = uprightSec + slouchSec + awaySec;
  const sessionSec = Math.max(1, (sessionResult.completedMin || 0) * 60);
  const coveragePct = Math.min(100, Math.round((totalObservedSec / sessionSec) * 100));

  let deskSummary;
  if (!startSnap.desk?.enabled && !endSnap.desk?.enabled) {
    deskSummary = { status: 'off', text: 'Desk tracking off' };
  } else if (totalObservedSec < 30) {
    deskSummary = { status: 'insufficient', text: 'Insufficient observations' };
  } else {
    deskSummary = {
      status: 'ok',
      uprightMin: +(uprightSec / 60).toFixed(1),
      slouchMin: +(slouchSec / 60).toFixed(1),
      awayMin: +(awaySec / 60).toFixed(1),
      coveragePct,
      text: `Upright ${(uprightSec / 60).toFixed(1)}m · Slouch ${(slouchSec / 60).toFixed(1)}m · Away ${(awaySec / 60).toFixed(1)}m (${coveragePct}% coverage)`,
    };
  }

  return {
    isDemo: Boolean(sessionResult.isDemo),
    focus: {
      plannedMin: sessionResult.plannedMin,
      completedMin: sessionResult.completedMin,
      pauseMin: +( (sessionResult.pauseSec || 0) / 60 ).toFixed(1),
      status: sessionResult.status, // 'completed' | 'canceled'
    },
    breaks: {
      started: sessionResult.breaksStarted || 0,
      finished: sessionResult.breaksFinished || 0,
      answeredNudges: answeredNudgesDelta,
    },
    desk: deskSummary,
    rewards: {
      creditsGranted: sessionResult.isDemo ? 0 : (sessionResult.creditsAwarded || 0),
      unlockedEvolution: sessionResult.unlockedEvolution || null, // { form, reason }
      progress: getEvolutionProgress(lifetimeSignals),
    },
  };
}

/**
 * Minimal, privacy-safe payload to send to Professor Liveoak (no frames/audio).
 */
export function buildLiveoakRecapPayload(recap) {
  return {
    type: 'study_session_recap',
    isDemo: recap.isDemo,
    focus: recap.focus,
    breaks: recap.breaks,
    desk: recap.desk.status === 'ok'
      ? {
          uprightMin: recap.desk.uprightMin,
          slouchMin: recap.desk.slouchMin,
          awayMin: recap.desk.awayMin,
          coveragePct: recap.desk.coveragePct,
        }
      : { status: recap.desk.text },
    rewards: {
      creditsGranted: recap.rewards.creditsGranted,
      unlockedForm: recap.rewards.unlockedEvolution?.form || null,
      progressLabel: recap.rewards.progress.label,
    },
  };
}

/**
 * Render the offline Recap Card into a container element.
 */
export function renderRecapCard(container, recap, { canStart, encourage, onTakeBreak, onStartAnother, onAskLiveoak }) {
  const safe = value => String(value ?? '').replace(/[&<>"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[ch]);
  const demoBadge = recap.isDemo
    ? '<span class="recap-badge">Practice session · no credits</span>'
    : '';
  const completed = recap.focus.status === 'completed';
  const focused = recap.isDemo ? `${Math.round(recap.focus.completedMin * 60)} sec` : `${recap.focus.completedMin} min`;

  const unlockHtml = recap.rewards.unlockedEvolution
    ? `<p class="recap-unlock"><strong>New form: ${safe(recap.rewards.unlockedEvolution.form)}</strong> · ${safe(recap.rewards.unlockedEvolution.reason)}</p>`
    : '';

  container.innerHTML = `
    <section class="focus-card recap-card" aria-label="Latest focus session">
      <div class="recap-header">
        <h3>${completed ? 'Session complete' : 'Session ended early'}</h3>
        ${demoBadge}
      </div>
      <dl class="focus-metrics">
        <div><dt>Focused</dt><dd>${safe(focused)}</dd></div>
        <div><dt>Nudges answered</dt><dd>${safe(recap.breaks.answeredNudges)}</dd></div>
        <div><dt>Credits earned</dt><dd>+${safe(recap.rewards.creditsGranted)}</dd></div>
      </dl>
      <dl class="recap-grid">
        <dt>Paused</dt><dd>${safe(recap.focus.pauseMin)} min</dd>
        <dt>Breaks completed</dt><dd>${safe(recap.breaks.finished)} / ${safe(recap.breaks.started)}</dd>
        <dt>Desk observations</dt><dd>${safe(recap.desk.text)}</dd>
        <dt>Evolution</dt><dd>${safe(recap.rewards.progress.label)}</dd>
      </dl>
      ${unlockHtml}
      ${encourage ? `<p class="recap-note"><b>Professor Liveoak</b> · ${safe(encourage)}</p>` : ''}
      <div class="recap-actions">
        ${canStart ? '<button type="button" data-action="break" class="btn-chrome focus-primary">Take a break</button><button type="button" data-action="restart" class="btn-chrome">Start another timer</button>' : ''}
        ${encourage ? '<button type="button" data-action="liveoak" class="btn-chrome">Replay encouragement</button>' : ''}
      </div>
    </section>
  `;

  container.querySelector('[data-action="break"]')?.addEventListener('click', onTakeBreak);
  container.querySelector('[data-action="restart"]')?.addEventListener('click', onStartAnother);
  container.querySelector('[data-action="liveoak"]')?.addEventListener('click', () => {
    onAskLiveoak(buildLiveoakRecapPayload(recap));
  });
}
