// Professor Liveoak's voice (Daniel, W6): ElevenLabs text-to-speech. Key stays on the server (ELEVENLABS_API_KEY).
// Voice: ELEVENLABS_VOICE_ID if set; otherwise the same voice as the Professor Liveoak agent
// (read once from ELEVENLABS_AGENT_ID), so narration and Talk sound like one professor.
const FALLBACK_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
let agentVoice = null;   // cached per server instance
async function voiceId() {
  if (process.env.ELEVENLABS_VOICE_ID) return process.env.ELEVENLABS_VOICE_ID;
  if (agentVoice) return agentVoice;
  const agent = process.env.ELEVENLABS_AGENT_ID;
  if (agent) {
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/convai/agents/' + encodeURIComponent(agent),
        { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, accept: 'application/json' } });
      if (r.ok) {
        const a = await r.json();
        const id = a?.conversation_config?.tts?.voice_id;
        if (typeof id === 'string' && id) return (agentVoice = id);
      } else console.error('[voice] agent lookup', r.status);
    } catch (e) { console.error('[voice] agent lookup failed', e?.message || e); }
  }
  return FALLBACK_VOICE;
}
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ELEVENLABS_API_KEY not set' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const text = String(body.text || '').slice(0, 600);
  if (!text) return res.status(400).json({ error: 'no text' });
  const VOICE = await voiceId();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text, model_id: MODEL,
      // Professor Liveoak: warm and a little theatrical. Lower stability = more expressive delivery.
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!r.ok) { const detail = (await r.text()).slice(0, 300); console.error('[voice] elevenlabs', r.status, detail); return res.status(502).json({ error: 'tts failed', upstream: r.status, detail }); }
  res.setHeader('content-type', 'audio/mpeg');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-pengbit-voice', VOICE === FALLBACK_VOICE ? 'default' : 'liveoak');
  res.status(200).send(Buffer.from(await r.arrayBuffer()));
}
