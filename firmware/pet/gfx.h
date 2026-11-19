// Drawing into the Ssd1306 framebuffer. No I2C here; call oled.flush() after drawing.
#pragma once
#include <stdint.h>
#include "ssd1306.h"

class Gfx {
public:
  explicit Gfx(Ssd1306& oled) : oled_(oled) {}

  void pixel(int x, int y, bool on = true);          // clip to 128x64
  void hline(int x, int y, int w, bool on = true);
  void rect(int x, int y, int w, int h);
  void fillRect(int x, int y, int w, int h, bool on = true);
  void bar(int x, int y, int w, int h, uint8_t percent);   // outlined stat bar

  // Sprite format: same as the OLED pages (column bytes, LSB on top), h a multiple of 8.
  // Matching the hardware layout makes byte-aligned sprites a straight copy.
  void sprite(int x, int y, const uint8_t* data, int w, int h);

  void text(int x, int y, const char* s);            // 5x7 font, 6 px per char

private:
  Ssd1306& oled_;
};
