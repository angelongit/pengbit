// The pet: stats, age, activity tally, evolution, events. Pure C++. ARCHITECTURE.md section 6.
#pragma once
#include <stdint.h>
#include "activity.h"

enum class Form : uint8_t { EGG = 0xFF, BABY = 0, SPRINTER = 1, FROST = 2, GLITCH = 3 };

enum class PetEvent : uint8_t { NONE, HATCHED, EVOLVED, HUNGRY, SAD };

class PetState {
public:
  void reset();                                   // new egg
  void tick(uint32_t seconds, Activity activity); // seconds = 1, or 60 in demo mode
  void feed();
  void play();

  PetEvent pollEvent();                           // NONE when the queue is empty

  uint8_t happiness() const { return happiness_; }
  uint8_t energy() const { return energy_; }
  Form form() const { return form_; }
  uint32_t ageSeconds() const { return age_; }

private:
  void push(PetEvent e);
  void checkEvolution();                          // HATCH_AGE_S, EVOLVE_AGE_S, pick by max tally

  uint8_t happiness_ = 80, energy_ = 80;
  Form form_ = Form::EGG;
  uint32_t age_ = 0;
  uint32_t tally_[3] = {0, 0, 0};                 // seconds in STILL, WALK, SHAKE
  uint32_t minuteAccum_ = 0;                      // seconds toward the next per-minute rule

  static constexpr int QUEUE = 4;
  PetEvent queue_[QUEUE] = {};
  uint8_t qHead_ = 0, qLen_ = 0;
};
