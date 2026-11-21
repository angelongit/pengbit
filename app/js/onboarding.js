// W8: three-screen first-run introduction. Ends at the existing Wake Pebblebit action.
export async function init(ctx) {
  const start = document.getElementById('start');
  const inner = start?.querySelector('.start-inner');
  const wake = document.getElementById('startBtn');
  if (!start || !inner || !wake || ctx.store.get('onboarded', false)) return;
  const screens = [
    { tag: '01 / MEET YOUR COMPANION', title: 'A penguin with a purpose', body: 'Pebblebit is a tiny pixel penguin living in your handheld. It grows, changes, and reacts to the way you move through your day.', note: 'Your little friend is counting on you.' },
    { tag: '02 / THE DAILY QUEST', title: 'Movement makes it thrive', body: 'Walks help Pebblebit become a Sprinter. Long stretches of sitting shape a calm Frost. Shake events create a glitchy Glitch. When Pebblebit nudges you, a short break helps.', note: 'Small breaks count. No perfect routine required.' },
    { tag: '03 / YOUR PRIVACY', title: 'Your privacy matters', body: 'Phone motion is processed on your device. In Desk mode, posture video is processed locally and never uploaded. If you ask Professor Liveoak for help, your pet stats are shared with the AI service to personalize its reply.', note: 'You stay in control of the features you use.' },
  ];
  const panel = document.createElement('section'); panel.className = 'onboard'; panel.setAttribute('aria-label', 'Pebblebit introduction'); panel.setAttribute('aria-live', 'polite');
  const count = document.createElement('p'); count.className = 'onboard-count';
  const tag = document.createElement('p'); tag.className = 'onboard-tag';
  const title = document.createElement('h2'); title.className = 'onboard-title';
  const body = document.createElement('p'); body.className = 'onboard-body';
  const note = document.createElement('p'); note.className = 'onboard-note';
  const actions = document.createElement('div'); actions.className = 'onboard-actions';
  const back = document.createElement('button'); back.type = 'button'; back.className = 'btn-ghost'; back.textContent = 'Back';
  const next = document.createElement('button'); next.type = 'button'; next.className = 'btn-chrome';
  actions.append(back, next); panel.append(count, tag, title, body, note, actions);
  inner.querySelector('.logo')?.classList.add('hidden'); inner.querySelector('.tag')?.classList.add('hidden'); wake.classList.add('hidden'); inner.insertBefore(panel, wake);
  let index = 0;
  function render() { const s = screens[index]; count.textContent = 'TRANSMISSION ' + (index + 1) + ' OF ' + screens.length; tag.textContent = s.tag; title.textContent = s.title; body.textContent = s.body; note.textContent = s.note; back.hidden = index === 0; next.textContent = index === screens.length - 1 ? 'Finish intro' : 'Next'; }
  back.addEventListener('click', () => { if (index > 0) { index--; render(); } });
  next.addEventListener('click', () => { if (index < screens.length - 1) { index++; render(); return; } ctx.store.set('onboarded', true); panel.remove(); inner.querySelector('.logo')?.classList.remove('hidden'); inner.querySelector('.tag')?.classList.remove('hidden'); wake.classList.remove('hidden'); });
  render();
}
