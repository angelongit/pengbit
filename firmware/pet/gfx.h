// Drawing into the SSD1306 framebuffer: pixels, rects, bars, 1-bit sprites, 5x7 text.
// Pure C++ (no Arduino), so the UI can be rendered on a laptop for previews.
#pragma once
#include <stdint.h>

class Gfx {
public:
  static constexpr int W = 128, H = 64;
  explicit Gfx(uint8_t* buf) : buf_(buf) {}

  void clear();
  void pixel(int x, int y, bool on = true);
  bool get(int x, int y) const;
  void hline(int x, int y, int w, bool on = true);
  void vline(int x, int y, int h, bool on = true);
  void rect(int x, int y, int w, int h, bool on = true);
  void fillRect(int x, int y, int w, int h, bool on = true);
  void invertRect(int x, int y, int w, int h);
  // Outlined bar, filled to value/100.
  void bar(int x, int y, int w, int h, uint8_t value);
  // 1-bit bitmap, horizontal rows, MSB = leftmost pixel (image2cpp format).
  // Only 1-bits are drawn. flipX mirrors it. shiftRows: per-row x offset (glitch effect).
  void sprite(int x, int y, const uint8_t* bmp, int w, int h, bool flipX = false,
              const int8_t* shiftRows = nullptr);
  // 5x7 text, 6 px per char. scale 1 or 2. Returns the width drawn.
  int text(int x, int y, const char* s, int scale = 1, bool on = true);
  static int textWidth(const char* s, int scale = 1);

private:
  uint8_t* buf_;
};
