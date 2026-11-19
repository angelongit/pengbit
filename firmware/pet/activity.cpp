#include "activity.h"
#include "config.h"
#include <math.h>

void ActivityDetector::addSample(float ax, float ay, float az) {
  // TODO:
  //   d = fabsf(sqrtf(ax*ax + ay*ay + az*az) - 1.0f)
  //   accumulate sum and max; after ACT_WINDOW_SAMPLES samples, classify with the
  //   ACT_* thresholds from config.h, store lastMean_/lastMax_/last_, reset, set ready.
  (void)ax; (void)ay; (void)az;
}

bool ActivityDetector::windowReady() {
  // TODO: return the ready flag and clear it.
  return false;
}
