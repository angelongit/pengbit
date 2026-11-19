#include "gfx.h"

// TODO: 5x7 font table (96 printable chars x 5 column bytes). Generate it with a script
// or take the glcdfont table from Adafruit GFX (BSD licence, keep the notice). It's data,
// not driver logic, so copying it is fine.

void Gfx::pixel(int x, int y, bool on) {
  // TODO: bounds check, then set/clear bit (y % 8) of buffer[x + (y / 8) * 128]
  (void)x; (void)y; (void)on;
}

void Gfx::hline(int x, int y, int w, bool on) { for (int i = 0; i < w; i++) pixel(x + i, y, on); }

void Gfx::rect(int x, int y, int w, int h) {
  hline(x, y, w);
  hline(x, y + h - 1, w);
  for (int j = 0; j < h; j++) { pixel(x, y + j); pixel(x + w - 1, y + j); }
}

void Gfx::fillRect(int x, int y, int w, int h, bool on) { for (int j = 0; j < h; j++) hline(x, y + j, w, on); }

void Gfx::bar(int x, int y, int w, int h, uint8_t percent) {
  // TODO: rect outline + fillRect of the inside scaled by percent
  (void)x; (void)y; (void)w; (void)h; (void)percent;
}

void Gfx::sprite(int x, int y, const uint8_t* data, int w, int h) {
  // TODO: for each column and page, test each bit and pixel() it (simple version first;
  //       a byte-copy fast path when y % 8 == 0 is a nice optimisation later)
  (void)x; (void)y; (void)data; (void)w; (void)h;
}

void Gfx::text(int x, int y, const char* s) {
  // TODO: for each char, draw its 5 font columns, then 1 blank column
  (void)x; (void)y; (void)s;
}
