#include "gfx.h"
#include "font5x7.h"
#include <string.h>

void Gfx::clear() { memset(buf_, 0, W * H / 8); }

void Gfx::pixel(int x, int y, bool on) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  uint8_t& b = buf_[x + (y >> 3) * W];
  uint8_t m = 1 << (y & 7);
  if (on) b |= m; else b &= ~m;
}

bool Gfx::get(int x, int y) const {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  return buf_[x + (y >> 3) * W] & (1 << (y & 7));
}

void Gfx::hline(int x, int y, int w, bool on) { for (int i = 0; i < w; i++) pixel(x + i, y, on); }
void Gfx::vline(int x, int y, int h, bool on) { for (int i = 0; i < h; i++) pixel(x, y + i, on); }

void Gfx::rect(int x, int y, int w, int h, bool on) {
  hline(x, y, w, on); hline(x, y + h - 1, w, on);
  vline(x, y, h, on); vline(x + w - 1, y, h, on);
}

void Gfx::fillRect(int x, int y, int w, int h, bool on) {
  for (int j = 0; j < h; j++) hline(x, y + j, w, on);
}

void Gfx::invertRect(int x, int y, int w, int h) {
  for (int j = 0; j < h; j++)
    for (int i = 0; i < w; i++) pixel(x + i, y + j, !get(x + i, y + j));
}

void Gfx::bar(int x, int y, int w, int h, uint8_t value) {
  if (value > 100) value = 100;
  rect(x, y, w, h);
  int fill = (w - 2) * value / 100;
  fillRect(x + 1, y + 1, fill, h - 2);
}

void Gfx::sprite(int x, int y, const uint8_t* bmp, int w, int h, bool flipX,
                 const int8_t* shiftRows) {
  int stride = (w + 7) / 8;
  for (int j = 0; j < h; j++) {
    int dx = shiftRows ? shiftRows[j] : 0;
    for (int i = 0; i < w; i++) {
      int si = flipX ? (w - 1 - i) : i;
      if (bmp[j * stride + (si >> 3)] & (0x80 >> (si & 7))) pixel(x + i + dx, y + j);
    }
  }
}

int Gfx::text(int x, int y, const char* s, int scale, bool on) {
  int x0 = x;
  for (; *s; s++) {
    unsigned char c = (unsigned char)*s;
    if (c < 0x20 || c > 0x7E) c = '?';
    const uint8_t* g = FONT5X7[c - 0x20];
    for (int col = 0; col < 5; col++)
      for (int row = 0; row < 8; row++)
        if (g[col] & (1 << row))
          for (int sy = 0; sy < scale; sy++)
            for (int sx = 0; sx < scale; sx++)
              pixel(x + col * scale + sx, y + row * scale + sy, on);
    x += 6 * scale;
  }
  return x - x0;
}

int Gfx::textWidth(const char* s, int scale) { return (int)strlen(s) * 6 * scale; }
