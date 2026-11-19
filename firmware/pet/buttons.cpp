#include <Arduino.h>
#include "buttons.h"
#include "config.h"

void Buttons::begin(int pinA, int pinB, int pinC) {
  pins_[0] = pinA; pins_[1] = pinB; pins_[2] = pinC;
  for (int i = 0; i < 3; i++) pinMode(pins_[i], INPUT_PULLUP);
}

void Buttons::update(uint32_t nowMs) {
  // TODO: for each button, read (LOW = down). If raw changed, note the time.
  //       If raw has been steady for DEBOUNCE_MS and differs from stable_, update stable_;
  //       on a not-down -> down change, set event_.
  (void)nowMs;
}

bool Buttons::pressed(Button b) {
  int i = (int)b;
  bool e = event_[i];
  event_[i] = false;
  return e;
}
