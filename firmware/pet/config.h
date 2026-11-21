// Pengbit config: pins, addresses, timings, thresholds, pet rules, fallback switches.
// Every number you might want to tune lives here. Source of truth for the rules is
// the team brief, section 4 (pet design) and section 8 (BLE protocol).
#pragma once
#include <stdint.h>

// ---------------------------------------------------------------- versions
#define PROTO_VERSION  1
#define FW_VERSION     "0.4"

// ---------------------------------------------------------------- fallback switches
// 0 = our own SSD1306 driver. 1 = Adafruit_SSD1306 does init + transfer, our
// framebuffer, Gfx and UI stay the same. Needs the "Adafruit SSD1306" library.
#define USE_LIB_OLED       0
// 0 = threshold detector. 1 = Edge Impulse model (see activity_ml.cpp).
#define USE_ML_CLASSIFIER  0

// ---------------------------------------------------------------- pins
// Pin numbers like D0 come from the Arduino core, so they are set in pet.ino:
//   D0 buzzer (NPN), D1 button A (menu), D2 button B (select), D3 button C (demo)
//   D4 SDA, D5 SCL: OLED and MPU share Wire.

// ---------------------------------------------------------------- I2C
constexpr uint8_t  OLED_ADDR     = 0x3C;
constexpr uint8_t  IMU_ADDR      = 0x68;   // 0x69 tried too if AD0 is high
constexpr uint32_t I2C_CLOCK_HZ  = 400000;

// ---------------------------------------------------------------- timing (ms)
constexpr uint32_t IMU_PERIOD_MS     = 20;     // 50 Hz
constexpr uint32_t TICK_PERIOD_MS    = 1000;   // pet tick + S line
constexpr uint32_t TOTALS_PERIOD_MS  = 5000;   // T line
constexpr uint32_t FRAME_PERIOD_MS   = 66;     // ~15 fps (flush skipped when nothing changed)
constexpr uint32_t ANIM_PERIOD_MS    = 500;    // idle animation frame swap
constexpr uint32_t DEBOUNCE_MS       = 25;
constexpr uint32_t LONG_PRESS_MS     = 1500;   // hold C = judge shortcut (evolve now)
constexpr uint32_t MENU_TIMEOUT_MS   = 5000;   // menu hides after this long idle
constexpr uint32_t EVOLVE_ANIM_MS    = 3000;
constexpr uint32_t IMU_RETRY_MS      = 2000;   // re-init a missing IMU this often

// ---------------------------------------------------------------- time
constexpr uint32_t DEMO_SPEEDUP = 60;          // demo mode: 1 real s = 60 pet s

// Units on the link for the S age and T totals. 1 = pet seconds, 0 = pet minutes.
// Internally everything is pet seconds. Values are clamped to 99999 so every
// line stays within 20 bytes.
#define LINK_TIME_SECONDS 1

// ---------------------------------------------------------------- activity (g)
constexpr uint16_t ACT_WINDOW_SAMPLES = 100;   // 2 s at 50 Hz
constexpr float    ACT_SHAKE_MAX      = 1.2f;  // peak |m - 1g|
constexpr float    ACT_SHAKE_MEAN     = 0.6f;  // mean |m - 1g|
constexpr float    ACT_WALK_MEAN      = 0.08f;

// ---------------------------------------------------------------- pet rules (brief §4)
constexpr uint8_t  STAT_START        = 80;
constexpr uint8_t  LOW_STAT          = 20;     // HUNGRY / SAD below this
constexpr uint8_t  FEED_ENERGY       = 20;
constexpr uint8_t  PLAY_HAPPY        = 15;
constexpr uint8_t  PLAY_ENERGY       = 5;

// Per pet minute. Baseline applies every minute; the activity delta is added on top.
constexpr int8_t   BASE_HAPPY        = -1;
constexpr int8_t   BASE_ENERGY       = -1;
constexpr int8_t   WALK_HAPPY        = +2;
constexpr int8_t   WALK_ENERGY       = -2;
constexpr int8_t   STILL_HAPPY       = 0;
constexpr int8_t   STILL_ENERGY      = +2;
constexpr int8_t   SHAKE_HAPPY       = -1;
constexpr int8_t   SHAKE_ENERGY      = -1;

constexpr uint32_t HATCH_AGE_S       = 5 * 60;        // 5 pet minutes
constexpr uint32_t EVOLVE_AGE_S      = 600 * 60;      // 600 pet minutes (~10 real min in demo)
constexpr uint8_t  EVOLVE_MIN_HAPPY  = 30;

// Sitting nudge: shiver + chirp + E,IDLE after this long still, then every NUDGE_REPEAT_S.
constexpr uint32_t NUDGE_STILL_S     = 45 * 60;
constexpr uint32_t NUDGE_REPEAT_S    = 30 * 60;
