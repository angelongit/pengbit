#include "buzzer.h"
#include <Arduino.h>

// on/off durations in ms, alternating, starting with ON. 0 ends the pattern.
static const uint16_t P_CLICK[]  = {15, 0};
static const uint16_t P_HAPPY[]  = {40, 60, 40, 0};
static const uint16_t P_HATCH[]  = {30, 40, 30, 40, 30, 120, 120, 0};
static const uint16_t P_EVOLVE[] = {60, 60, 60, 60, 60, 60, 300, 0};
static const uint16_t P_HUNGRY[] = {200, 150, 200, 0};
static const uint16_t P_NUDGE[]  = {25, 40, 25, 40, 25, 40, 25, 300, 25, 40, 25, 40, 25, 0};  // shiver
static const uint16_t P_ERROR[]  = {500, 0};

void Buzzer::begin(int pin) {
  pin_ = pin;
  pinMode(pin_, OUTPUT);
  digitalWrite(pin_, LOW);
}

void Buzzer::stop() {
  pattern_ = nullptr;
  if (pin_ >= 0) digitalWrite(pin_, LOW);
}

void Buzzer::play(Chirp c) {
  if (muted_ || pin_ < 0) return;
  switch (c) {
    case Chirp::CLICK:  pattern_ = P_CLICK;  break;
    case Chirp::HAPPY:  pattern_ = P_HAPPY;  break;
    case Chirp::HATCH:  pattern_ = P_HATCH;  break;
    case Chirp::EVOLVE: pattern_ = P_EVOLVE; break;
    case Chirp::HUNGRY: pattern_ = P_HUNGRY; break;
    case Chirp::NUDGE:  pattern_ = P_NUDGE;  break;
    case Chirp::ERROR:  pattern_ = P_ERROR;  break;
  }
  step_ = 0;
  started_ = false;
}

void Buzzer::update(uint32_t now) {
  if (!pattern_) return;
  if (!started_) {
    started_ = true;
    stepAt_ = now;
    digitalWrite(pin_, HIGH);
    return;
  }
  if (now - stepAt_ < pattern_[step_]) return;
  stepAt_ = now;
  step_++;
  if (pattern_[step_] == 0) { stop(); return; }
  digitalWrite(pin_, (step_ % 2 == 0) ? HIGH : LOW);
}
