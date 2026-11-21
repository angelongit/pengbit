// Shared Claude call for the professor endpoints. Key stays on the server (ANTHROPIC_API_KEY).
import Anthropic from '@anthropic-ai/sdk';
import { PROFESSOR } from './_prompts.js';

const MODEL = process.env.PENGBIT_MODEL || 'claude-opus-5-5';
const client = new Anthropic();

function textOf(msg) {
  if (msg.stop_reason === 'refusal') return '';
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
}

export async function ask(prompt) {
  const base = {
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: 'low' },
    system: PROFESSOR,
    messages: [{ role: 'user', content: prompt }],
  };
  try {
    // Server-side fallback: if a safety classifier declines, the API retries on a fallback model.
    return textOf(await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw e;
    return textOf(await client.messages.create(base));
  }
}

// Keep only small, plain values from the client so a crafted request can't stuff the prompt.
export function cleanPet(p = {}) {
  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(1e6, Math.round(+v))) : 0);
  const str = (v, n = 24) => String(v ?? '').replace(/[^\w .'-]/g, '').slice(0, n);
  const m = p.minutes || {};
  return {
    name: str(p.name) || 'Pengbit', form: str(p.form, 10), formName: str(p.formName, 30),
    ageMinutes: num(p.ageMinutes), happiness: num(p.happiness), energy: num(p.energy),
    minutes: { walk: num(m.walk), still: num(m.still), shake: num(m.shake) },
    stillStreakMinutes: num(p.stillStreakMinutes), nudges: num(p.nudges), nudgesAnswered: num(p.nudgesAnswered),
    mode: p.mode === 'desk' ? 'desk' : 'phone',
  };
}

export async function handle(req, res, build) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const text = await ask(build(body));
    if (!text) return res.status(502).json({ error: 'no text' });
    res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'llm failed' });
  }
}
