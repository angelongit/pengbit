// Chirps (WebAudio, like the buzzer on the hardware) and the professor's voice.
let ctx = null;
export function unlockAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

const CHIRPS = {
  hello:  [[880, 0.08], [1320, 0.1]],
  happy:  [[988, 0.07], [1319, 0.07], [1568, 0.12]],
  feed:   [[660, 0.06], [880, 0.08]],
  sad:    [[440, 0.15], [330, 0.25]],
  nudge:  [[1200, 0.06], [0, 0.05], [1200, 0.06], [0, 0.05], [1200, 0.06]],
  hatch:  [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.2]],
  evolve: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.08], [1319, 0.08], [1568, 0.3]],
  tick:   [[1500, 0.02]],
};

export function chirp(name) {
  if (!ctx) return;
  let t = ctx.currentTime;
  for (const [f, d] of CHIRPS[name] || CHIRPS.hello) {
    if (f) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d);
    }
    t += d;
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
