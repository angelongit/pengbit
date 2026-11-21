// Pet sound effects use local Web Audio. The professor uses a separate voice path.
let ctx = null;
let petSounds = true;
let effects = null;

export function unlockAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return Promise.resolve();
  if (!ctx) {
    ctx = new AudioContext();
    effects = ctx.createGain();
    effects.gain.value = petSounds ? 1 : 0;
    effects.connect(ctx.destination);
  }
  return ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
}

export function setPetSounds(enabled) {
  petSounds = enabled;
  if (effects) effects.gain.value = enabled ? 1 : 0;
}

// Each note is [start Hz, end Hz, seconds]. Zero is a rest.
const CHIRPS = {
  hello:  [[580, 890, .10], [0, 0, .04], [720, 1040, .11]],
  feed:   [[440, 250, .09], [0, 0, .04], [510, 310, .10]],
  happy:  [[790, 1130, .13], [0, 0, .04], [1050, 1450, .14]],
  hungry: [[380, 560, .18], [0, 0, .08], [380, 500, .15]],
  sad:    [[620, 360, .25], [420, 280, .22]],
  nudge:  [[850, 580, .17], [0, 0, .12], [850, 580, .17], [0, 0, .12], [760, 440, .22]],
  move:   [[500, 740, .12], [740, 960, .12], [960, 1240, .18]],
  hatch:  [[360, 540, .08], [0, 0, .05], [540, 760, .09], [760, 1150, .17]],
  evolve: [[523, 660, .10], [660, 784, .10], [784, 1050, .10], [1050, 1560, .24]],
  tick:   [[1500, 1250, .035]],
};

export function chirp(name) {
  if (!petSounds || ctx?.state !== 'running') return;
  let t = ctx.currentTime;
  for (const [start, end, seconds] of CHIRPS[name] || CHIRPS.hello) {
    if (start) {
      const note = ctx.createOscillator();
      const volume = ctx.createGain();
      note.type = 'triangle';
      note.frequency.setValueAtTime(start, t);
      note.frequency.exponentialRampToValueAtTime(end, t + seconds);
      volume.gain.setValueAtTime(0.001, t);
      volume.gain.linearRampToValueAtTime(name === 'nudge' ? 0.15 : 0.10, t + 0.01);
      volume.gain.exponentialRampToValueAtTime(0.001, t + seconds);
      note.connect(volume).connect(effects);
      note.onended = () => { note.disconnect(); volume.disconnect(); };
      note.start(t);
      note.stop(t + seconds);
    }
    t += seconds;
  }
}

export function vibrate(pattern) { try { navigator.vibrate && navigator.vibrate(pattern); } catch {} }

// Professor voice: ElevenLabs through /api/voice; browser speech if that fails.
let current = null;
export async function speak(text, { onStart, onEnd } = {}) {
  stopSpeaking();
  try {
    const r = await fetch('api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error('voice ' + r.status);
    const blob = await r.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    current = audio;
    audio.onended = () => { current = null; onEnd && onEnd(); };
    onStart && onStart('elevenlabs');
    await audio.play();
    return 'elevenlabs';
  } catch (e) {
    if (!('speechSynthesis' in window)) { onEnd && onEnd(); return 'none'; }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02; u.pitch = 0.9;
    u.onend = () => onEnd && onEnd();
    onStart && onStart('browser');
    speechSynthesis.speak(u);
    return 'browser';
  }
}
export function stopSpeaking() {
  if (current) { current.pause(); current = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
