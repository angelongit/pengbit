# Pengbit

**A pixel penguin that only thrives when you move.** Pengbit is a playful companion for students who spend long stretches sitting. It turns movement and posture into pet growth, gentle break reminders, and a measurable wellness signal.

Built for **tidalByte 26 at Texas A&M — November 21, 2026**.

## The problem

Students can lose track of how long they have been sitting while studying. Step counters alone do not address desk posture or make a study break feel rewarding. Pengbit gives that behavior a visible companion: it reacts to activity, shivers after a long sitting streak, and celebrates when a nudge is followed by movement.

## Try Pengbit in 30 seconds

1. Open the deployed app on a phone over HTTPS.
2. Tap **Wake Pengbit** and grant motion permission.
3. Use **Setup → Simulate** on a desktop, or walk with the phone to see the activity change.
4. Open **Professor** and ask for a field note or coaching tip.

Add the app to your phone's home screen to use it like a pocket pet. A QR demo page is available at app/demo.html when deployed.

## How it works

```text
Phone accelerometer ──> 2 s feature windows ──> activity classifier ─┐
                                                                    ├─> Pet state
Laptop webcam ──> local pose landmarks ──> posture classifier ──────┘
                                                                      |
                                      sitting streak ──> gentle nudge |
                                      walk / upright / slouch ──> pet form
                                                                      |
                                      pet summary ──> Professor Liveoak
                                                       ├─> Claude text
                                                       └─> ElevenLabs voice
```

### Pet forms

- **Sprinter**: shaped by walking and taking breaks.
- **Frost**: shaped by long stretches of sitting still or upright desk work.
- **Glitch**: shaped by shaking events on the phone or slouching in Desk mode.

Pengbit's key impact metric is **nudges answered**: a sitting nudge followed by a walk or verified exercise break.

## Machine learning and computer vision

- Phone mode extracts motion features from accelerometer windows and classifies walk, still, or shake with a small neural network trained in the browser. Threshold rules provide a fallback.
- Desk mode uses MediaPipe Pose Landmarker to estimate upright, slouch, or away from normalized body landmarks. Video frames are processed locally and are not uploaded.
- Final measured model accuracy: **[FILL IN]**. Nudges answered: **[FILL IN]**. Replace these placeholders with measured demo results.

## Professor Liveoak and AI

Professor Liveoak is a warm, slightly dramatic penguin researcher. Claude generates the Pengbit Index entries and short coaching messages from the pet's summary. ElevenLabs provides speech and optional live conversational voice. The serverless API routes keep provider API keys on the server.

## Privacy

- Phone motion data is processed in the browser on the phone.
- Desk-mode camera frames are processed locally; video never leaves the laptop.
- Pet stats are sent to the AI service when a user requests Professor Liveoak content.
- Live voice chat sends microphone audio to ElevenLabs while the conversation is active.
- No API keys belong in client code or Git.

## Team

- **Angel**: application integration, firmware, and machine learning.
- **Daniel**: pixel art, Professor Liveoak prompts and voice, and the floating companion window.

## Tech stack

HTML, CSS, JavaScript ES modules, Progressive Web App APIs, browser sensors, MediaPipe Tasks Vision, browser-trained MLP, Vercel serverless functions, Claude, and ElevenLabs.

## Repository layout

- app/: deployed web application.
- app/js/: pet, motion, pose, and feature modules.
- app/api/: serverless AI endpoints.
- app/sprites/: pixel-art forms and Professor Liveoak portrait.
- firmware/: original handheld firmware and hardware tests.
- shell/: enclosure CAD and print files.
- docs/: wiring, project notes, and pitch materials.

## Deploy notes

The Vercel project can use the repository root with the included vercel.json rewrites, or use app as the project root as described in app/README.md. Keep the selected Vercel root directory consistent with the API route layout.

Server environment variables (never commit values):

| Variable | Purpose |
|---|---|
| ANTHROPIC_API_KEY | Professor Liveoak text generation |
| PENGBIT_MODEL | Optional Claude model override |
| ELEVENLABS_API_KEY | ElevenLabs TTS and signed voice-session requests |
| ELEVENLABS_VOICE_ID | Optional TTS voice selection |
| ELEVENLABS_AGENT_ID | Private Conversational AI agent used by Talk |

For W4 live voice chat, create an ElevenLabs Conversational AI agent using the setup and persona in docs/professor-floe-agent.md. Define these dynamic variables: name, formName, happiness, energy, walkMinutes, stillMinutes, shakeMinutes, stillStreakMinutes, nudges, nudgesAnswered, and mode. Set its ID as ELEVENLABS_AGENT_ID in Vercel. The server requests a signed URL; the browser never receives the API key.

For local static testing from app/, run npx serve . Motion and camera permissions require a secure context (HTTPS or localhost). Use a real phone over cellular for final testing; event Wi-Fi may interfere with the deployed Vercel HTTPS URL.
