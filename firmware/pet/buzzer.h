// Non-blocking chirp patterns for the active buzzer on D0 (through an NPN, HIGH = on).
#pragma once
#include <stdint.h>

enum class Chirp : uint8_t { CLICK, HAPPY, HATCH, EVOLVE, HUNGRY, NUDGE, ERROR };

class Buzzer {
public:
  void begin(int pin);
  void play(Chirp c);           // replaces whatever is playing
  void update(uint32_t nowMs);
  bool busy() const { return pattern_ != nullptr; }
  void setMuted(bool m) { muted_ = m; if (m) stop(); }
  bool muted() const { return muted_; }

private:
  void stop();
  int pin_ = -1;
  const uint16_t* pattern_ = nullptr;   // on, off, on, off ... ms, 0-terminated
  uint8_t step_ = 0;
  uint32_t stepAt_ = 0;
  bool started_ = false;
  bool muted_ = false;
};
