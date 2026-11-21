// Edge Impulse classifier. Only compiled in when USE_ML_CLASSIFIER is 1.
//
// To use it:
//  1. Edge Impulse Studio > Deployment > Arduino library > Build, download the zip.
//  2. Arduino IDE > Sketch > Include Library > Add .ZIP Library.
//  3. Set EI_HEADER below to the header the zip provides (<project_name>_inferencing.h).
//  4. Set USE_ML_CLASSIFIER 1 in config.h.
// The model must be trained on the same stream the RAW mode prints: x,y,z in g
// at 50 Hz, 2 s windows. Labels must be walk, still and shake (any case).
#include "config.h"
#include "activity_ml.h"

#if USE_ML_CLASSIFIER
#define EI_HEADER <pengbit_inferencing.h>
#include EI_HEADER
#include <string.h>
#include <strings.h>

static_assert(EI_CLASSIFIER_RAW_SAMPLES_PER_FRAME == 3, "model must take 3 axes (x, y, z)");

class EiClassifier : public Classifier {
public:
  Classification classify(const float* xyz, uint16_t n) override {
    // The model wants EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE floats. Use the newest
    // samples if our window is longer, zero-pad if it is shorter.
    static float input[EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE];
    const size_t want = EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE;
    const size_t have = (size_t)n * 3;
    memset(input, 0, sizeof(input));
    if (have >= want) memcpy(input, xyz + (have - want), want * sizeof(float));
    else memcpy(input, xyz, have * sizeof(float));

    signal_t signal;
    numpy::signal_from_buffer(input, want, &signal);
    ei_impulse_result_t result = {0};
    Classification c;
    if (run_classifier(&signal, &result, false) != EI_IMPULSE_OK) {
      c.act = Activity::STILL;
      c.conf = 0;
      return c;
    }
    float best = -1;
    for (size_t i = 0; i < EI_CLASSIFIER_LABEL_COUNT; i++) {
      float v = result.classification[i].value;
      if (v <= best) continue;
      const char* l = result.classification[i].label;
      Activity a;
      if (!strcasecmp(l, "walk") || !strcasecmp(l, "walking")) a = Activity::WALK;
      else if (!strcasecmp(l, "shake") || !strcasecmp(l, "shaking")) a = Activity::SHAKE;
      else if (!strcasecmp(l, "still") || !strcasecmp(l, "idle")) a = Activity::STILL;
      else continue;   // unknown label: ignore it
      best = v;
      c.act = a;
    }
    c.conf = best < 0 ? 0 : (uint8_t)(best * 100.0f + 0.5f);
    return c;
  }
  bool isModel() const override { return true; }
};

Classifier* mlClassifier() {
  static EiClassifier ei;
  return &ei;
}

#else
Classifier* mlClassifier() { return nullptr; }
#endif
