// Pengbit config: pins, addresses, timings, thresholds, fallback switches.
// Change values here, not in the modules.
#pragma once
#include <stdint.h>

// ---- Fallback switches (see ARCHITECTURE.md section 8) ----
// 0 = our own driver, 1 = wrap the Adafruit / Seeed library behind the same class.
#define USE_LIB_OLED 0
#define USE_LIB_IMU  0

// ---- Pins (docs/wiring.md) ----
// Pin numbers like D0 come from the Arduino core, so they are filled in pet.ino.
//   D0 buzzer, D1 button A (menu), D2 button B (select), D3 button C (demo)
//   D4 SDA, D5 SCL (Wire, OLED)

// ---- I2C ----
constexpr uint8_t  OLED_ADDR   = 0x3C;
constexpr uint8_t  IMU_ADDR    = 0x6A;
constexpr uint32_t I2C_CLOCK_HZ = 400000;

// ---- Timing (ms) ----
constexpr uint32_t IMU_PERIOD_MS    = 20;    // 50 Hz
constexpr uint32_t TICK_PERIOD_MS   = 1000;  // pet tick + status line
constexpr uint32_t FRAME_PERIOD_MS  = 66;    // ~15 fps max
constexpr uint32_t DEBOUNCE_MS      = 25;
constexpr uint32_t DEMO_SPEEDUP     = 60;

// ---- Activity thresholds (g). Tune with the Serial Plotter. ----
constexpr uint16_t ACT_WINDOW_SAMPLES = 100;   // 2 s at 50 Hz
constexpr float    ACT_SHAKE_MAX      = 1.2f;
constexpr float    ACT_SHAKE_MEAN     = 0.6f;
constexpr float    ACT_WALK_MEAN      = 0.08f;

// ---- Pet rules (ARCHITECTURE.md section 6) ----
constexpr uint32_t HATCH_AGE_S    = 2 * 60;
constexpr uint32_t EVOLVE_AGE_S   = 30 * 60;
constexpr uint8_t  EVOLVE_MIN_HAPPY = 30;
constexpr uint8_t  LOW_STAT       = 20;     // HUNGRY / SAD below this
constexpr uint8_t  FEED_ENERGY    = 20;
constexpr uint8_t  PLAY_HAPPY     = 15;
constexpr uint8_t  PLAY_ENERGY    = 5;
