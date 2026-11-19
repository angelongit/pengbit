#include "pet_state.h"
#include "config.h"

void PetState::reset() {
  *this = PetState();
}

void PetState::tick(uint32_t seconds, Activity activity) {
  // TODO:
  //   age_ += seconds; tally_[(int)activity] += seconds;
  //   minuteAccum_ += seconds; for each whole minute apply the rules table (section 6),
  //   clamped to 0..100; push HUNGRY / SAD when a stat first drops below LOW_STAT.
  //   checkEvolution();
  (void)seconds; (void)activity;
}

void PetState::feed() {
  // TODO: energy +FEED_ENERGY, clamp
}

void PetState::play() {
  // TODO: happiness +PLAY_HAPPY, energy -PLAY_ENERGY, clamp
}

void PetState::checkEvolution() {
  // TODO: EGG -> BABY at HATCH_AGE_S (push HATCHED).
  //       BABY -> form with the largest tally_ at EVOLVE_AGE_S if happiness_ >= EVOLVE_MIN_HAPPY
  //       (WALK -> SPRINTER, STILL -> FROST, SHAKE -> GLITCH; push EVOLVED).
}

void PetState::push(PetEvent e) {
  if (qLen_ < QUEUE) queue_[(qHead_ + qLen_++) % QUEUE] = e;
}

PetEvent PetState::pollEvent() {
  if (qLen_ == 0) return PetEvent::NONE;
  PetEvent e = queue_[qHead_];
  qHead_ = (qHead_ + 1) % QUEUE;
  qLen_--;
  return e;
}
