// Edge Impulse activity model behind the Classifier interface.
// USE_ML_CLASSIFIER 0 (config.h): mlClassifier() returns nullptr and nothing
// from Edge Impulse is compiled. 1: include the exported Arduino library.
#pragma once
#include "activity.h"

Classifier* mlClassifier();
