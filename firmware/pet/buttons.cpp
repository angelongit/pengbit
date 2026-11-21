#include "buttons.h"
#include <Arduino.h>
#include "config.h"

void Buttons::begin(int a, int b, int c) {
  pins_[0] = a; pins_[1] = b; pins_[2] = c;
  for (int i = 0; i < 3; i++) pinMode(pins_[i], INPUT_PULLUP);
}

void Buttons::update(uint32_t now) {
  activity_ = false;
  for (int i = 0; i < 3; i++) {
    bool down = digitalRead(pins_[i]) == LOW;
    if (down != raw_[i]) { raw_[i] = down; changedAt_[i] = now; }
    if (raw_[i] != stable_[i] && now - changedAt_[i] >= DEBOUNCE_MS) {
      stable_[i] = raw_[i];
      activity_ = true;
      if (stable_[i]) {                 // pressed
        downAt_[i] = now;
        longFired_[i] = false;
      } else if (!longFired_[i]) {      // released before the long-press time
        short_[i] = true;
      }
    }
    if (stable_[i] && !longFired_[i] && now - downAt_[i] >= LONG_PRESS_MS) {
      longFired_[i] = true;
      long_[i] = true;
    }
  }
}

bool Buttons::pressed(Button b) {
  bool r = short_[(int)b];
  short_[(int)b] = false;
  return r;
}

bool Buttons::longPressed(Button b) {
  bool r = long_[(int)b];
  long_[(int)b] = false;
  return r;
}
