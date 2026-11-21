# Pengbit — three-minute demo and submission summary

## 150-word submission summary

Pengbit turns the hours students spend sitting into a playful reason to move. It is a pocket-penguin companion that changes as its owner moves: walking nurtures Sprinter, focused upright desk time nurtures Frost, and repeated shaking or slouching shapes Glitch. On a phone, an on-device activity model classifies motion from accelerometer windows, with threshold rules as a fallback. In Desk mode, a laptop webcam estimates posture locally; video stays on the device. A sitting streak makes Pengbit shiver and issue a nudge. We measure impact as nudges followed by a walk, rather than treating screen time or steps alone as success. Professor Floe uses an LLM for personalized field notes and coaching, with optional ElevenLabs speech and live conversation. The project combines embedded-inspired pet mechanics, browser-based machine learning, computer vision, and privacy-conscious interaction to make healthier study breaks engaging. Final measured model accuracy: [FILL IN]. Nudges answered: [FILL IN].

## Three-minute demo script

### 0:00–0:25 — The problem
"Students can spend hours studying without noticing how long they have been sitting. Pengbit makes that invisible habit visible through a tiny companion that reacts to movement and posture."

### 0:25–0:55 — Meet Pengbit
"Open the app and wake the egg. The pet has happiness and energy, and it changes form based on the activity it sees. Walking, sitting still, and shaking lead to different outcomes."

### 0:55–1:25 — Show the phone intelligence
"On the phone, accelerometer data is split into short windows. A small neural network classifies activity on-device, with threshold rules as a fallback. The training screen shows the data and confusion matrix."

### 1:25–1:55 — Show Desk mode
"On a laptop, Desk mode uses the webcam to estimate upright, slouch, or away. The video is processed locally and is not uploaded. Pengbit uses the posture label to react: a break counts as movement, upright posture is the still state, and slouching triggers Glitch."

### 1:55–2:20 — The nudge and impact metric
"After a long sitting streak, Pengbit shivers and nudges its owner to take a short break. We track how many nudges are followed by movement. Final measured values: [ACCURACY] model accuracy and [NUDGES ANSWERED] nudges answered."

### 2:20–2:45 — Professor Floe
"Professor Floe is the penguin researcher. It reads the pet's real stats and gives short, encouraging suggestions. Optional live voice chat lets the owner ask questions hands-free."

### 2:45–3:00 — Close
"Pengbit combines an engaging pet, on-device machine learning, local computer vision, and conversational AI to make study breaks easier to notice and act on."

## Team

- Angel: application integration, firmware, and machine learning.
- Daniel: pixel art, Professor Floe's prompts and voice, and the floating companion window.

## Technology

- Progressive web app: HTML, CSS, JavaScript ES modules.
- On-device motion classification and browser-trained MLP.
- MediaPipe Pose Landmarker for local webcam posture estimation.
- Vercel serverless functions for private AI API calls.
- Claude for Professor Floe's written coaching; ElevenLabs for speech and conversational voice.

## Privacy notes

- Phone motion classification runs in the browser on the device.
- Desk-mode webcam frames are processed locally; video is not uploaded.
- AI requests share pet summary fields when the user asks for a generated entry or coaching response.
- ElevenLabs live voice conversations send microphone audio to the service while a session is active.
