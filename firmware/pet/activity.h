// Accel samples (g) -> STILL / WALK / SHAKE per window. Pure C++. ARCHITECTURE.md section 5.
#pragma once
#include <stdint.h>

enum class Activity : uint8_t { STILL = 0, WALK = 1, SHAKE = 2 };

inline char activityCode(Activity a) {   // for the S,... status line
  return a == Activity::WALK ? 'W' : a == Activity::SHAKE ? 'K' : 'I';
}

class ActivityDetector {
public:
  void addSample(float ax, float ay, float az);   // call at ~50 Hz
  bool windowReady();          // true once per finished window, then clears
  Activity result() const { return last_; }       // last finished window
  float lastMean() const { return lastMean_; }    // for tuning on the Serial Plotter
  float lastMax() const { return lastMax_; }

private:
  // TODO: running sum of d, max of d, sample count, ready flag
  float lastMean_ = 0, lastMax_ = 0;
  Activity last_ = Activity::STILL;
};
