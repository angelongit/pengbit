// LSM6DS3TR-C accelerometer over I2C. ARCHITECTURE.md section 4.
#pragma once
#include <stdint.h>
#include "i2c_bus.h"

struct AccelSample {
  int16_t x, y, z;   // raw, 0.122 mg/LSB at +-4 g
};

class Lsm6ds3 {
public:
  // Registers
  static constexpr uint8_t REG_WHO_AM_I  = 0x0F;
  static constexpr uint8_t REG_CTRL1_XL  = 0x10;
  static constexpr uint8_t REG_CTRL2_G   = 0x11;
  static constexpr uint8_t REG_CTRL3_C   = 0x12;
  static constexpr uint8_t REG_STATUS    = 0x1E;
  static constexpr uint8_t REG_OUTX_L_XL = 0x28;

  static constexpr float G_PER_LSB = 0.000122f;   // +-4 g

  Lsm6ds3(I2cBus& bus, uint8_t addr) : bus_(bus), addr_(addr) {}

  // Before calling: power pin HIGH and ~10 ms wait (done in pet.ino, it's board-specific).
  bool begin();                          // reset, check WHO_AM_I, CTRL3_C, CTRL1_XL, CTRL2_G
  uint8_t whoAmI();                      // 0x6A (TR-C) or 0x69 (original), 0 on error
  bool dataReady();                      // STATUS bit 0 (XLDA)
  bool readAccel(AccelSample& out);      // 6-byte burst from OUTX_L_XL, little-endian

  static float toG(int16_t raw) { return raw * G_PER_LSB; }

private:
  I2cBus& bus_;
  uint8_t addr_;
};
