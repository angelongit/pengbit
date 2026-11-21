// Pebblebit desktop companion (Electron).
//
// Two windows:
//   app      the normal Pebblebit web app (pet engine, Desk-mode webcam posture, Professor Liveoak).
//   overlay  a transparent, frameless, always-on-top window over the whole screen that loads
//            /roam.html. Pebblebit walks along the bottom of the screen (on top of the taskbar/dock),
//            hops, chases your cursor and nags you, over every other app. It is click-through
//            everywhere except the penguin itself, so you can still use your computer.
// Both load the same origin, so the app streams the pet's state to the overlay over BroadcastChannel.
//
// Run:  npm install  then  npm start                     (uses http://localhost:3000, start `npm run local` in the repo root first)
//       npm start -- --url=https://pengbit.vercel.app    (or set PENGBIT_URL)
const { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

const argUrl = process.argv.find((a) => a.startsWith('--url='));
const APP_URL = (argUrl ? argUrl.slice(6) : process.env.PENGBIT_URL || 'http://localhost:3000').replace(/\/+$/, '');

if (process.platform === 'linux') {             // transparent windows on Linux
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, overlay = null, tray = null, cursorTimer = null, roaming = true;

function failPage(url, err) {
  const html = `<body style="font:15px system-ui;background:#0d2a36;color:#e8f4ff;padding:30px">
    <h2>Pebblebit can't reach ${url}</h2><p>${err}</p>
    <p>Start the local server first, in the repo root: <code>npm run local</code><br>
    Or run with another URL: <code>npm start -- --url=https://pengbit.vercel.app</code></p>
    <p>Retrying every 3 seconds...</p></body>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createAppWindow() {
  win = new BrowserWindow({
    width: 1100, height: 820, title: 'Pebblebit', icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  let retry = null;
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;                  // -3 = aborted (normal navigation)
    win.loadURL(failPage(APP_URL, desc));
    clearTimeout(retry);
    retry = setTimeout(() => { win.loadURL(APP_URL); overlay?.loadURL(APP_URL + '/roam.html'); }, 3000);
  });
  win.loadURL(APP_URL);
  win.on('closed', () => { win = null; app.quit(); });
}

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    ...workArea, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadURL(APP_URL + '/roam.html');
  overlay.once('ready-to-show', () => { if (roaming) overlay.showInactive(); });
  overlay.on('closed', () => { overlay = null; });

  // Feed the cursor position to the page so Pebblebit can chase it and so the page knows when the
  // pointer is over the penguin (it then turns click-through off for that moment).
  clearInterval(cursorTimer);
  cursorTimer = setInterval(() => {
    if (!overlay || !overlay.isVisible()) return;
    const p = screen.getCursorScreenPoint(), b = overlay.getBounds();
    overlay.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 33);
}

function fitOverlay() {
  if (overlay) overlay.setBounds(screen.getPrimaryDisplay().workArea);
}

function setRoaming(on) {
  roaming = on;
  if (!overlay) createOverlay();
  if (on) overlay.showInactive(); else overlay.hide();
  win?.webContents.send('roam:changed', on);
  updateTray();
  return on;
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Pebblebit app', click: () => { win?.show(); win?.focus(); } },
    { label: roaming ? 'Catch Pebblebit (stop roaming)' : 'Let Pebblebit roam', click: () => setRoaming(!roaming) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

ipcMain.handle('roam:toggle', () => setRoaming(!roaming));
ipcMain.handle('roam:is', () => roaming);
ipcMain.on('roam:interactive', (_e, on) => {
  if (!overlay) return;
  if (on) overlay.setIgnoreMouseEvents(false);
  else overlay.setIgnoreMouseEvents(true, { forward: true });
});

app.on('second-instance', () => { win?.show(); win?.focus(); });

app.whenReady().then(() => {
  // Desk mode needs the webcam, the Talk agent needs the mic: allow them for our own pages.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'notifications', 'clipboard-sanitized-write'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler(() => true);

  createAppWindow();
  createOverlay();
  screen.on('display-metrics-changed', fitOverlay);
  screen.on('display-added', fitOverlay);
  screen.on('display-removed', fitOverlay);

  try {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 18, height: 18 }));
    tray.setToolTip('Pebblebit');
    updateTray();
  } catch (e) { console.warn('tray unavailable', e.message); }
  console.log(`Pebblebit desktop: ${APP_URL}`);
});

app.on('window-all-closed', () => app.quit());
