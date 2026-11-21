// Professor Floe's voice (Daniel, W6): ElevenLabs text-to-speech. Key stays on the server (ELEVENLABS_API_KEY).
// Pick the voice with ELEVENLABS_VOICE_ID in Vercel; the default is a warm storyteller voice.
const VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ELEVENLABS_API_KEY not set' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const text = String(body.text || '').slice(0, 600);
  if (!text) return res.status(400).json({ error: 'no text' });
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text, model_id: MODEL,
      // Professor Floe: warm and a little theatrical. Lower stability = more expressive delivery.
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!r.ok) { console.error('elevenlabs', r.status, await r.text()); return res.status(502).json({ error: 'tts failed' }); }
  res.setHeader('content-type', 'audio/mpeg');
  res.setHeader('cache-control', 'no-store');
  res.status(200).send(Buffer.from(await r.arrayBuffer()));
}
