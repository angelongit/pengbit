// app/js/evolutions.js

export const EVOLUTION_CONFIG = {
  studyGoalMinutes: 50,
  minCompletedSessions: 2,
  minDeskValidMinutes: 10,
  uprightThreshold: 0.70,      // Library Sage (>= 70% upright)
  slouchThreshold: 0.60,       // Hunchling / Static Mage (>= 60% slouch)
  minAnsweredWalkBreaks: 3,    // Trail Mage
};

export const FORM_META = {
  scholar: {
    id: 'scholar',
    name: 'Scholar',
    artNote: 'Robe, cap, and pixel wand. Reads a spellbook when idle.',
    minimumSet: true,
  },
  hunchling: {
    id: 'hunchling',
    name: 'Hunchling',
    artNote: 'Curled-up penguin with a drooping hat. Gently encourages a reset.',
    minimumSet: true,
  },
  library_sage: {
    id: 'library_sage',
    name: 'Library Sage',
    artNote: 'Round glasses, book stack, and calm page turns.',
    minimumSet: false,
  },
  static_mage: {
    id: 'static_mage',
    name: 'Static Mage',
    artNote: 'Bent hat and playful sparks. Suggests a short posture reset.',
    minimumSet: false,
  },
  trail_mage: {
    id: 'trail_mage',
    name: 'Trail Mage',
    artNote: 'Wizard staff, messenger bag, and a confident stride.',
    minimumSet: false,
  },
  // Existing activity-based fallbacks
  sprinter: { id: 'sprinter', name: 'Sprinter', minimumSet: true },
  frost: { id: 'frost', name: 'Frost', minimumSet: true },
  glitch: { id: 'glitch', name: 'Glitch', minimumSet: true },
};

/**
 * Compute seated posture ratios from valid Desk observations (excludes away time).
 */
export function computePostureStats(desk = {}) {
  const uprightSec = Math.max(0, desk.uprightSec || 0);
  const slouchSec = Math.max(0, desk.slouchSec || 0);
  const seatedSec = uprightSec + slouchSec;
  const validMinutes = seatedSec / 60;

  return {
    seatedSec,
    validMinutes,
    uprightRatio: seatedSec > 0 ? uprightSec / seatedSec : 0,
    slouchRatio: seatedSec > 0 ? slouchSec / seatedSec : 0,
  };
}

/**
 * Evaluate which evolution unlocks for a NEW evolution event.
 * Never call this to overwrite an already-evolved pet.
 */
export function evaluateEvolution(signals, config = EVOLUTION_CONFIG) {
  const focusMin = signals.completedFocusMinutes || 0;
  const sessions = signals.completedSessions || 0;
  const walkBreaks = signals.answeredWalkBreaks || 0;
  const posture = computePostureStats(signals.desk);

  const metStudyGoal =
    focusMin >= config.studyGoalMinutes &&
    sessions >= config.minCompletedSessions;
  const hasValidDesk = posture.validMinutes >= config.minDeskValidMinutes;

  // 1. Hybrids (highest precedence)
  if (metStudyGoal && hasValidDesk && posture.uprightRatio >= config.uprightThreshold) {
    return {
      form: 'library_sage',
      reason: `Completed ${Math.round(focusMin)} focus min across ${sessions} sessions with ${Math.round(posture.uprightRatio * 100)}% upright Desk posture.`,
    };
  }

  if (metStudyGoal && hasValidDesk && posture.slouchRatio >= config.slouchThreshold) {
    return {
      form: 'static_mage',
      reason: `Completed ${Math.round(focusMin)} focus min across ${sessions} sessions with frequent slouching (${Math.round(posture.slouchRatio * 100)}%) in Desk mode.`,
    };
  }

  if (metStudyGoal && walkBreaks >= config.minAnsweredWalkBreaks) {
    return {
      form: 'trail_mage',
      reason: `Completed ${Math.round(focusMin)} focus min across ${sessions} sessions and answered ${walkBreaks} walking breaks.`,
    };
  }

  // 2. Single-signal new forms
  if (metStudyGoal) {
    return {
      form: 'scholar',
      reason: `Reached the study goal with ${Math.round(focusMin)} completed focus min across ${sessions} sessions.`,
    };
  }

  if (hasValidDesk && posture.slouchRatio >= config.slouchThreshold) {
    return {
      form: 'hunchling',
      reason: `Slouching dominated ${Math.round(posture.slouchRatio * 100)}% of ${Math.round(posture.validMinutes)} min of seated Desk observations.`,
    };
  }

  // 3. Existing activity-based fallback (Sprinter / Glitch / Frost)
  const dominant = signals.dominantPhoneActivity || 'still';
  if (dominant === 'walk') {
    return { form: 'sprinter', reason: 'Walk-dominant activity pattern.' };
  }
  if (dominant === 'shake') {
    return { form: 'glitch', reason: 'Shake-dominant phone activity pattern.' };
  }
  return { form: 'frost', reason: 'Still-dominant activity pattern.' };
}

/**
 * Returns plain-language progress toward the next eligible evolution for the Recap card.
 */
export function getEvolutionProgress(signals, config = EVOLUTION_CONFIG) {
  const focusMin = Math.round(signals.completedFocusMinutes || 0);
  const sessions = signals.completedSessions || 0;
  const minLeft = Math.max(0, config.studyGoalMinutes - focusMin);
  const sessionsLeft = Math.max(0, config.minCompletedSessions - sessions);

  if (minLeft > 0 || sessionsLeft > 0) {
    return {
      targetForm: 'Scholar',
      percent: Math.min(100, Math.round((focusMin / config.studyGoalMinutes) * 100)),
      label: `${focusMin}/${config.studyGoalMinutes} focus min · ${sessions}/${config.minCompletedSessions} sessions toward Scholar`,
    };
  }

  const walkBreaks = signals.answeredWalkBreaks || 0;
  const posture = computePostureStats(signals.desk);
  if (posture.validMinutes < config.minDeskValidMinutes) {
    return {
      targetForm: 'Library Sage / Static Mage',
      percent: Math.min(100, Math.round((posture.validMinutes / config.minDeskValidMinutes) * 100)),
      label: `Study goal met! ${Math.round(posture.validMinutes)}/${config.minDeskValidMinutes} min of Desk observations or ${walkBreaks}/${config.minAnsweredWalkBreaks} walking breaks for a hybrid form.`,
    };
  }

  return {
    targetForm: 'Hybrid Ready',
    percent: 100,
    label: 'Ready to unlock a study hybrid on your next evolution.',
  };
}
