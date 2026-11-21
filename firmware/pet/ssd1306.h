// SSD1306 128x64 OLED driver over I2cBus. Owns the 1 KB framebuffer.
// Layout: 8 pages of 8 rows; byte index = x + (y/8)*128, bit = y%8 (LSB on top).
// Rows 0-15 are the yellow band, 16-63 blue.
#pragma once
#include <stdint.h>
#include "i2c_bus.h"

class Ssd1306 {
public:
  static constexpr int WIDTH = 128;
  static constexpr int HEIGHT = 64;
  static constexpr int BUF_SIZE = WIDTH * HEIGHT / 8;

  Ssd1306(I2cBus& bus, uint8_t addr) : bus_(bus), addr_(addr) {}

  bool begin();                       // init sequence; false if the panel does not ACK
  bool ok() const { return ok_; }
  uint8_t* buffer() { return buf_; }
  void clear();                       // framebuffer only
  bool flush();                       // whole framebuffer to the panel
  void setContrast(uint8_t c);        // 0x00..0xFF
  void setInvert(bool on);            // A7 / A6: flash on evolve
  void setPower(bool on);             // AF / AE
  void allOn(bool on);                // A5 test: every pixel lit

private:
  bool command(uint8_t c);
  bool commands(const uint8_t* cmds, uint8_t n);

  I2cBus& bus_;
  uint8_t addr_;
  bool ok_ = false;
  uint8_t buf_[BUF_SIZE];
};
