import { loadSprites, sprite } from './sprites.js';

const bridge = window.pengbitDesktop;
const graphics = document.getElementById('pet').getContext('2d');
const name = document.getElementById('name');
const status = document.getElementById('state');
const message = document.getElementById('message');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const postureLabels = { upright: 'Sitting upright', slouch: 'Slouch detected', away: 'Away from desk' };
let state, lastSeen, lastScene;
let messageUntil = 0;
let ready = false;

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function draw(now) {
  const fresh = state && Date.now() - lastSeen < 4000;
  if (!fresh) {
    setText(status, 'Waiting for the app…');
    setText(message, 'Open Pebblebit to see your pet.');
  } else {
    setText(name, state.name || 'Pebblebit');
    const posture = state.mode === 'desk' ? postureLabels[state.posture] : '';
    setText(status, state.dead ? 'Resting' : state.isEgg ? 'Hatching' : posture || 'Ready to study');
    if (Date.now() >= messageUntil) {
      const prompt = state.mode === 'desk' ? 'Step away for a short break.' : 'Take a short movement break.';
      setText(message, state.shivering ? prompt : 'Joy ' + (state.happy ?? '—') + ' · Energy ' + (state.energy ?? '—'));
    }
  }
  if (ready && (!lastScene || Date.now() - lastScene > 1500)) {
    const frame = !motion.matches && Math.floor(now / 530) % 2;
    const art = sprite(fresh ? state.form : 'egg', frame) || sprite('baby', frame);
    graphics.clearRect(0, 0, 96, 64);
    if (art) graphics.drawImage(art, 32, 16, 32, 32);
  }
}

document.getElementById('open').onclick = () => bridge?.openApp();
document.getElementById('hide').onclick = () => bridge?.hideAssistant();
if (!bridge) {
  document.getElementById('open').hidden = true;
  document.getElementById('hide').hidden = true;
}
if ('BroadcastChannel' in window) {
  const channel = new BroadcastChannel('pengbit-roam');
  channel.onmessage = ({ data }) => {
    if (data?.type === 'state' && data.state) {
      state = data.state;
      lastSeen = Date.now();
    } else if (data?.type === 'dock:scene' && data.pixels instanceof ImageData
      && data.pixels.width === 96 && data.pixels.height === 64) {
      if (!motion.matches || !lastScene || Date.now() - lastScene >= 1000) {
        graphics.putImageData(data.pixels, 0, 0);
        lastScene = Date.now();
      }
    } else if (data?.type === 'say' && typeof data.text === 'string' && data.text.trim()) {
      setText(message, (data.who === 'prof' ? 'Liveoak: ' : '') + data.text);
      message.scrollTop = 0;
      messageUntil = Date.now() + Math.min(20000, Math.max(data.ms || 6500, data.text.length * 55));
    }
    draw(performance.now());
  };
  channel.postMessage({ type: 'hello' });
  const requestScene = () => channel.postMessage({ type: 'dock:watch' });
  requestScene();
  const watch = setInterval(requestScene, 1500);
  window.addEventListener('pagehide', () => { clearInterval(watch); channel.close(); }, { once: true });
}
setInterval(() => draw(performance.now()), 250);
loadSprites().then(() => { ready = true; draw(performance.now()); });
