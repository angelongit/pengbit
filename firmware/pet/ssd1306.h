// SSD1306 128x64 OLED over I2C. Owns the framebuffer. ARCHITECTURE.md section 3.
#pragma once
#include <stdint.h>
#include "i2c_bus.h"

class Ssd1306 {
public:
  static constexpr int WIDTH = 128;
  static constexpr int HEIGHT = 64;
  static constexpr int BUF_SIZE = WIDTH * HEIGHT / 8;   // 1024

  Ssd1306(I2cBus& bus, uint8_t addr) : bus_(bus), addr_(addr) {}

  bool begin();                       // init sequence (3.2), clear, flush
  uint8_t* buffer() { return buf_; }  // page layout: index = x + (y/8)*128, bit = y%8
  void clear();                       // zero the buffer (does not flush)
  bool flush();                       // send the whole buffer (3.4)

  bool setContrast(uint8_t level);    // 0x81, level
  bool setPower(bool on);             // 0xAF / 0xAE
  bool setInverted(bool inv);         // 0xA7 / 0xA6

private:
  bool command(const uint8_t* cmds, size_t len);  // prefix with control byte 0x00
  bool command1(uint8_t c) { return command(&c, 1); }

  I2cBus& bus_;
  uint8_t addr_;
  uint8_t buf_[BUF_SIZE] = {0};
};
