# Pebblebit on your desktop

A Clippy-style desktop companion. Pebblebit starts docked in the bottom-right corner. The compact
assistant shows the current pet, Desk posture, break reminders, and Professor Liveoak's text.
Use the tray menu to switch to Roam, hide the assistant, or bring it back.

In Roam mode, Pebblebit walks around on top of every other
window: along the bottom of the screen (on the taskbar/dock edge), hopping, dashing (Sprinter), belly-sliding
(Frost), teleporting (Glitch), napping when tired, and walking over to your cursor to nag you.

- **Slouching** (Desk mode posture): it glitches, runs to your cursor and tells you to sit up.
- **Sitting too long**: it shivers in a little snowfall and asks you to go for a walk.
- **Professor Liveoak** lines (dex entries, coaching) pop up in speech bubbles over your work, plus random health tips.
- **Pick it up and throw it.** Clicking it counts as playing (button B).
- **Tombstones** of past Pebblebits stand along the bottom of the screen, behind the new one.
- It is click-through everywhere except the penguin, so you can keep working.

## Run it

Double-click the Windows portable executable to open Pebblebit. It starts its own loopback
server and brings up the main window and dock. To enable live voice and generated entries,
place your own `.env.local` beside the executable. The executable contains no API keys.
The portable app uses its own local app address and profile. Saved pets and models from another
browser or from the development server remain in their original profile.

For development, you need Node 18+.

```bash
# repo root: install the API dependencies
npm install

cd desktop
npm install      # first time only, downloads Electron (~100 MB)
npm start
```

Two things open: the normal Pebblebit app window (wake it, hatch it, use Desk mode there) and the
bottom-right assistant. Minimize the app window if you like; the pet keeps running.

- **ROAM / CATCH** switches between the docked assistant and roaming. The tray also offers **Hide assistant**.
- Use the deployed site instead of the local server: `npm run vercel`, or `npm start -- --url=https://pengbit.vercel.app`
  (or set `PENGBIT_URL`). To use a manually started local server, pass its URL the same way.
- Closing the app window quits everything.

To build the portable executable on Windows, run this from the repo root after installing dependencies:

```powershell
npm exec --yes --package=electron-builder@26.18.0 -- electron-builder --win portable --x64 --config desktop/electron-builder.yml
```

The build goes in `dist-desktop/`.

## No desktop app? (fallback)

In any browser, the **ROAM** button on the pet screen lets Pebblebit loose over the web page itself, with the same
behaviour. `roam.html` opened in a second tab of the same browser is a preview of the desktop layer.

## How it works

- `main.cjs` opens the app and positions the docked `/dock.html` window within the display's work area.
  Roam uses a transparent, non-focusable window that loads `/roam.html`. It sends the cursor position to that page 30 times a second; when
  the cursor is over the penguin the page turns click-through off (`setIgnoreMouseEvents`) so you can grab it.
- Both windows load the same origin, so `app/js/roam.js` streams the pet's state (form, mood, posture, shivering, name,
  graveyard) and the professor's lines over `BroadcastChannel('pengbit-roam')`. The engine is `app/js/roamer.js`.
- `preload.cjs` exposes `window.pengbitDesktop` (toggleRoam, setInteractive, onCursor) to those pages.
