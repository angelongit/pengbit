// app/js/desk.js
// W5: Desk mode UI, calibration, live posture loop, recorder & MLP training

import { emit } from './bus.js';
import { acquire, release, subscribe, drawSkeleton } from './pose.js';
import { MODE_LABELS } from './pet.js';
import {
  PostureDetector,
  extractFrameMetrics,
  computeBaseline,
  createPostureMLP,
  evaluateModels,
  DESK_TO_SLOT,
  SLOT_TO_DESK,
  SLOTS
} from './posture.js';

const STORE_BASELINE = 'deskBaseline';
const STORE_DATASET = 'deskDataset';
const STORE_MODEL = 'deskModel';

export function init(ctx) {
  const section = document.getElementById('tab-desk');
  const navBtn = document.querySelector('[data-tab="desk"]');
  if (!section) return;
 if (ctx.showTab) ctx.showTab('desk');
  else if (navBtn) navBtn.hidden = false;

  const labels = (MODE_LABELS && MODE_LABELS.desk) || SLOT_TO_DESK;

  // Load persisted state
  let baseline = ctx.store.get(STORE_BASELINE, null);
  let dataset = ctx.store.get(STORE_DATASET, []);
  let savedWeights = ctx.store.get(STORE_MODEL, null);
  let mlp = savedWeights ? createPostureMLP(savedWeights) : null;

  const detector = new PostureDetector({
    baseline,
    model: mlp,
    useML: !!mlp
  });

  // Load shipped posture-model.json if no local trained model exists
  if (!mlp) {
    fetch('./model/posture-model.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((weights) => {
        if (weights && weights.W1) {
          mlp = createPostureMLP(weights);
          detector.setModel(mlp);
          detector.setUseML(true);
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
    if (!mlp) elChkML.checked = false;

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
        const res = detector.classifyWindow();
        const displayName = labels[res.act] || res.label;
        const pct = Math.round((res.conf || 0) * 100);

        elLiveLabel.textContent = displayName.toUpperCase();
        elLiveLabel.dataset.state = res.label;
        elLiveConf.textContent = `${pct}%`;
        elLiveSrc.textContent = res.source;
        elConfBar.style.width = `${pct}%`;

        emit('desk:posture', { label: res.label, conf: res.conf });

        if (recording && res.features) {
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
    elRecBtn.textContent = 'Record';
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
  });

  elRecLabel.addEventListener('change', () => {
    recordLabel = elRecLabel.value;
  });
  elRecPerson.addEventListener('input', () => {
    recordPerson = elRecPerson.value.trim() || 'person1';
  });

  elRecBtn.addEventListener('click', async () => {
    if (!poseHandle) await startDeskMode();
    if (!poseHandle) return;
    recording = !recording;
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
    if (dataset.length < 15) {
      ctx.toast('Record at least ~15 windows across all 3 postures first.');
      return;
    }

    // Hold out one person if >= 2 people exist, else 80/20 split
    const people = [...new Set(dataset.map((s) => s.person || 'person1'))];
    let trainSet, testSet, splitNote;
    if (people.length >= 2) {
      const heldOut = people[people.length - 1];
      trainSet = dataset.filter((s) => (s.person || 'person1') !== heldOut);
      testSet = dataset.filter((s) => (s.person || 'person1') === heldOut);
      splitNote = `Held-out person: ${heldOut} (${testSet.length} windows)`;
    } else {
      const shuffled = [...dataset].sort(() => Math.random() - 0.5);
      const cut = Math.floor(shuffled.length * 0.8);
      trainSet = shuffled.slice(0, cut);
      testSet = shuffled.slice(cut);
      splitNote = `80/20 split (${testSet.length} test windows)`;
    }

    const model = createPostureMLP();
    // Recorded samples are { x, y }; MLP.train expects { f, label } (same slot names).
    model.train(trainSet.map((s) => ({ f: s.x, label: s.y })));
    mlp = model;
    detector.setModel(mlp);
    detector.setUseML(true);
    elChkML.disabled = false;
    elChkML.checked = true;

    const weights = typeof mlp.toJSON === 'function' ? mlp.toJSON() : mlp;
    ctx.store.set(STORE_MODEL, weights);

    const ev = evaluateModels(testSet, mlp);
    const fmt = (m) =>
      m.map((r, i) => `${SLOT_TO_DESK[SLOTS[i]].padEnd(7)}: ${r.join('  ')}`).join('\n');

    elEval.textContent =
      `${splitNote}\n` +
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
        dataset = dataset.concat(imported);
        ctx.store.set(STORE_DATASET, dataset);
        ctx.toast(`Imported ${imported.length} windows`);
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