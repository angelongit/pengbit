# MediaPipe Tasks Vision (vendored)

`@mediapipe/tasks-vision` **0.10.21** (Apache-2.0, Google), copied from the npm package so the
pose AI loads from our own origin even when event Wi-Fi blocks or slows CDNs.

- `vision_bundle.js`: the package's `vision_bundle.mjs` (source map comment removed)
- `wasm/`: the package's `wasm/` folder, unchanged
- `pose_landmarker_lite.task`: Pose Landmarker lite, float16, v1, from
  `storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/`

Used only through `app/js/pose.js`. To upgrade, replace all three and bump `MP_VERSION` there.
