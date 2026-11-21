// Private ElevenLabs Conversational AI session bootstrap.
// Never return the workspace API key to the browser.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !apiKey) return res.status(503).json({ error: 'Voice agent is not configured' });

  try {
    const upstream = await fetch(
      'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=' + encodeURIComponent(agentId),
      { method: 'GET', headers: { 'xi-api-key': apiKey, accept: 'application/json' } }
    );
    if (!upstream.ok) {
      console.error('[talk-token] ElevenLabs returned', upstream.status);
      return res.status(502).json({ error: 'Could not create a voice session' });
    }
    const body = await upstream.json();
    if (typeof body.signed_url !== 'string' || !body.signed_url.startsWith('wss://')) {
      return res.status(502).json({ error: 'Unexpected voice session response' });
    }
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ signedUrl: body.signed_url });
  } catch (error) {
    console.error('[talk-token] request failed', error?.message || error);
    return res.status(502).json({ error: 'Could not create a voice session' });
  }
}
