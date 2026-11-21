// The pet: stats, age, activity totals, hatching, evolution, sitting nudge, events.
// Pure C++, no Arduino. Rules are in the team brief §4; numbers in config.h.
// All time is in pet seconds. tick() gets 1 per real second, or 60 in demo mode.
#pragma once
#include <stdint.h>
#include "activity.h"

// Values match the S line's form field.
enum class Form : uint8_t { BABY = 0, SPRINTER = 1, FROST = 2, GLITCH = 3, EGG = 9 };

enum class PetEventType : uint8_t { NONE, HATCHED, EVOLVED, HUNGRY, SAD, IDLE, MOVE };

struct PetEvent {
  PetEventType type = PetEventType::NONE;
  uint16_t value = 0;     // EVOLVED: form, IDLE: still minutes
};

class PetState {
public:
  PetState() { reset(); }
  void reset();                                   // new egg
  void tick(uint32_t seconds, Activity activity);
  bool feed();                                    // false while still an egg
  bool play();
  // Judge shortcut: evolve now from the current totals, skipping the age and
  // happiness gates. false if it is an egg or already evolved.
  bool forceEvolve();

  bool pollEvent(PetEvent& out);                  // false when the queue is empty

  uint8_t happiness() const { return happy_; }
  uint8_t energy() const { return energy_; }
  Form form() const { return form_; }
  bool isEgg() const { return form_ == Form::EGG; }
  uint32_t ageSeconds() const { return age_; }
  // Pet seconds in each activity since hatching. Index with (int)Activity.
  uint32_t total(Activity a) const { return totals_[(int)a]; }
  uint32_t stillStreak() const { return stillStreak_; }
  bool shivering() const { return stillStreak_ >= NUDGE_STILL_S; }
  bool hungry() const { return energy_ < LOW_STAT; }
  bool sad() const { return happy_ < LOW_STAT; }
  // Which form the totals point to right now (walk > shake > still on ties).
  Form dominantForm() const;

private:
  void push(PetEventType t, uint16_t v = 0);
  void applyMinute(Activity a);
  void addStat(uint8_t& stat, int delta);
  void checkLowStats();
  void evolve();

  uint8_t happy_, energy_;
  Form form_;
  uint32_t age_;
  uint32_t totals_[3];
  uint32_t minuteAccum_;
  uint32_t stillStreak_;
  uint32_t nextNudgeAt_;
  bool nudged_;
  bool wasHungry_, wasSad_;

  static constexpr uint8_t QUEUE = 8;
  PetEvent queue_[QUEUE];
  uint8_t qHead_, qLen_;
};
