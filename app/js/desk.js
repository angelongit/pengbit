// app/js/desk.js
// W5: Desk mode UI, calibration, live posture loop, recorder & MLP training

import { emit } from './bus.js';
import { acquire, release, subscribe, drawSkeleton } from './pose.js';
import { MODE_LABELS } from './pet.js';
import {
  PostureDetector,
  extractFrameMetrics,
  computeBaseline,
  trainPostureModel,
  loadPostureModel,
  isPostureSample,
  POSTURE_WINDOW_MS,
  DESK_TO_SLOT,
  SLOT_TO_DESK,
  SLOTS
} from './posture.js';

const STORE_BASELINE = 'deskBaseline';
const STORE_DATASET = 'deskDataset';
const STORE_MODEL = 'deskModel';
const STORE_USE_ML = 'deskUseML';

export function init(ctx) {
  const section = document.getElementById('tab-desk');
  const navBtn = document.querySelector('[data-tab="desk"]');
  if (!section) return;
 if (ctx.showTab) ctx.showTab('desk');
  else if (navBtn) navBtn.hidden = false;

  const labels = (MODE_LABELS && MODE_LABELS.desk) || SLOT_TO_DESK;

  // Load persisted state
  let baseline = ctx.store.get(STORE_BASELINE, null);
  let dataset = ctx.store.get(STORE_DATASET, []).filter(isPostureSample);
  let mlp = loadPostureModel(ctx.store.get(STORE_MODEL, null));

  const detector = new PostureDetector({
    baseline,
    model: mlp,
    useML: !!mlp && ctx.store.get(STORE_USE_ML, true)
  });

  // Load shipped posture-model.json if no local trained model exists
  if (!mlp) {
    fetch('./model/posture-model.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((weights) => {
        const shipped = loadPostureModel(weights);
        if (!mlp && shipped) {
          mlp = shipped;
          detector.setModel(mlp);
          detector.setUseML(ctx.store.get(STORE_USE_ML, true));
          updateUI();
        }
      })
      .catch(() => {});
  }

  let poseHandle = null;
  let unsubPose = null;
  let tickTimer = null;
  let showPreview = true;
  let calibrating = false;
  let calibFrames = [];
  let recording = false;
  let recordAfter = 0;
  let recordLabel = 'upright'; // 'upright' | 'slouch' | 'away'
  let recordPerson = 'person1';

  section.innerHTML = `
    <div class="desk-panel">
      <div class="desk-header">
        <h3>Desk Mode (Webcam Posture)</h3>
        <div class="desk-mode-toggle">
          <button id="desk-btn-phone" class="desk-btn">Phone Mode</button>
          <button id="desk-btn-desk" class="desk-btn primary">Desk Mode</button>
        </div>
      </div>

      <div class="desk-status-card">
        <div class="desk-live-row">
          <span class="desk-badge" id="desk-live-label">IDLE</span>
          <span class="desk-conf" id="desk-live-conf">--%</span>
          <span class="desk-src" id="desk-live-src">threshold</span>
        </div>
        <div class="desk-bar-wrap">
          <div class="desk-bar-fill" id="desk-conf-bar" style="width:0%"></div>
        </div>
        <p class="desk-hint" id="desk-calib-status">
          ${baseline ? 'Calibrated ✓' : 'Not calibrated yet — sit up straight and press Calibrate.'}
        </p>
        <div class="desk-actions">
          <button id="desk-btn-calib" class="desk-btn">Calibrate (5s)</button>
          <button id="desk-btn-preview" class="desk-btn">Hide Camera</button>
          <label class="desk-toggle-ml">
            <input type="checkbox" id="desk-chk-ml" ${mlp ? 'checked' : ''} ${mlp ? '' : 'disabled'} />
            Use ML model
          </label>
        </div>
      </div>

      <div class="desk-video-wrap" id="desk-video-wrap" hidden>
        <video id="desk-video" autoplay playsinline muted></video>
        <canvas id="desk-canvas"></canvas>
      </div>

      <details class="desk-recorder">
        <summary>Posture Recorder &amp; MLP Trainer</summary>
        <div class="desk-rec-body">
          <div class="desk-rec-row">
            <label>Label:
              <select id="desk-rec-label">
                <option value="upright">upright (still → Frost)</option>
                <option value="slouch">slouch (shake → Glitch)</option>
                <option value="away">away (walk → Sprinter)</option>
              </select>
            </label>
            <label>Person tag:
              <input id="desk-rec-person" type="text" value="person1" size="8" />
            </label>
          </div>
          <div class="desk-rec-row">
            <button id="desk-btn-rec" class="desk-btn">Record</button>
            <button id="desk-btn-train" class="desk-btn primary">Train MLP</button>
            <button id="desk-btn-clear" class="desk-btn danger">Clear</button>
          </div>
          <div class="desk-rec-row">
            <button id="desk-btn-export" class="desk-btn">Export Data</button>
            <label class="desk-btn">Import Data
              <input id="desk-file-import" type="file" accept=".json" hidden />
            </label>
            <button id="desk-btn-dl-model" class="desk-btn">Export Model</button>
          </div>
          <div class="desk-counts" id="desk-counts"></div>
          <pre class="desk-eval" id="desk-eval"></pre>
        </div>
      </details>
    </div>
  `;

  const elPhoneBtn = section.querySelector('#desk-btn-phone');
  const elDeskBtn = section.querySelector('#desk-btn-desk');
  const elLiveLabel = section.querySelector('#desk-live-label');
  const elLiveConf = section.querySelector('#desk-live-conf');
  const elLiveSrc = section.querySelector('#desk-live-src');
  const elConfBar = section.querySelector('#desk-conf-bar');
  const elCalibStatus = section.querySelector('#desk-calib-status');
  const elCalibBtn = section.querySelector('#desk-btn-calib');
  const elPreviewBtn = section.querySelector('#desk-btn-preview');
  const elChkML = section.querySelector('#desk-chk-ml');
  const elVideoWrap = section.querySelector('#desk-video-wrap');
  const elVideo = section.querySelector('#desk-video');
  const elCanvas = section.querySelector('#desk-canvas');
  const elRecLabel = section.querySelector('#desk-rec-label');
  const elRecPerson = section.querySelector('#desk-rec-person');
  const elRecBtn = section.querySelector('#desk-btn-rec');
  const elTrainBtn = section.querySelector('#desk-btn-train');
  const elClearBtn = section.querySelector('#desk-btn-clear');
  const elExportBtn = section.querySelector('#desk-btn-export');
  const elImportInput = section.querySelector('#desk-file-import');
  const elDlModelBtn = section.querySelector('#desk-btn-dl-model');
  const elCounts = section.querySelector('#desk-counts');
  const elEval = section.querySelector('#desk-eval');

  function updateUI() {
    const isDesk = ctx.pet.mode === 'desk';
    elPhoneBtn.classList.toggle('active', !isDesk);
    elDeskBtn.classList.toggle('active', isDesk);
    elVideoWrap.hidden = !isDesk || !showPreview;
    elPreviewBtn.textContent = showPreview ? 'Hide Camera' : 'Show Camera';
    elChkML.disabled = !mlp;
    elChkML.checked = !!mlp && detector.useML;

    const counts = { upright: 0, slouch: 0, away: 0 };
    const people = new Set();
    for (const s of dataset) {
      const lbl = SLOT_TO_DESK[s.y] || s.y;
      if (counts[lbl] !== undefined) counts[lbl]++;
      if (s.person) people.add(s.person);
    }
    elCounts.textContent =
      `Samples: upright ${counts.upright} · slouch ${counts.slouch} · away ${counts.away}` +
      (people.size ? ` (${people.size} ${people.size === 1 ? 'person' : 'people'})` : '');
  }

  async function startDeskMode() {
    if (poseHandle) return;
    try {
      poseHandle = await acquire({ facing: 'user' });
      if (poseHandle && poseHandle.video) {
        elVideo.srcObject = poseHandle.video.srcObject;
        elVideo.play().catch(() => {});
      }

      unsubPose = subscribe(({ landmarks, t, present }) => {
        detector.pushFrame({ landmarks, t, present });

        if (calibrating && present && landmarks) {
          const m = extractFrameMetrics(landmarks);
          if (m) calibFrames.push(m);
        }

        if (showPreview && !elVideoWrap.hidden) {
          const w = elVideo.videoWidth || 320;
          const h = elVideo.videoHeight || 240;
          if (elCanvas.width !== w || elCanvas.height !== h) {
            elCanvas.width = w;
            elCanvas.height = h;
          }
          const c2d = elCanvas.getContext('2d');
          c2d.clearRect(0, 0, w, h);
          if (landmarks) drawSkeleton(elCanvas, landmarks);
        }
      });

      ctx.pet.mode = 'desk';
      ctx.setActivitySource(detector);
      emit('mode:changed', { mode: 'desk' });

      tickTimer = setInterval(() => {
        const now = performance.now();
        const res = detector.classifyWindow();
        const displayName = labels[res.act] || res.label;
        const pct = Math.round((res.conf || 0) * 100);

        elLiveLabel.textContent = displayName.toUpperCase();
        elLiveLabel.dataset.state = res.label;
        elLiveConf.textContent = `${pct}%`;
        elLiveSrc.textContent = res.source;
        elConfBar.style.width = `${pct}%`;

        emit('desk:posture', { label: res.label, conf: res.conf });

        const samples = detector.buffer;
        if (recording && !calibrating && now >= recordAfter && samples.length
          && now - samples.at(-1).t < 500 && samples.at(-1).t - samples[0].t >= 1500) {
          dataset.push({
            x: res.features,
            y: DESK_TO_SLOT[recordLabel],
            person: recordPerson || 'person1',
            t: Date.now()
          });
          ctx.store.set(STORE_DATASET, dataset);
          updateUI();
        }
      }, 1000);

      updateUI();
      ctx.toast('Desk mode active');
    } catch (err) {
      ctx.toast(`Camera/Pose error: ${err.message || err}`);
      stopDeskMode();
    }
  }

  function stopDeskMode() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (unsubPose) {
      unsubPose();
      unsubPose = null;
    }
    if (poseHandle) {
      release(poseHandle);
      poseHandle = null;
    }
    recording = false;
    detector.reset();
    elRecBtn.textContent = 'Record';
    elRecBtn.classList.remove('recording');
    elVideo.srcObject = null;

    ctx.pet.mode = 'phone';
    ctx.setActivitySource(null);
    emit('mode:changed', { mode: 'phone' });
    updateUI();
  }

  // Calibration: 5 seconds upright
  elCalibBtn.addEventListener('click', async () => {
    if (!poseHandle) await startDeskMode();
    if (!poseHandle || calibrating) return;

    calibrating = true;
    calibFrames = [];
    elCalibBtn.disabled = true;
    let left = 5;
    elCalibStatus.textContent = `Sit up straight... ${left}s`;

    const cd = setInterval(() => {
      left--;
      if (left > 0) {
        elCalibStatus.textContent = `Sit up straight... ${left}s`;
      } else {
        clearInterval(cd);
        calibrating = false;
        elCalibBtn.disabled = false;
        const b = computeBaseline(calibFrames);
        if (b) {
          baseline = b;
          detector.setBaseline(b);
          ctx.store.set(STORE_BASELINE, b);
          emit('desk:calibrated', { baseline: b });
          elCalibStatus.textContent = `Calibrated ✓ (${b.samples} frames)`;
          ctx.toast('Posture calibrated!');
        } else {
          elCalibStatus.textContent = 'Calibration failed — stay in frame and try again.';
        }
      }
    }, 1000);
  });

  elDeskBtn.addEventListener('click', () => startDeskMode());
  elPhoneBtn.addEventListener('click', () => stopDeskMode());
  elPreviewBtn.addEventListener('click', () => {
    showPreview = !showPreview;
    updateUI();
  });

  elChkML.addEventListener('change', () => {
    detector.setUseML(elChkML.checked);
    ctx.store.set(STORE_USE_ML, elChkML.checked);
  });

  elRecLabel.addEventListener('change', () => {
    recordLabel = elRecLabel.value;
    recordAfter = performance.now() + POSTURE_WINDOW_MS;
  });
  elRecPerson.addEventListener('input', () => {
    recordPerson = elRecPerson.value.trim() || 'person1';
    recordAfter = performance.now() + POSTURE_WINDOW_MS;
  });

  elRecBtn.addEventListener('click', async () => {
    if (!poseHandle) await startDeskMode();
    if (!poseHandle) return;
    if (!recording && (!baseline || calibrating)) {
      ctx.toast('Finish upright calibration before recording.');
      return;
    }
    recording = !recording;
    recordAfter = performance.now() + POSTURE_WINDOW_MS;
    elRecBtn.textContent = recording ? 'Stop Recording' : 'Record';
    elRecBtn.classList.toggle('recording', recording);
  });

  elClearBtn.addEventListener('click', () => {
    dataset = [];
    ctx.store.set(STORE_DATASET, dataset);
    elEval.textContent = '';
    updateUI();
  });

  elTrainBtn.addEventListener('click', () => {
    if (recording || calibrating) {
      ctx.toast('Stop recording and finish calibration before training.');
      return;
    }
    let result;
    try {
      result = trainPostureModel(dataset);
    } catch (error) {
      elEval.textContent = error.message;
      return;
    }
    const { model, heldOut, trainCount, evaluation: ev } = result;
    const splitNote = heldOut
      ? `Held-out person: ${heldOut} (${ev.total} test windows)`
      : `Single-person time split (${ev.total} test windows)`;
    const useML = ev.mlpAcc >= ev.thresholdAcc;
    mlp = model;
    detector.setModel(model);
    detector.setUseML(useML);
    ctx.store.set(STORE_MODEL, model.toJSON());
    ctx.store.set(STORE_USE_ML, useML);
    const fmt = (m) =>
      m.map((r, i) => `${SLOT_TO_DESK[SLOTS[i]].padEnd(7)}: ${r.join('  ')}`).join('\n');

    elEval.textContent =
      `${splitNote}\nTrained on ${trainCount} windows. ${useML ? 'ML model enabled.' : 'Thresholds still active.'}\n` +
      `MLP acc:       ${(ev.mlpAcc * 100).toFixed(1)}%\n` +
      `Threshold acc: ${(ev.thresholdAcc * 100).toFixed(1)}%\n\n` +
      `MLP confusion (rows=true, cols=away/up/slouch):\n${fmt(ev.mlpConfusion)}`;

    ctx.toast(`Posture MLP trained (${(ev.mlpAcc * 100).toFixed(0)}%)`);
    updateUI();
  });

  elExportBtn.addEventListener('click', () => {
    downloadJSON(dataset, 'pengbit-desk-dataset.json');
  });

  elImportInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (Array.isArray(imported)) {
        const valid = imported.filter(isPostureSample);
        dataset = dataset.concat(valid);
        ctx.store.set(STORE_DATASET, dataset);
        ctx.toast(`Imported ${valid.length} valid windows`);
        updateUI();
      }
    } catch {
      ctx.toast('Invalid JSON file');
    }
    e.target.value = '';
  });

  elDlModelBtn.addEventListener('click', () => {
    if (!mlp) return ctx.toast('Train a model first');
    const weights = typeof mlp.toJSON === 'function' ? mlp.toJSON() : mlp;
    downloadJSON(weights, 'posture-model.json');
  });

  updateUI();
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
