// Three active-low buttons with debounce and press (falling edge) events.
#pragma once
#include <stdint.h>

enum class Button : uint8_t { A = 0, B = 1, C = 2 };

class Buttons {
public:
  void begin(int pinA, int pinB, int pinC);   // INPUT_PULLUP
  void update(uint32_t nowMs);                // call every loop
  bool pressed(Button b);                     // true once per press, then clears

private:
  int pins_[3] = {-1, -1, -1};
  bool stable_[3] = {false, false, false};    // true = held down
  bool raw_[3] = {false, false, false};
  uint32_t changedAt_[3] = {0, 0, 0};
  bool event_[3] = {false, false, false};
};
