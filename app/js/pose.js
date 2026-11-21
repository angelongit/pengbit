// Shared pose module (W2a). One camera and one MediaPipe Pose Landmarker for the whole app:
// camera exercise (W2) and Desk mode (W5) both use it, so nothing loads the model twice.
// Everything runs in the browser (WASM, GPU with CPU fallback). Video never leaves the device.
//
// API
//   acquire({ facing = 'user' }) -> Promise<handle>
//       Starts the camera and loads the model if they aren't running yet. Reference counted:
//       every caller gets its own handle and must release it. Call it from a user tap the first
//       time (iOS wants the gesture; the camera needs HTTPS or localhost).
//       handle = { video, facing, mirrored, info }   info = { delegate, model, lib, version }
//       Rejects with an Error whose err.stage is 'camera' (no camera, permission denied) or
//       'model' (library or model failed to load), so callers can fall back.
//       Asking for a different facing while running switches the shared camera for everyone.
//   release(handle)
//       Gives the handle back. The camera turns off when the last handle is released.
//   subscribe(fn) -> unsubscribe()
//       fn(frame) for every processed video frame (the camera's frame rate, usually 15 to 30 fps):
//       frame = { landmarks, worldLandmarks, t, present, width, height, mirrored, video }
//         landmarks: MediaPipe's 33 points { x, y, z, visibility }, x/y normalized 0..1 in the
//           raw camera frame (not mirrored), y down; null when no person is found.
//         worldLandmarks: the same points in meters, hip centered (or null).
//         present: landmarks !== null.  t: performance.now() in ms.
//         mirrored: true for the front camera; draw with x -> 1 - x to look like a mirror.
//   loadPose() -> Promise<PoseLandmarker>   preload the model (about 6 MB) without a camera.
//   isRunning() -> boolean
//   LM: named landmark indices.  BONES: skeleton edges.  angle(a, b, c): degrees at b.
//   drawSkeleton(canvasOr2dContext, landmarks, { mirrored, color, video })
//       Y2K overlay: neon bones and square pixel joints. Pass video to draw the frame under it.
//
// Library, WASM and model are vendored in app/vendor/mediapipe/ (pinned version below) and
// served from our own origin, because event Wi-Fi may block or slow CDNs. jsDelivr is the
// fallback.

export const MP_VERSION = '0.10.21';
const LOCAL = new URL('../vendor/mediapipe/', import.meta.url).href;
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const SOURCES = [
  { lib: `${LOCAL}vision_bundle.js`, wasm: `${LOCAL}wasm`, name: 'local' },
  { lib: `${CDN}/vision_bundle.mjs`, wasm: `${CDN}/wasm`, name: 'cdn' },
];
const MODELS = [
  `${LOCAL}pose_landmarker_lite.task`,
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
];

export const LM = {
  NOSE: 0, LEFT_EYE: 2, RIGHT_EYE: 5, LEFT_EAR: 7, RIGHT_EAR: 8,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_ELBOW: 13, RIGHT_ELBOW: 14, LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24, LEFT_KNEE: 25, RIGHT_KNEE: 26, LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};
export const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [7, 0], [0, 8]];
const JOINTS = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

// Angle at b (degrees) between b->a and b->c. Points need x and y.
export function angle(a, b, c) {
  const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
  const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

// ---------------------------------------------------------------- model (loaded once)
let posePromise = null;
export function loadPose() {
  if (!posePromise) posePromise = createPose().catch((e) => { posePromise = null; throw e; });
  return posePromise;
}
async function createPose() {
  let lastErr;
  for (const src of SOURCES) {
    let vision;
    try { vision = await import(src.lib); } catch (e) { lastErr = e; continue; }
    let fileset;
    try { fileset = await vision.FilesetResolver.forVisionTasks(src.wasm); } catch (e) { lastErr = e; continue; }
    for (const model of MODELS) {
      for (const delegate of ['GPU', 'CPU']) {   // some phones and older iOS fail on GPU
        try {
          const pose = await vision.PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: model, delegate },
            runningMode: 'VIDEO', numPoses: 1,
            minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
          });
          pose.info = { delegate, lib: src.name, model: model.startsWith(LOCAL) ? 'local' : 'cdn', version: MP_VERSION };
          return pose;
        } catch (e) { lastErr = e; }
      }
    }
  }
  throw lastErr || new Error('pose model unavailable');
}

// ---------------------------------------------------------------- shared camera + detection loop
const subs = new Set();
let cam = null;   // { facing, stream, video, handles:Set, raf, lastT, pose, starting }

export function isRunning() { return !!cam; }

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

const stageError = (stage, msg, cause) => Object.assign(new Error(msg), { stage, cause });

async function openStream(facing) {
  if (!navigator.mediaDevices?.getUserMedia) throw stageError('camera', 'The camera needs HTTPS.');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
    });
  } catch (e) {
    throw stageError('camera', e.name === 'NotAllowedError' ? 'Camera permission was denied.' : `No camera (${e.message || e.name}).`, e);
  }
}

export async function acquire({ facing = 'user' } = {}) {
  if (!cam) {
    const c = cam = { facing, handles: new Set(), raf: 0, lastT: -1 };
    c.starting = (async () => {
      // Camera first, while we're still inside the user's tap.
      c.stream = await openStream(facing);
      const v = c.video = document.createElement('video');
      v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.muted = true; v.autoplay = true;
      // Rendered but invisible: iOS stops decoding display:none videos.
      v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.appendChild(v);
      v.srcObject = c.stream;
      try { await v.play(); } catch {}
      try {
        c.pose = await Promise.race([loadPose(), new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), 30000))]);
      } catch (e) {
        throw stageError('model', `The pose AI didn't load (${e.message || e}).`, e);
      }
      c.raf = requestAnimationFrame(() => loop(c));
    })();
    c.starting.catch(() => { if (cam === c) shutdown(); });
  }
  const c = cam;
  await c.starting;
  if (cam !== c) throw stageError('camera', 'The camera was stopped.');
  if (facing !== c.facing) await switchFacing(c, facing);
  const handle = { video: c.video, get facing() { return c.facing; }, get mirrored() { return c.facing === 'user'; }, info: c.pose.info };
  c.handles.add(handle);
  return handle;
}

async function switchFacing(c, facing) {
  const stream = await openStream(facing);
  if (cam !== c) { stream.getTracks().forEach((t) => t.stop()); return; }
  c.stream.getTracks().forEach((t) => t.stop());
  c.stream = stream; c.facing = facing; c.video.srcObject = stream;
  try { await c.video.play(); } catch {}
}

export function release(handle) {
  const c = cam;
  if (!c || !handle || !c.handles.delete(handle)) return;
  if (c.handles.size === 0) shutdown();
}

function shutdown() {
  const c = cam;
  if (!c) return;
  cam = null;
  cancelAnimationFrame(c.raf);
  if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
  if (c.video) { c.video.srcObject = null; c.video.remove(); }
}

function loop(c) {
  if (cam !== c) return;
  c.raf = requestAnimationFrame(() => loop(c));
  const v = c.video;
  if (v.readyState < 2 || !v.videoWidth || v.currentTime === c.lastT) return;   // new frames only
  c.lastT = v.currentTime;
  const t = performance.now();
  let res;
  try { res = c.pose.detectForVideo(v, t); } catch { return; }
  const landmarks = res?.landmarks?.[0] || null;
  const frame = {
    landmarks, worldLandmarks: res?.worldLandmarks?.[0] || null, t, present: !!landmarks,
    width: v.videoWidth, height: v.videoHeight, mirrored: c.facing === 'user', video: v,
  };
  for (const fn of subs) { try { fn(frame); } catch (e) { console.error('pose subscriber', e); } }
}

// ---------------------------------------------------------------- drawing
// target: a <canvas> or its 2D context. Uses the canvas's own size.
export function drawSkeleton(target, lm, { mirrored = false, color = '#9ff3ff', video = null } = {}) {
  const g = target.getContext ? target.getContext('2d') : target;
  const w = g.canvas.width, h = g.canvas.height;
  if (video) {
    g.save();
    if (mirrored) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(video, 0, 0, w, h);
    g.restore();
  }
  if (!lm) return;
  const X = (p) => (mirrored ? 1 - p.x : p.x) * w, Y = (p) => p.y * h;
  const vis = (p) => (p.visibility ?? 1) >= 0.4;
  g.save();
  g.lineWidth = Math.max(3, w / 110); g.lineCap = 'round';
  g.strokeStyle = color; g.shadowColor = '#ff47e0'; g.shadowBlur = 10;
  for (const [a, b] of BONES) {
    if (!vis(lm[a]) || !vis(lm[b])) continue;
    g.beginPath(); g.moveTo(X(lm[a]), Y(lm[a])); g.lineTo(X(lm[b]), Y(lm[b])); g.stroke();
  }
  g.shadowBlur = 0; g.fillStyle = '#ffd84a';
  const r = Math.max(4, w / 120);
  for (const i of JOINTS) if (vis(lm[i])) g.fillRect(X(lm[i]) - r, Y(lm[i]) - r, r * 2, r * 2);   // square pixel joints
  g.restore();
}
