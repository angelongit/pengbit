import { acquire, release, subscribe, LM, angle, drawSkeleton } from './pose.js';
import { on, emit } from './bus.js';
import { coach } from './ai.js';

const TARGET = 10;
const HOLD_MS = 10000;
const sides = ['LEFT', 'RIGHT'];

function visible(p) {
  return p && (p.visibility ?? 1) >= 0.55 && p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;
}

// Only landmarks and timestamps enter the counter. No frames are retained.
export function createCounter(kind) {
  let down = false;
  let ready = false;
  let reps = 0;
  let held = 0;
  let last;
  let attempts = 0;
  const result = (hint, done = false) => ({
    hint, done, reps, held, formScore: kind === 'stretch' ? Number(done) : reps / Math.max(1, attempts)
  });
  return ({ landmarks, t, width = 1, height = 1 }) => {
    const at = (side, joint) => landmarks?.[LM[side + '_' + joint]];
    if (kind === 'stretch') {
      const shoulders = sides.map(side => at(side, 'SHOULDER'));
      const wrists = sides.map(side => at(side, 'WRIST'));
      if (![...shoulders, ...wrists].every(visible)) {
        held = 0; last = undefined;
        return result('Keep both shoulders and wrists in view.');
      }
      if (!wrists.every((wrist, i) => wrist.y < shoulders[i].y - 0.02)) {
        held = 0; last = undefined;
        return result('Raise both hands above your shoulders.');
      }
      held = last !== undefined && t - last <= 350 ? held + Math.max(0, t - last) : 0;
      last = t;
      return result('Hold both hands up.', held >= HOLD_MS);
    }

    const joints = ['SHOULDER', 'HIP', 'KNEE', 'ANKLE'];
    const usable = sides.map(side => joints.map(joint => at(side, joint)))
      .filter(points => points.every(visible));
    if (!visible(landmarks?.[LM.NOSE]) || !usable.length) {
      down = ready = false;
      return result('Step back until your head and feet are in view. Face sideways.');
    }
    const ratio = width / height;
    const knees = usable.map(points => {
      const [shoulder, hip, knee, ankle] = points.map(p => ({ x: p.x * ratio, y: p.y, z: 0 }));
      return {
        bend: angle(hip, knee, ankle),
        lean: Math.atan2(Math.abs(shoulder.x - hip.x), hip.y - shoulder.y) * 180 / Math.PI
      };
    });
    const bend = Math.min(...knees.map(side => side.bend));
    const lean = Math.max(...knees.map(side => side.lean));
    // Start in an upright pose, then require a complete down/up cycle.
    if (bend > 160) {
      if (down) reps++;
      down = false;
      ready = true;
      return result('Lower into your next squat.', reps >= TARGET);
    }
    if (!ready && !down) return result('Stand upright to start.');
    if (lean > 45) {
      if (down || bend < 100) {
        if (ready && !down) attempts++;
        down = false;
        ready = false;
      }
      return result('Keep your torso more upright, then stand to retry.');
    }
    if (bend < 100 && !down) {
      attempts++;
      down = true;
      ready = false;
    }
    return result(down ? 'Stand back up to finish the rep.' : 'Bend a little deeper if comfortable.');
  };
}

export function init(ctx) {
  const panel = document.getElementById('tab-move');
  if (!panel) return;
  panel.innerHTML = '<h2>Movement break</h2>' +
    '<p>Try 10 camera-counted squats or a 10-second overhead stretch. Camera frames stay on this device.</p>' +
    '<p class="move-offer" aria-live="polite"></p>' +
    '<div class="row"><button class="btn-chrome" data-exercise="squat">Start squats</button>' +
    '<button class="btn-chrome" data-exercise="stretch">Start stretch</button>' +
    '<button class="btn-chrome" id="move-stop" disabled>Stop</button></div>' +
    '<canvas class="move-preview" width="640" height="480" aria-label="Local pose preview" hidden></canvas>' +
    '<p class="move-progress" role="status"></p><p class="move-hint"></p>';
  const buttons = [...panel.querySelectorAll('[data-exercise]')];
  const stopButton = panel.querySelector('#move-stop');
  const canvas = panel.querySelector('canvas');
  const progress = panel.querySelector('.move-progress');
  const hint = panel.querySelector('.move-hint');
  const offer = panel.querySelector('.move-offer');
  let session;
  let coachVersion = 0;

  function stop(message) {
    const previous = session;
    session = null;
    previous?.unsubscribe?.();
    if (previous?.handle) release(previous.handle);
    canvas.hidden = true;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    stopButton.disabled = true;
    for (const button of buttons) button.disabled = false;
    if (message) progress.textContent = message;
    hint.textContent = '';
  }

  async function finish(kind, result) {
    const reps = kind === 'stretch' ? 1 : result.reps;
    stop('Break complete. Pengbit gained 10 joy and 5 energy.');
    offer.textContent = '';
    ctx.pet.reward({ happy: 10, energy: 5, reason: 'exercise', reps });
    ctx.pet.answerNudge('exercise');
    ctx.render();
    ctx.chirp('happy');
    emit('exercise:done', { kind, reps, formScore: result.formScore });
    const id = ++coachVersion;
    const { text } = await coach(ctx.pet.summary(), 'moved');
    if (id !== coachVersion) return;
    ctx.bubble(text, 6500);
    ctx.say(text);
  }

  async function start(kind) {
    if (session) return;
    if (ctx.pet.isEgg) {
      progress.textContent = 'Hatch Pengbit before starting a movement break.';
      return;
    }
    const current = session = {};
    coachVersion++;
    const count = createCounter(kind);
    for (const button of buttons) button.disabled = true;
    stopButton.disabled = false;
    progress.textContent = 'Opening the camera and loading pose detection…';
    try {
      const handle = await acquire({ facing: 'user' });
      if (session !== current) { release(handle); return; }
      current.handle = handle;
      canvas.hidden = false;
      current.unsubscribe = subscribe(frame => {
        if (session !== current) return;
        if (frame.width && frame.height && (canvas.width !== frame.width || canvas.height !== frame.height)) {
          canvas.width = frame.width;
          canvas.height = frame.height;
        }
        drawSkeleton(canvas, frame.landmarks, { mirrored: frame.mirrored, video: frame.video });
        const result = count(frame);
        const metric = kind === 'stretch'
          ? Math.min(10, Math.floor(result.held / 1000)) + ' / 10 seconds'
          : result.reps + ' / ' + TARGET + ' squats';
        if (progress.textContent !== metric) progress.textContent = metric;
        if (hint.textContent !== result.hint) hint.textContent = result.hint;
        if (result.done) void finish(kind, result);
      });
    } catch (error) {
      if (session === current) stop((error.message || 'Pose tracking is unavailable.') + ' You can still take a walking break.');
    }
  }

  for (const button of buttons) button.onclick = () => start(button.dataset.exercise);
  stopButton.onclick = () => stop('Movement break stopped.');
  on('pet:idle', () => {
    offer.textContent = 'Pengbit is shivering. Try a movement break.';
    emit('exercise:offer', { kind: 'squat' });
  });
  new MutationObserver(() => {
    if (session && panel.classList.contains('hidden')) stop('Movement break stopped.');
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session) stop('Movement break stopped.');
  });
  window.addEventListener('pagehide', () => { if (session) stop(); });
  ctx.showTab('move');
}
