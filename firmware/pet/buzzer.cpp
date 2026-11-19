#include <Arduino.h>
#include "buzzer.h"

void Buzzer::begin(int pin) {
  pin_ = pin;
  pinMode(pin_, OUTPUT);
  digitalWrite(pin_, LOW);
}

void Buzzer::play(Chirp c) {
  // TODO: pick the pattern, start at step 0 (pin HIGH) and set the next step time.
  (void)c;
}

void Buzzer::update(uint32_t nowMs) {
  // TODO: when nowMs passes the next step time, toggle the pin and advance;
  //       at the 0 terminator, pin LOW and stop.
  (void)nowMs;
}
