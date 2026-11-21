// Three debounced buttons to GND (INPUT_PULLUP). Short press fires on release;
// a hold past LONG_PRESS_MS fires a long press instead (once, while still held).
#pragma once
#include <stdint.h>

enum class Button : uint8_t { A = 0, B = 1, C = 2 };

class Buttons {
public:
  void begin(int pinA, int pinB, int pinC);
  void update(uint32_t nowMs);
  bool pressed(Button b);       // short press, edge, clears on read
  bool longPressed(Button b);   // long press, edge, clears on read
  bool anyActivity() const { return activity_; }

private:
  int pins_[3];
  bool stable_[3] = {false, false, false};   // true = held down
  bool raw_[3] = {false, false, false};
  uint32_t changedAt_[3] = {0, 0, 0};
  uint32_t downAt_[3] = {0, 0, 0};
  bool longFired_[3] = {false, false, false};
  bool short_[3] = {false, false, false};
  bool long_[3] = {false, false, false};
  bool activity_ = false;
};
