#include "pet_state.h"

void PetState::reset() {
  happy_ = energy_ = STAT_START;
  form_ = Form::EGG;
  age_ = 0;
  totals_[0] = totals_[1] = totals_[2] = 0;
  minuteAccum_ = 0;
  stillStreak_ = 0;
  nextNudgeAt_ = NUDGE_STILL_S;
  nudged_ = false;
  wasHungry_ = wasSad_ = false;
  qHead_ = qLen_ = 0;
}

void PetState::push(PetEventType t, uint16_t v) {
  if (qLen_ == QUEUE) {           // full: drop the oldest
    qHead_ = (qHead_ + 1) % QUEUE;
    qLen_--;
  }
  PetEvent& e = queue_[(qHead_ + qLen_) % QUEUE];
  e.type = t;
  e.value = v;
  qLen_++;
}

bool PetState::pollEvent(PetEvent& out) {
  if (!qLen_) return false;
  out = queue_[qHead_];
  qHead_ = (qHead_ + 1) % QUEUE;
  qLen_--;
  return true;
}

void PetState::addStat(uint8_t& stat, int delta) {
  int v = (int)stat + delta;
  stat = v < 0 ? 0 : v > 100 ? 100 : (uint8_t)v;
}

// Edge-triggered: one event when a stat drops below LOW_STAT, re-armed when it recovers.
void PetState::checkLowStats() {
  if (hungry() && !wasHungry_) push(PetEventType::HUNGRY);
  if (sad() && !wasSad_) push(PetEventType::SAD);
  wasHungry_ = hungry();
  wasSad_ = sad();
}

void PetState::applyMinute(Activity a) {
  int dh = BASE_HAPPY, de = BASE_ENERGY;
  switch (a) {
    case Activity::WALK:  dh += WALK_HAPPY;  de += WALK_ENERGY;  break;
    case Activity::STILL: dh += STILL_HAPPY; de += STILL_ENERGY; break;
    case Activity::SHAKE: dh += SHAKE_HAPPY; de += SHAKE_ENERGY; break;
  }
  addStat(happy_, dh);
  addStat(energy_, de);
}

void PetState::tick(uint32_t dt, Activity a) {
  age_ += dt;

  if (form_ == Form::EGG) {
    if (age_ >= HATCH_AGE_S) {
      form_ = Form::BABY;
      age_ = 0;   // age counts from hatching; evolution age is measured from here
      push(PetEventType::HATCHED);
    }
    return;       // eggs have no stats and no activity totals
  }

  totals_[(int)a] += dt;

  // Stats change once per full pet minute, using the activity of this tick.
  minuteAccum_ += dt;
  while (minuteAccum_ >= 60) {
    minuteAccum_ -= 60;
    applyMinute(a);
  }
  checkLowStats();

  // Sitting nudge. STILL builds the streak, WALK clears it, SHAKE leaves it alone.
  if (a == Activity::STILL) {
    stillStreak_ += dt;
    if (stillStreak_ >= nextNudgeAt_) {
      push(PetEventType::IDLE, (uint16_t)(stillStreak_ / 60));
      nudged_ = true;
      nextNudgeAt_ += NUDGE_REPEAT_S;
    }
  } else if (a == Activity::WALK) {
    if (nudged_) push(PetEventType::MOVE);
    nudged_ = false;
    stillStreak_ = 0;
    nextNudgeAt_ = NUDGE_STILL_S;
  }

  if (form_ == Form::BABY && age_ >= EVOLVE_AGE_S && happy_ >= EVOLVE_MIN_HAPPY) evolve();
}

Form PetState::dominantForm() const {
  uint32_t w = totals_[(int)Activity::WALK];
  uint32_t s = totals_[(int)Activity::STILL];
  uint32_t k = totals_[(int)Activity::SHAKE];
  if (w >= k && w >= s) return Form::SPRINTER;   // ties: walk > shake > still
  if (k >= s) return Form::GLITCH;
  return Form::FROST;
}

void PetState::evolve() {
  form_ = dominantForm();
  push(PetEventType::EVOLVED, (uint16_t)form_);
}

bool PetState::forceEvolve() {
  if (form_ != Form::BABY) return false;
  evolve();
  return true;
}

bool PetState::feed() {
  if (isEgg()) return false;
  addStat(energy_, FEED_ENERGY);
  checkLowStats();
  return true;
}

bool PetState::play() {
  if (isEgg()) return false;
  addStat(happy_, PLAY_HAPPY);
  addStat(energy_, -(int)PLAY_ENERGY);
  checkLowStats();
  return true;
}
