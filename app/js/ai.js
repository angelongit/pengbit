// Professor AI. Calls the serverless proxy (api/dex, api/coach), which holds the API keys.
// If the proxy isn't set up, falls back to offline text so the demo never breaks.
import { FORMS } from './pet.js';

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  const j = await r.json();
  if (!j.text) throw new Error('empty');
  return j.text;
}

export async function dexEntry(summary) {
  try { return { text: await post('api/dex', { pet: summary }), source: 'ai' }; }
  catch { return { text: offlineDex(summary), source: 'offline' }; }
}

export async function coach(summary, situation) {
  try { return { text: await post('api/coach', { pet: summary, situation }), source: 'ai' }; }
  catch { return { text: offlineCoach(summary, situation), source: 'offline' }; }
}

function offlineDex(s) {
  const f = FORMS[s.form];
  const lean = s.minutes.walk >= s.minutes.still ? 'loves a good walk' : 'spends a lot of time sitting';
  return `${f.name}. ${f.blurb} This one ${lean}: ${s.minutes.walk} minutes walking, ${s.minutes.still} still and ${s.minutes.shake} shaking so far. Happiness ${s.happiness}, energy ${s.energy}.`;
}

function offlineCoach(s, situation) {
  if (situation === 'nudge') {
    const next = s.mode === 'desk' ? 'Stand up and step away for a short break.' : 'Take a short walk to warm up.';
    return `${s.name} is shivering after ${s.stillStreakMinutes} pet minutes without a break. ${next}`;
  }
  if (situation === 'moved') return `Nice! You got up after the nudge. That's ${s.nudgesAnswered} of ${s.nudges} nudges answered. ${s.name} is warming up.`;
  return s.minutes.walk > s.minutes.still
    ? `Great pace today: ${s.minutes.walk} minutes walking. Keep it up and ${s.name} may become a Sprinter.`
    : `${s.name} has been still for ${s.minutes.still} minutes today. Try a short walk between classes.`;
}
