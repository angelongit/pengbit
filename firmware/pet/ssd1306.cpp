#include "ssd1306.h"
#include "config.h"
#include <string.h>

#if USE_LIB_OLED
// Fallback: the library does init + transfer. Our framebuffer stays the source of truth.
#include <Wire.h>
#include <Adafruit_SSD1306.h>
static Adafruit_SSD1306 libOled(128, 64, &Wire, -1);
#endif

static constexpr uint8_t CTRL_CMD  = 0x00;   // rest of transaction = commands
static constexpr uint8_t CTRL_DATA = 0x40;   // rest of transaction = display RAM

static const uint8_t INIT_SEQ[] = {
  0xAE,         // display off while configuring
  0xD5, 0x80,   // clock divide / osc
  0xA8, 0x3F,   // multiplex 64
  0xD3, 0x00,   // display offset 0
  0x40,         // start line 0
  0x8D, 0x14,   // charge pump ON (required on these modules)
  0x20, 0x00,   // horizontal addressing: one flush streams all 1024 bytes
  0xA1,         // segment remap (if mirrored left-right, use 0xA0)
  0xC8,         // COM scan descending (if upside down, use 0xC0)
  0xDA, 0x12,   // COM pins for 128x64
  0x81, 0xCF,   // contrast
  0xD9, 0xF1,   // pre-charge for internal pump
  0xDB, 0x40,   // VCOMH
  0xA4,         // show RAM
  0xA6,         // not inverted
  0x2E,         // scroll off
  0xAF,         // display on
};

bool Ssd1306::command(uint8_t c) {
  uint8_t b[2] = {CTRL_CMD, c};
  return bus_.write(addr_, b, 2);
}

bool Ssd1306::commands(const uint8_t* cmds, uint8_t n) {
  uint8_t b[32];
  b[0] = CTRL_CMD;
  if (n > sizeof(b) - 1) return false;
  memcpy(b + 1, cmds, n);
  return bus_.write(addr_, b, n + 1);
}

bool Ssd1306::begin() {
  clear();
#if USE_LIB_OLED
  ok_ = libOled.begin(SSD1306_SWITCHCAPVCC, addr_);
  return ok_;
#else
  if (!bus_.probe(addr_)) { ok_ = false; return false; }
  // Send in small groups so it works with any Wire buffer size.
  ok_ = commands(INIT_SEQ, 12) && commands(INIT_SEQ + 12, sizeof(INIT_SEQ) - 12);
  if (ok_) flush();
  return ok_;
#endif
}

void Ssd1306::clear() { memset(buf_, 0, sizeof(buf_)); }

bool Ssd1306::flush() {
#if USE_LIB_OLED
  if (!ok_) return false;
  memcpy(libOled.getBuffer(), buf_, BUF_SIZE);
  libOled.display();
  return true;
#else
  static const uint8_t window[] = {0x21, 0x00, 0x7F,   // columns 0..127
                                   0x22, 0x00, 0x07};  // pages 0..7
  if (!commands(window, sizeof(window))) { ok_ = false; return false; }
  size_t chunk = bus_.maxWrite() - 1;                  // minus the control byte
  if (chunk > 32) chunk = 32;
  uint8_t b[33];
  b[0] = CTRL_DATA;
  for (size_t i = 0; i < BUF_SIZE; i += chunk) {
    size_t n = (BUF_SIZE - i < chunk) ? BUF_SIZE - i : chunk;
    memcpy(b + 1, buf_ + i, n);
    if (!bus_.write(addr_, b, n + 1)) { ok_ = false; return false; }
  }
  ok_ = true;
  return true;
#endif
}

void Ssd1306::setContrast(uint8_t c) {
#if USE_LIB_OLED
  libOled.ssd1306_command(0x81); libOled.ssd1306_command(c);
#else
  uint8_t b[] = {0x81, c};
  commands(b, 2);
#endif
}

void Ssd1306::setInvert(bool on) {
#if USE_LIB_OLED
  libOled.invertDisplay(on);
#else
  command(on ? 0xA7 : 0xA6);
#endif
}

void Ssd1306::setPower(bool on) {
#if USE_LIB_OLED
  libOled.ssd1306_command(on ? 0xAF : 0xAE);
#else
  command(on ? 0xAF : 0xAE);
#endif
}

void Ssd1306::allOn(bool on) {
#if USE_LIB_OLED
  libOled.ssd1306_command(on ? 0xA5 : 0xA4);
#else
  command(on ? 0xA5 : 0xA4);
#endif
}
