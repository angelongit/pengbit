// Pengbit pet rules, ported from the firmware (firmware/pet/pet_state.cpp + config.h).
// All time is in pet seconds. tick() gets 1 per real second, or DEMO_SPEEDUP in demo mode.

export const CFG = {
  DEMO_SPEEDUP: 60,          // demo mode: 1 real s = 60 pet s
  STAT_START: 80,
  LOW_STAT: 20,              // hungry / sad below this
  FEED_ENERGY: 20,
  PLAY_HAPPY: 15,
  PLAY_ENERGY: 5,
  // Per pet minute. Baseline every minute, plus the activity delta.
  BASE: { happy: -1, energy: -1 },
  ACT: {
    walk:  { happy: +2, energy: -2 },
    still: { happy: 0,  energy: +2 },
    shake: { happy: -1, energy: -1 },
  },
  HATCH_AGE_S: 5 * 60,       // 5 pet minutes
  EVOLVE_AGE_S: 600 * 60,    // 600 pet minutes (~10 real min in demo)
  EVOLVE_MIN_HAPPY: 30,
  NUDGE_STILL_S: 45 * 60,    // sitting nudge after 45 pet minutes still
  NUDGE_REPEAT_S: 30 * 60,   // then every 30 pet minutes
};

export const FORMS = {
  egg:      { name: 'Egg',              blurb: 'Something is wiggling inside.' },
  baby:     { name: 'Pengbit',          blurb: 'A tiny penguin chick made of pixels.' },
  sprinter: { name: 'Sprinter Pengbit', blurb: 'Raised on walks. Fast, sleek, always moving.' },
  frost:    { name: 'Frost Pengbit',    blurb: 'Raised sitting still. Calm, icy, a little sleepy.' },
  glitch:   { name: 'Glitch Pengbit',   blurb: 'Raised on shakes. Crackles with static.' },
};

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

export class Pet {
  constructor(saved) {
    this.reset();
    if (saved) Object.assign(this, saved);
    this.events = [];
  }

  reset() {
    this.name = this.name || 'Pengbit';
    this.happy = CFG.STAT_START;
    this.energy = CFG.STAT_START;
    this.form = 'egg';
    this.age = 0;                       // pet seconds since hatching (or since laid, while an egg)
    this.totals = { walk: 0, still: 0, shake: 0 };
    this.minuteAccum = 0;
    this.stillStreak = 0;
    this.nextNudgeAt = CFG.NUDGE_STILL_S;
    this.nudged = false;
    this.wasHungry = false;
    this.wasSad = false;
    // Impact metric: how many sitting nudges were followed by a walk.
    this.nudges = 0;
    this.nudgesAnswered = 0;
    this.evolvedAt = null;
    this.events = [];
  }

  toJSON() {
    const { events, ...rest } = this;
    return rest;
  }

  get isEgg() { return this.form === 'egg'; }
  get hungry() { return this.energy < CFG.LOW_STAT; }
  get sad() { return this.happy < CFG.LOW_STAT; }
  get shivering() { return !this.isEgg && this.stillStreak >= CFG.NUDGE_STILL_S; }

  push(type, value) { this.events.push({ type, value }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  checkLowStats() {
    if (this.hungry && !this.wasHungry) this.push('hungry');
    if (this.sad && !this.wasSad) this.push('sad');
    this.wasHungry = this.hungry;
    this.wasSad = this.sad;
  }

  applyMinute(act) {
    const d = CFG.ACT[act];
    this.happy = clamp(this.happy + CFG.BASE.happy + d.happy);
    this.energy = clamp(this.energy + CFG.BASE.energy + d.energy);
  }

  // dt: pet seconds. act: 'walk' | 'still' | 'shake'.
  tick(dt, act) {
    this.age += dt;

    if (this.isEgg) {
      if (this.age >= CFG.HATCH_AGE_S) {
        this.form = 'baby';
        this.age = 0;   // evolution age counts from hatching
        this.push('hatched');
      }
      return;
    }

    this.totals[act] += dt;

    this.minuteAccum += dt;
    while (this.minuteAccum >= 60) {
      this.minuteAccum -= 60;
      this.applyMinute(act);
    }
    this.checkLowStats();

    // Sitting nudge. STILL builds the streak, WALK clears it, SHAKE leaves it alone.
    if (act === 'still') {
      this.stillStreak += dt;
      if (this.stillStreak >= this.nextNudgeAt) {
        this.push('idle', Math.floor(this.stillStreak / 60));
        if (!this.nudged) this.nudges++;
        this.nudged = true;
        this.nextNudgeAt += CFG.NUDGE_REPEAT_S;
      }
    } else if (act === 'walk') {
      if (this.nudged) { this.nudgesAnswered++; this.push('move'); }
      this.nudged = false;
      this.stillStreak = 0;
      this.nextNudgeAt = CFG.NUDGE_STILL_S;
    }

    if (this.form === 'baby' && this.age >= CFG.EVOLVE_AGE_S && this.happy >= CFG.EVOLVE_MIN_HAPPY) this.evolve();
  }

  dominantForm() {
    const { walk: w, still: s, shake: k } = this.totals;
    if (w >= k && w >= s) return 'sprinter';   // ties: walk > shake > still
    if (k >= s) return 'glitch';
    return 'frost';
  }

  evolve() {
    this.form = this.dominantForm();
    this.evolvedAt = Date.now();
    this.push('evolved', this.form);
  }

  // Judge shortcut: evolve now from the current totals, skipping the age and happiness gates.
  forceEvolve() {
    if (this.isEgg) { this.form = 'baby'; this.age = 0; this.push('hatched'); return true; }
    if (this.form !== 'baby') return false;
    this.evolve();
    return true;
  }

  feed() {
    if (this.isEgg) return false;
    this.energy = clamp(this.energy + CFG.FEED_ENERGY);
    this.checkLowStats();
    return true;
  }

  play() {
    if (this.isEgg) return false;
    this.happy = clamp(this.happy + CFG.PLAY_HAPPY);
    this.energy = clamp(this.energy - CFG.PLAY_ENERGY);
    this.checkLowStats();
    return true;
  }

  // Facts the AI professor gets for dex entries and coaching.
  summary() {
    const min = (s) => Math.round(s / 60);
    return {
      name: this.name,
      form: this.form,
      formName: FORMS[this.form].name,
      ageMinutes: min(this.age),
      happiness: this.happy,
      energy: this.energy,
      minutes: { walk: min(this.totals.walk), still: min(this.totals.still), shake: min(this.totals.shake) },
      stillStreakMinutes: min(this.stillStreak),
      nudges: this.nudges,
      nudgesAnswered: this.nudgesAnswered,
    };
  }
}
