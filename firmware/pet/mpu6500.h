// MPU-6500 / 9250 / 9255 / 6050 accelerometer driver over I2cBus (accel only).
// Shares Wire (D4/D5) with the OLED at 0x68 (0x69 if AD0 is high).
#pragma once
#include <stdint.h>
#include "i2c_bus.h"

struct AccelSample { int16_t x, y, z; };

class Mpu6500 {
public:
  explicit Mpu6500(I2cBus& bus) : bus_(bus) {}
  // Wake, identify, ±4 g, gyro off. Tries addr then addr+1. false if nothing answers.
  bool begin(uint8_t addr);
  bool ok() const { return ok_; }
  uint8_t whoAmI() const { return who_; }
  uint8_t address() const { return addr_; }
  const char* chipName() const;
  bool readAccel(AccelSample& s);       // false on bus error (marks the driver not ok)
  static float toG(int16_t raw) { return raw * (1.0f / 8192.0f); }   // ±4 g range

private:
  bool writeReg(uint8_t reg, uint8_t val);
  bool tryInit(uint8_t addr);

  I2cBus& bus_;
  uint8_t addr_ = 0;
  uint8_t who_ = 0;
  bool ok_ = false;
};
