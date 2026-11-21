// app/js/posture.js
// W5: Desk mode posture feature extraction, threshold classifier, and MLP wrapper

import { MLP } from './activity.js';
import { LM } from './pose.js';

export const POSTURE_N_IN = 8;

// Map pet slots <-> desk labels
export const SLOT_TO_DESK = { walk: 'away', still: 'upright', shake: 'slouch' };
export const DESK_TO_SLOT = { away: 'walk', upright: 'still', slouch: 'shake' };
export const SLOTS = ['walk', 'still', 'shake'];

export const DEFAULT_THRESHOLDS = {
  awayPresentMin: 0.30,   // < 30% frames with a person -> away
  slouchHeadDrop: 0.14,   // nose dropped relative to shoulders (scaled by shoulder width)
  slouchFaceScale: 1.18,  // ear-to-ear distance grew >= 18% vs baseline (leaning in)
  slouchForward: 0.18,    // ear-to-shoulder forward/drop shift
  slouchTilt: 0.14        // shoulder tilt slope
};

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function isVis(pt, min = 0.4) {
  return pt && (pt.visibility === undefined || pt.visibility >= min);
}

/**
 * Extract instantaneous raw geometry from a single MediaPipe pose frame.
 * Returns null if upper body landmarks are not sufficiently visible.
 */
export function extractFrameMetrics(landmarks) {
  if (!landmarks || landmarks.length < 13) return null;
  const nose = landmarks[LM.NOSE];
  const lEar = landmarks[LM.LEFT_EAR];
  const rEar = landmarks[LM.RIGHT_EAR];
  const lSh = landmarks[LM.LEFT_SHOULDER];
  const rSh = landmarks[LM.RIGHT_SHOULDER];

  if (!isVis(nose) || !isVis(lSh) || !isVis(rSh)) return null;

  const shMidX = (lSh.x + rSh.x) * 0.5;
  const shMidY = (lSh.y + rSh.y) * 0.5;
  const shWidth = Math.max(dist2D(lSh, rSh), 0.05);

  // In image coords, Y increases downward. Higher head = more negative (nose.y - shMidY).
  // So headHeight = (shMidY - nose.y) / shWidth (positive when head is above shoulders).
  const headHeight = (shMidY - nose.y) / shWidth;

  // Face size: ear-to-ear distance (proxy for distance to camera / leaning forward)
  let earDist = 0;
  let earOffset = 0;
  if (isVis(lEar, 0.3) && isVis(rEar, 0.3)) {
    earDist = dist2D(lEar, rEar);
    const earMidY = (lEar.y + rEar.y) * 0.5;
    earOffset = (shMidY - earMidY) / shWidth;
  } else {
    earDist = shWidth * 0.45;
    earOffset = headHeight * 0.9;
  }

  // Shoulder tilt: absolute vertical difference normalized by width
  const shoulderTilt = Math.abs(lSh.y - rSh.y) / shWidth;

  return {
    headHeight,
    earDist,
    earOffset,
    shoulderTilt,
    noseX: nose.x,
    noseY: nose.y,
    shWidth
  };
}

/**
 * Compute upright baseline from an array of frame metrics collected over ~5 seconds.
 */
export function computeBaseline(metricFrames) {
  const valid = metricFrames.filter(Boolean);
  if (valid.length < 5) return null;
  const avg = (fn) => valid.reduce((s, m) => s + fn(m), 0) / valid.length;
  return {
    headHeight: avg((m) => m.headHeight),
    earDist: Math.max(avg((m) => m.earDist), 0.02),
    earOffset: avg((m) => m.earOffset),
    shoulderTilt: avg((m) => m.shoulderTilt),
    shWidth: avg((m) => m.shWidth),
    samples: valid.length,
    calibratedAt: Date.now()
  };
}

/**
 * Compute 8-element feature vector for a 2-second window of frames:
 * frames: [{ t, present, metrics }]
 */
export function extractWindowFeatures(frames, baseline) {
  const n = frames.length;
  if (n === 0) {
    return [0, 0, 1, 0, 0, 0, 0, 0];
  }

  const presentFrames = frames.filter((f) => f.present && f.metrics);
  const presentRatio = presentFrames.length / n;

  if (presentFrames.length === 0) {
    return [0, 0, 1, 0, 0, 0, 0, 0];
  }

  const base = baseline || {
    headHeight: 0.65,
    earDist: 0.14,
    earOffset: 0.60,
    shoulderTilt: 0.03
  };

  const headDrops = [];
  const faceScales = [];
  const earOffsets = [];
  const tilts = [];
  const noseXs = [];
  const noseYs = [];

  for (const f of presentFrames) {
    const m = f.metrics;
    // Positive headDrop means head dropped BELOW upright baseline
    headDrops.push(base.headHeight - m.headHeight);
    // > 1.0 means face looks larger (leaning closer to webcam)
    faceScales.push(m.earDist / Math.max(base.earDist, 0.02));
    // Positive means ears dropped relative to shoulders
    earOffsets.push(base.earOffset - m.earOffset);
    tilts.push(Math.abs(m.shoulderTilt - base.shoulderTilt));
    noseXs.push(m.noseX);
    noseYs.push(m.noseY);
  }

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr, mu) => {
    const v = arr.reduce((a, b) => a + (b - mu) * (b - mu), 0) / arr.length;
    return Math.sqrt(v);
  };

  const headDropMean = mean(headDrops);
  const headDropStd = std(headDrops, headDropMean);
  const faceScaleMean = mean(faceScales);
  const earOffsetMean = mean(earOffsets);
  const tiltMean = mean(tilts);

  // Jitter: average frame-to-frame nose displacement
  let jitter = 0;
  if (noseXs.length > 1) {
    let sumD = 0;
    for (let i = 1; i < noseXs.length; i++) {
      sumD += Math.hypot(noseXs[i] - noseXs[i - 1], noseYs[i] - noseYs[i - 1]);
    }
    jitter = sumD / (noseXs.length - 1);
  }

  const noseYStd = std(noseYs, mean(noseYs));

  return [
    headDropMean,   // 0: head drop vs baseline
    headDropStd,    // 1: head drop variance
    faceScaleMean,  // 2: face size ratio vs baseline
    earOffsetMean,  // 3: ear-to-shoulder drop vs baseline
    tiltMean,       // 4: shoulder tilt delta
    presentRatio,   // 5: fraction of frames with person present
    jitter,         // 6: head motion jitter
    noseYStd        // 7: vertical head movement std
  ];
}

/**
 * Threshold baseline classifier.
 * Returns { act: 'walk'|'still'|'shake', label: 'away'|'upright'|'slouch', conf: 0..1 }
 */
export function thresholdPosture(feats, cfg = DEFAULT_THRESHOLDS) {
  const [headDrop, , faceScale, earOffset, tilt, presentRatio] = feats;

  if (presentRatio < cfg.awayPresentMin) {
    const conf = Math.min(1, Math.max(0.6, 1 - presentRatio / cfg.awayPresentMin));
    return { act: 'walk', label: 'away', conf };
  }

  const dropScore = headDrop / cfg.slouchHeadDrop;
  const faceScore = (faceScale - 1) / (cfg.slouchFaceScale - 1);
  const fwdScore = earOffset / cfg.slouchForward;
  const tiltScore = tilt / cfg.slouchTilt;
  const worst = Math.max(dropScore, faceScore, fwdScore, tiltScore);

  if (worst >= 1.0) {
    const conf = Math.min(0.99, 0.55 + Math.min(0.44, (worst - 1.0) * 0.45));
    return { act: 'shake', label: 'slouch', conf };
  }

  const conf = Math.min(0.98, Math.max(0.55, 1 - Math.max(0, worst) * 0.4));
  return { act: 'still', label: 'upright', conf };
}

/**
 * Safe inference wrapper around activity.js MLP
 */
function mlpPredict(mlp, feats) {
  if (!mlp) return null;
  if (typeof mlp.predict === 'function') {
    const out = mlp.predict(feats);
    if (out && typeof out === 'object' && out.act) return out;
    if (Array.isArray(out) || ArrayBuffer.isView(out)) {
      let best = 0;
      for (let i = 1; i < out.length; i++) if (out[i] > out[best]) best = i;
      return { act: SLOTS[best], conf: out[best], probs: Array.from(out) };
    }
  }
  if (typeof mlp.classify === 'function') return mlp.classify(feats);
  return null;
}

/**
 * Evaluates both threshold and MLP accuracy + confusion matrix on a dataset:
 * samples: [{ x: number[8], y: 'walk'|'still'|'shake', person?: string }]
 */
export function evaluateModels(samples, mlp) {
  const makeMat = () => [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  const thrMat = makeMat();
  const mlpMat = makeMat();
  let thrOk = 0;
  let mlpOk = 0;

  for (const s of samples) {
    const yi = SLOTS.indexOf(s.y);
    if (yi < 0) continue;

    const tRes = thresholdPosture(s.x);
    const ti = SLOTS.indexOf(tRes.act);
    if (ti >= 0) {
      thrMat[yi][ti]++;
      if (ti === yi) thrOk++;
    }

    if (mlp) {
      const mRes = mlpPredict(mlp, s.x);
      const mi = mRes ? SLOTS.indexOf(mRes.act) : -1;
      if (mi >= 0) {
        mlpMat[yi][mi]++;
        if (mi === yi) mlpOk++;
      }
    }
  }

  const total = samples.length || 1;
  return {
    total: samples.length,
    thresholdAcc: thrOk / total,
    thresholdConfusion: thrMat,
    mlpAcc: mlp ? mlpOk / total : null,
    mlpConfusion: mlp ? mlpMat : null
  };
}

/**
 * PostureDetector: implements the ctx.setActivitySource(src) contract.
 * Maintains a 2s sliding window, classifies every 1s with 3-window majority vote.
 */
export class PostureDetector {
  constructor({ baseline = null, model = null, useML = true } = {}) {
    this.baseline = baseline;
    this.model = model;
    this.useML = useML;
    this.buffer = [];        // { t, present, metrics }
    this.votes = [];         // last 3 { act, conf, source }
    this.lastFeatures = null;
    this.last = {
      act: 'still',
      label: 'upright',
      conf: 0,
      source: 'threshold'
    };
  }

  setBaseline(baseline) {
    this.baseline = baseline;
  }

  setModel(mlp) {
    this.model = mlp;
  }

  setUseML(flag) {
    this.useML = !!flag;
  }

  pushFrame({ landmarks, t, present }) {
    const now = t || performance.now();
    const metrics = present && landmarks ? extractFrameMetrics(landmarks) : null;
    this.buffer.push({ t: now, present: !!present && !!metrics, metrics });

    // Trim to last 2.2s
    const cutoff = now - 2200;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }
  }

  /**
   * Run once per second. Returns { act, label, conf, source, features }.
   */
  classifyWindow() {
    const feats = extractWindowFeatures(this.buffer, this.baseline);
    this.lastFeatures = feats;

    let raw;
    let source = 'threshold';
    if (this.useML && this.model) {
      const pred = mlpPredict(this.model, feats);
      if (pred && pred.act) {
        raw = {
          act: pred.act,
          label: SLOT_TO_DESK[pred.act] || 'upright',
          conf: pred.conf ?? 0.8
        };
        source = 'ml';
      }
    }
    if (!raw) {
      raw = thresholdPosture(feats);
      source = 'threshold';
    }

    // 3-window majority vote
    this.votes.push({ act: raw.act, conf: raw.conf, source });
    if (this.votes.length > 3) this.votes.shift();

    const counts = { walk: 0, still: 0, shake: 0 };
    for (const v of this.votes) counts[v.act] = (counts[v.act] || 0) + 1;

    let winner = raw.act;
    let bestCount = 0;
    for (const slot of SLOTS) {
      if (counts[slot] > bestCount) {
        bestCount = counts[slot];
        winner = slot;
      }
    }

    const matching = this.votes.filter((v) => v.act === winner);
    const avgConf = matching.reduce((s, v) => s + v.conf, 0) / matching.length;

    this.last = {
      act: winner,
      label: SLOT_TO_DESK[winner] || 'upright',
      conf: avgConf,
      source
    };

    return { ...this.last, features: feats };
  }

  reset() {
    this.buffer = [];
    this.votes = [];
  }
}

export function createPostureMLP(weights = null) {
  return new MLP(weights || null, { nIn: POSTURE_N_IN });
}