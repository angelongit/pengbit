#include "ssd1306.h"
#include "config.h"
#include <string.h>

#if USE_LIB_OLED
// Fallback: let Adafruit_SSD1306 do init + transfer, keep our buffer and Gfx.
// In flush(): memcpy(lib.getBuffer(), buf_, BUF_SIZE); lib.display();
#endif

bool Ssd1306::begin() {
  // TODO: send the init table from ARCHITECTURE.md 3.2 (one command() call is fine
  //       if it fits in bus_.maxWrite() - 1, otherwise split it).
  return false;
}

void Ssd1306::clear() {
  memset(buf_, 0, BUF_SIZE);
}

bool Ssd1306::flush() {
  // TODO: set column range 0..127 (0x21) and page range 0..7 (0x22),
  //       then send buf_ in chunks of [0x40, up to bus_.maxWrite() - 1 bytes].
  return false;
}

bool Ssd1306::setContrast(uint8_t level) {
  uint8_t c[2] = {0x81, level};
  return command(c, 2);
}

bool Ssd1306::setPower(bool on) { return command1(on ? 0xAF : 0xAE); }
bool Ssd1306::setInverted(bool inv) { return command1(inv ? 0xA7 : 0xA6); }

bool Ssd1306::command(const uint8_t* cmds, size_t len) {
  // TODO: build [0x00, cmds...] and bus_.write() it.
  (void)cmds; (void)len;
  return false;
}
