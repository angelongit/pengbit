// Accel samples (g) -> STILL / WALK / SHAKE once per 2 s window. Pure C++, no Arduino.
// The detector only collects the window; a Classifier decides. The threshold
// classifier is the default and the fallback; the Edge Impulse model
// (activity_ml.cpp, USE_ML_CLASSIFIER 1) plugs into the same interface.
#pragma once
#include <stdint.h>
#include "config.h"

enum class Activity : uint8_t { STILL = 0, WALK = 1, SHAKE = 2 };

// Codes for the S and M lines: W walk, I still (idle), K shake.
inline char activityCode(Activity a) {
  return a == Activity::WALK ? 'W' : a == Activity::SHAKE ? 'K' : 'I';
}
inline const char* activityName(Activity a) {
  return a == Activity::WALK ? "WALK" : a == Activity::SHAKE ? "SHAKE" : "STILL";
}

struct Classification {
  Activity act = Activity::STILL;
  uint8_t conf = 100;   // 0..100
};

class Classifier {
public:
  virtual ~Classifier() {}
  // xyz: n samples interleaved x0,y0,z0,x1,... in g.
  virtual Classification classify(const float* xyz, uint16_t n) = 0;
  virtual bool isModel() const { return false; }   // true = send M lines
};

class ThresholdClassifier : public Classifier {
public:
  Classification classify(const float* xyz, uint16_t n) override;
};

class ActivityDetector {
public:
  ActivityDetector();
  void setClassifier(Classifier* c) { classifier_ = c; }
  void addSample(float ax, float ay, float az);   // call at ~50 Hz
  bool windowReady();          // true once per finished window, then clears
  Activity result() const { return last_.act; }   // last finished window
  uint8_t confidence() const { return last_.conf; }
  bool usingModel() const { return classifier_ && classifier_->isModel(); }
  // Stats of the last window, always computed (Serial Plotter tuning, both classifiers).
  float lastMean() const { return lastMean_; }
  float lastMax() const { return lastMax_; }
  void reset();

  // Mean and max of |magnitude - 1 g| over a window.
  static void deviation(const float* xyz, uint16_t n, float& mean, float& peak);

private:
  float window_[ACT_WINDOW_SAMPLES * 3];
  uint16_t count_ = 0;
  bool ready_ = false;
  Classification last_;
  float lastMean_ = 0, lastMax_ = 0;
  ThresholdClassifier threshold_;
  Classifier* classifier_;
};
