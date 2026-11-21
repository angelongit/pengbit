# Pengbit phone app

The pet moved from the XIAO to the phone. It is an installable web app (PWA): open the link,
tap **Wake Pengbit**, and the phone's motion sensor feeds the pet. Add it to the home screen to use it like an app.

## What's in it

- **Pet** (`js/pet.js`): the firmware's rules ported to JS. Happiness and energy, egg hatches after 5 pet
  minutes, evolves at 600 pet minutes into Sprinter (walk), Frost (still) or Glitch (shake) from the dominant
  activity. Sitting nudge: shivers after 45 pet minutes still, repeats every 30, and counts how many nudges were
  followed by a walk (the impact metric on the Health tab).
- **Buttons**: A feed, B play, C demo mode (x60 time), hold C to evolve now (judge shortcut).
- **Activity AI** (`js/activity.js`): 2 s windows of accelerometer data every second -> 12 features
  (deviation from 1 g, jerk, per-axis spread, step periodicity, ...) -> a small neural network (12 -> 16 -> 3)
  trained in the browser on your own recordings (Train AI tab), with held-out validation accuracy and a confusion
  matrix. Threshold rules are the fallback when there's no model.
- **Professor Floe** (`js/ai.js`, `api/`): dex entries and coaching from Claude, voice from ElevenLabs, both
  through serverless functions so no keys ship to the phone. Without keys it falls back to offline text and the
  browser's speech voice, so the demo never breaks.
- **No phone?** Setup -> Simulate, or keys W / S / K (walk / still / shake), D (demo), E (evolve).

## Deploy (Vercel, about 2 minutes)

1. vercel.com -> Add New -> Project -> import `angelongit/pengbit`.
2. Root Directory: `app`. Framework preset: Other. No build command.
3. Environment variables (optional, AI falls back without them):
   - `ANTHROPIC_API_KEY`: professor text (model `claude-opus-5-5`, override with `PENGBIT_MODEL`)
   - `ELEVENLABS_API_KEY`: professor voice (`ELEVENLABS_VOICE_ID` to pick a voice)
4. Deploy, open the URL on a phone. HTTPS is required for the motion sensor, and Vercel gives you that.

## Run locally

`npx serve .` (from `app/`) for the static app. Phones need HTTPS for motion, so test the sensor on the deployed URL.
`vercel dev` runs the AI endpoints locally with a `.env` file.

## For Daniel

- Sprites: drop PNGs in `sprites/` (see `sprites/README.md`).
- Prompts and the professor's personality: `api/_prompts.js`.
- Voice: `api/voice.js`.

## Adding a feature (the seam)

New features plug in without editing `main.js`:

1. Write `js/<feature>.js` exporting `init(ctx)`. Uncomment your line in `js/features.js`.
2. Fill your empty `<section id="tab-<name>">` from JS and call `ctx.showTab('<name>')`. Styles go in `css/<name>.css`.
3. Listen and talk on the bus (`ctx.bus.on/emit`, or import `js/bus.js`):
   `pet:hatched`, `pet:evolved`, `pet:hungry`, `pet:sad`, `pet:idle` (still minutes), `pet:move` ('walk' | 'exercise'),
   `pet:minute` {act, at}, `activity:window` {f, result} (every second), `model:changed` {source, valAcc}.
4. `ctx` (see `js/ctx.js`): `pet` (with `reward({happy, energy, reason, reps})`, `answerNudge(via)`), `detector`, `store`,
   `settings`, `getModel()`, `setModel(mlp, source)`, `getDataset()`, `addData(rows)`, `toast`, `bubble`, `say`, `chirp`,
   `vibrate`, `showTab`, `openTab`, `render`, `deviceId`.
5. Add new files to `SHELL` in `sw.js` and bump `CACHE`.
