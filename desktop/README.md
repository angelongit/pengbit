# Pengbit on your desktop

A Clippy-style desktop companion. Pengbit leaves the browser and walks around on top of every other
window: along the bottom of the screen (on the taskbar/dock edge), hopping, dashing (Sprinter), belly-sliding
(Frost), teleporting (Glitch), napping when tired, and walking over to your cursor to nag you.

- **Slouching** (Desk mode posture): it glitches, runs to your cursor and tells you to sit up.
- **Sitting too long**: it shivers in a little snowfall and asks you to go for a walk.
- **Professor Liveoak** lines (dex entries, coaching) pop up in speech bubbles over your work, plus random health tips.
- **Pick it up and throw it.** Clicking it counts as playing (button B).
- **Tombstones** of past Pengbits stand along the bottom of the screen, behind the new one.
- It is click-through everywhere except the penguin, so you can keep working.

## Run it

You need Node 18+ (same as the local server).

```bash
# terminal 1, repo root: the Pengbit app + API on http://localhost:3000
npm install
npm run local

# terminal 2
cd desktop
npm install      # first time only, downloads Electron (~100 MB)
npm start
```

Two things open: the normal Pengbit app window (wake it, hatch it, use Desk mode there) and an invisible
full-screen layer where Pengbit roams. Minimize the app window if you like; the pet keeps running.

- **ROAM / CATCH** button (top left of the pet screen) or the tray icon turns roaming on and off.
- Use the deployed site instead of the local server: `npm run vercel`, or `npm start -- --url=https://pengbit.vercel.app`
  (or set `PENGBIT_URL`). The event Wi-Fi breaks TLS to vercel.app, so the local server is the default.
- Closing the app window quits everything.

## No desktop app? (fallback)

In any browser, the **ROAM** button on the pet screen lets Pengbit loose over the web page itself, with the same
behaviour. `roam.html` opened in a second tab of the same browser is a preview of the desktop layer.

## How it works

- `main.cjs` opens the app window and a transparent, frameless, always-on-top, non-focusable window covering the
  primary screen's work area that loads `/roam.html`. It sends the cursor position to that page 30 times a second; when
  the cursor is over the penguin the page turns click-through off (`setIgnoreMouseEvents`) so you can grab it.
- Both windows load the same origin, so `app/js/roam.js` streams the pet's state (form, mood, posture, shivering, name,
  graveyard) and the professor's lines over `BroadcastChannel('pengbit-roam')`. The engine is `app/js/roamer.js`.
- `preload.cjs` exposes `window.pengbitDesktop` (toggleRoam, setInteractive, onCursor) to those pages.
