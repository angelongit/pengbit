// Feature registry. Each workstream uncomments its own line below (and nothing else), so PRs don't conflict.
// A feature module exports init(ctx). It fills its own tab-<name> section and calls ctx.showTab(name).
// Modules load with dynamic import, so a broken or missing feature never stops the pet.
const FEATURES = [
  './onboarding.js',    // W8 first-run introduction
  './flock.js',         // W1 Pebblebit Flock
  './exercise.js',      // W2 Camera-verified exercise
  // './insights.js',   // W3 Predictive nudges + weekly report
  './talk.js',          // W4 Talk to Professor Liveoak
  './desk.js',          // W5 Desk mode (posture)
  // './campus.js',     // W9 Campus wellness dashboard
  './pip.js',           // W6 Floating window (Daniel)
  './names.js',         // Hatch naming, retired names, tombstones of past Pebblebits
  './mood.js',          // W6 Mood look: glum, scruffy, rounder as joy drops (Daniel)
  './mirror.js',        // W6 Neglect Mirror: zero joy, Pebblebit blames you, webcam morph (Daniel)
  './roam.js',          // Desktop roaming Pebblebit (desktop/ companion + in-page fallback)
  './focus-timer.js',
];

export async function initFeatures(ctx) {
  for (const path of FEATURES) {
    try {
      const mod = await import(path);
      await mod.init(ctx);
    } catch (e) { console.error(`[features] ${path} failed to start`, e); }
  }
}
