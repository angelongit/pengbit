// Pebblebit desktop companion (Electron).
//
// Two windows:
//   app      the normal Pebblebit web app (pet engine, Desk-mode webcam posture, Professor Liveoak).
//   overlay  either a compact, always-on-top corner assistant or the click-through roaming layer.
// Both load the same origin, so the app streams the pet's state to the overlay over BroadcastChannel.
//
// Run:  npm install  then  npm start                     (uses http://localhost:3000, start `npm run local` in the repo root first)
//       npm start -- --url=https://pengbit.vercel.app    (or set PENGBIT_URL)
const { app, BrowserWindow, ipcMain, screen, session, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');

const argUrl = process.argv.find((a) => a.startsWith('--url='));
const APP_URL = (argUrl ? argUrl.slice(6) : process.env.PENGBIT_URL || 'http://localhost:3000').replace(/\/+$/, '');
const APP_ORIGIN = new URL(APP_URL).origin;
const DOCK = { width: 292, height: 218, inset: 12 };

if (process.platform === 'linux') {             // transparent windows on Linux
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, overlay = null, tray = null, cursorTimer = null, mode = 'dock';
let lastMode = 'dock';

function appOrigin(url) {
  try { return new URL(url).origin === APP_ORIGIN; }
  catch { return false; }
}

function fromWindow(event, window) {
  return window && event.sender === window.webContents
    && event.senderFrame === event.sender.mainFrame && appOrigin(event.senderFrame.url);
}

function showApp() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

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
    retry = setTimeout(() => { win?.loadURL(APP_URL); }, 3000);
  });
  win.webContents.on('did-finish-load', () => {
    if (appOrigin(win.webContents.getURL()) && mode !== 'hidden' && !overlay) createOverlay();
  });
  win.loadURL(APP_URL);
  win.on('closed', () => { clearTimeout(retry); win = null; app.quit(); });
}

function companionBounds() {
  const { workArea } = win && !win.isMinimized()
    ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  if (mode === 'roam') return workArea;
  const width = Math.min(DOCK.width, workArea.width);
  const height = Math.min(DOCK.height, workArea.height);
  return {
    width, height,
    x: Math.max(workArea.x, workArea.x + workArea.width - width - DOCK.inset),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - DOCK.inset)
  };
}

function createOverlay() {
  const roam = mode === 'roam';
  const companion = overlay = new BrowserWindow({
    ...companionBounds(), title: roam ? 'Pebblebit Roam' : 'Pebblebit Assistant',
    frame: false, transparent: roam, backgroundColor: roam ? '#00000000' : '#c8c8cf', hasShadow: !roam,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, focusable: !roam, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false },
  });
  companion.setAlwaysOnTop(true, roam ? 'screen-saver' : 'floating');
  companion.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: roam });
  if (roam) {
    companion.setIgnoreMouseEvents(true, { forward: true });
    cursorTimer = setInterval(() => {
      if (!companion.isVisible()) return;
      const p = screen.getCursorScreenPoint(), b = companion.getBounds();
      companion.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
    }, 33);
  }
  companion.once('ready-to-show', () => { if (overlay === companion) companion.showInactive(); });
  companion.on('closed', () => {
    if (overlay === companion) {
      overlay = null;
      clearInterval(cursorTimer);
    }
  });
  companion.loadURL(APP_URL + (roam ? '/roam.html' : '/dock.html')).catch(error => {
    if (overlay !== companion) return;
    console.warn('Pebblebit assistant could not load:', error.message);
    companion.destroy();
  });
}

function fitOverlay() {
  if (overlay) overlay.setBounds(companionBounds());
}

function setMode(next) {
  if (next !== mode || !overlay) {
    clearInterval(cursorTimer);
    overlay?.destroy();
    mode = next;
    if (next !== 'hidden') {
      lastMode = next;
      if (win && appOrigin(win.webContents.getURL())) createOverlay();
    }
  }
  win?.webContents.send('roam:changed', mode === 'roam');
  updateTray();
  return mode === 'roam';
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Pebblebit app', click: showApp },
    { label: 'Docked assistant', type: 'radio', checked: mode === 'dock', click: () => setMode('dock') },
    { label: 'Roam the desktop', type: 'radio', checked: mode === 'roam', click: () => setMode('roam') },
    { label: mode === 'hidden' ? 'Show assistant' : 'Hide assistant', click: () => setMode(mode === 'hidden' ? lastMode : 'hidden') },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

ipcMain.handle('roam:toggle', event => fromWindow(event, win) && setMode(mode === 'roam' ? 'dock' : 'roam'));
ipcMain.handle('roam:is', event => !!fromWindow(event, win) && mode === 'roam');
ipcMain.handle('assistant:open', event => { if (mode === 'dock' && fromWindow(event, overlay)) showApp(); });
ipcMain.handle('assistant:hide', event => { if (mode === 'dock' && fromWindow(event, overlay)) setMode('hidden'); });
ipcMain.on('roam:interactive', (event, on) => {
  if (mode !== 'roam' || !fromWindow(event, overlay)) return;
  if (on) overlay.setIgnoreMouseEvents(false);
  else overlay.setIgnoreMouseEvents(true, { forward: true });
});

app.on('second-instance', showApp);

app.whenReady().then(() => {
  // Desk mode needs the webcam, the Talk agent needs the mic: allow them for our own pages.
  const allowed = ['media', 'notifications', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
    cb(wc === win?.webContents && appOrigin(details.requestingUrl || wc.getURL()) && allowed.includes(perm));
  });
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) =>
    wc === win?.webContents && appOrigin(origin) && allowed.includes(perm));

  createAppWindow();
  win.on('move', fitOverlay);
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
