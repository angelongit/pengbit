#include "activity.h"
#include <math.h>

void ActivityDetector::deviation(const float* xyz, uint16_t n, float& mean, float& peak) {
  float sum = 0, mx = 0;
  for (uint16_t i = 0; i < n; i++) {
    float x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
    float d = fabsf(sqrtf(x * x + y * y + z * z) - 1.0f);
    sum += d;
    if (d > mx) mx = d;
  }
  mean = n ? sum / n : 0;
  peak = mx;
}

Classification ThresholdClassifier::classify(const float* xyz, uint16_t n) {
  float mean, peak;
  ActivityDetector::deviation(xyz, n, mean, peak);
  Classification c;
  if (peak > ACT_SHAKE_MAX || mean > ACT_SHAKE_MEAN) c.act = Activity::SHAKE;
  else if (mean > ACT_WALK_MEAN) c.act = Activity::WALK;
  else c.act = Activity::STILL;
  c.conf = 100;
  return c;
}

ActivityDetector::ActivityDetector() : classifier_(&threshold_) {}

void ActivityDetector::reset() {
  count_ = 0;
  ready_ = false;
  last_ = Classification();
}

void ActivityDetector::addSample(float ax, float ay, float az) {
  window_[count_ * 3] = ax;
  window_[count_ * 3 + 1] = ay;
  window_[count_ * 3 + 2] = az;
  if (++count_ < ACT_WINDOW_SAMPLES) return;
  deviation(window_, count_, lastMean_, lastMax_);
  last_ = (classifier_ ? classifier_ : &threshold_)->classify(window_, count_);
  count_ = 0;
  ready_ = true;
}

bool ActivityDetector::windowReady() {
  bool r = ready_;
  ready_ = false;
  return r;
}
