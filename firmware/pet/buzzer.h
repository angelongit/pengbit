// Active buzzer on D0 through an NPN. Non-blocking patterns: no delay().
#pragma once
#include <stdint.h>

enum class Chirp : uint8_t { CLICK, HAPPY, HUNGRY, HATCH, EVOLVE };

class Buzzer {
public:
  void begin(int pin);
  void play(Chirp c);            // replaces whatever is playing
  void update(uint32_t nowMs);   // call every loop
  void setMuted(bool m) { muted_ = m; }

private:
  // A pattern is a list of on/off durations in ms, ending in 0.
  // TODO: tables for each Chirp, index into the current one, time of the next step
  int pin_ = -1;
  bool muted_ = false;
};
