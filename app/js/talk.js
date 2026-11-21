// W4: push-to-talk conversation with Professor Floe.
// The browser receives only a short-lived signed URL; ELEVENLABS_API_KEY stays server-side.
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.37.1/+esm';
const TOKEN_URL = '/api/talk-token';
const TOKEN_MAX_AGE = 10 * 60 * 1000;

export async function init(ctx) {
  const tab = document.getElementById('tab-talk');
  const nav = document.querySelector('.tabs [data-tab="talk"]');
  if (!tab || !nav) return;

  tab.innerHTML = `
    <div class="talk-head">
      <div class="talk-orb" aria-hidden="true">❄</div>
      <div><p class="talk-kicker">FIELD RADIO // 01</p><h2>Talk to Professor Floe</h2>
      <p class="muted">Hold the button while you speak. Release to let Floe answer.</p></div>
    </div>
    <div class="talk-status" role="status" aria-live="polite">Checking voice link…</div>
    <button class="talk-ptt" type="button" disabled>
      <span class="talk-mic" aria-hidden="true">◉</span><strong>HOLD TO TALK</strong>
      <small>Microphone starts only when you press</small>
    </button>
    <div class="talk-transcript" aria-live="polite"><p class="talk-empty">Your conversation will appear here.</p></div>
    <button class="talk-end btn-ghost" type="button" hidden>End conversation</button>
    <p class="talk-foot">Audio is sent to ElevenLabs during the live conversation. Your pet’s current stats are shared so Floe can answer with context.</p>`;

  const status = tab.querySelector('.talk-status');
  const ptt = tab.querySelector('.talk-ptt');
  const transcript = tab.querySelector('.talk-transcript');
  const end = tab.querySelector('.talk-end');
  let sdkPromise, conversation = null, signedUrl = '', signedAt = 0;
  let held = false, starting = false, failed = false;

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }
  function hideFeature() {
    failed = true;
    nav.classList.add('hidden');
    tab.classList.add('hidden');
    if (document.querySelector('.tabs [data-tab="talk"].on')) ctx.openTab?.('dex');
  }
  function addLine(who, message) {
    const clean = String(message || '').trim();
    if (!clean) return;
    const empty = transcript.querySelector('.talk-empty');
    if (empty) empty.remove();
    const line = document.createElement('p');
    line.className = 'talk-line ' + who;
    const label = document.createElement('b');
    label.textContent = who === 'floe' ? 'PROF. FLOE' : 'YOU';
    const body = document.createElement('span');
    body.textContent = clean;
    line.append(label, body);
    transcript.appendChild(line);
    transcript.scrollTop = transcript.scrollHeight;
  }
  function getSdk() {
    if (!sdkPromise) sdkPromise = import(SDK_URL);
    return sdkPromise;
  }
  async function refreshSignedUrl() {
    const r = await fetch(TOKEN_URL, { headers: { accept: 'application/json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('voice route unavailable');
    const data = await r.json();
    if (typeof data.signedUrl !== 'string' || !data.signedUrl.startsWith('wss://')) throw new Error('invalid signed URL');
    signedUrl = data.signedUrl;
    signedAt = Date.now();
  }
  function dynamicVariables() {
    const p = ctx.pet.summary();
    const mins = p.minutes || {};
    return {
      name: String(p.name || 'Pengbit'),
      formName: String(p.formName || p.form || 'Pengbit'),
      happiness: Number(p.happiness ?? 0),
      energy: Number(p.energy ?? 0),
      'minutes.walk': Number(mins.walk ?? 0),
      'minutes.still': Number(mins.still ?? 0),
      'minutes.shake': Number(mins.shake ?? 0),
      stillStreakMinutes: Number(p.stillStreakMinutes ?? 0),
      nudges: Number(p.nudges ?? 0),
      nudgesAnswered: Number(p.nudgesAnswered ?? 0),
      mode: String(p.mode || 'phone'),
    };
  }
  function onMessage(message) {
    if (!message) return;
    const text = typeof message === 'string' ? message : message.message || message.text || '';
    if (!text) return;
    const source = String(message.source || message.role || message.type || '').toLowerCase();
    addLine(source === 'user' || source === 'user_transcript' ? 'you' : 'floe', text);
  }
  async function start() {
    if (conversation) {
      conversation.setMicMuted(false);
      setStatus('Listening. Release to let Professor Floe respond.', 'live');
      return;
    }
    if (starting || failed) return;
    starting = true;
    ptt.disabled = true;
    setStatus('Connecting…');
    try {
      // This runs only from the user's press, so the browser never asks for a mic at page load.
      if (!signedUrl || Date.now() - signedAt > TOKEN_MAX_AGE) await refreshSignedUrl();
      const { Conversation } = await getSdk();
      conversation = await Conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
        dynamicVariables: dynamicVariables(),
        onConnect: () => setStatus('Connected. Hold to speak; release to listen.', 'live'),
        onDisconnect: () => {
          conversation = null;
          end.hidden = true;
          ptt.classList.remove('is-live');
          setStatus('Disconnected. Press and hold to start again.');
          ptt.disabled = false;
        },
        onMessage,
        onError: (error) => setStatus(error?.message || 'Voice connection error.', 'error'),
      });
      end.hidden = false;
      ptt.disabled = false;
      if (!held) conversation.setMicMuted(true);
      else { conversation.setMicMuted(false); setStatus('Listening. Release to let Professor Floe respond.', 'live'); }
    } catch (error) {
      console.warn('[talk] session failed', error);
      conversation = null;
      setStatus('Voice chat could not start. Check microphone permission and try again.', 'error');
      ptt.disabled = false;
      // A route failure or unavailable agent means the feature should not advertise a broken tab.
      const reason = String(error?.message || error?.name || '');
      if (/voice route|invalid signed url|permission|microphone|notallowed|denied/i.test(reason)) hideFeature();
    } finally {
      starting = false;
    }
  }
  async function stop() {
    held = false;
    ptt.classList.remove('is-live');
    if (!conversation) return;
    conversation.setMicMuted(true);
    setStatus('Floe is listening. Hold again when you are ready to speak.', 'live');
  }
  ptt.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (ptt.disabled || failed) return;
    held = true;
    ptt.setPointerCapture?.(event.pointerId);
    ptt.classList.add('is-live');
    start();
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) ptt.addEventListener(eventName, stop);
  end.addEventListener('click', async () => {
    held = false;
    if (conversation) { try { await conversation.endSession(); } catch {} }
    conversation = null;
    end.hidden = true;
    ptt.classList.remove('is-live');
    setStatus('Conversation ended. Hold to talk again.');
    ptt.disabled = false;
  });

  // Probe configuration before exposing the tab. Cache the signed URL only briefly.
  try {
    await refreshSignedUrl();
    ptt.disabled = false;
    setStatus('Voice link ready. Hold the button to talk.');
    ctx.showTab('talk');
  } catch (error) {
    console.info('[talk] not enabled:', error?.message || error);
    hideFeature();
  }
}
