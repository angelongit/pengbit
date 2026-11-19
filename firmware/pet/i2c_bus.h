// Abstract I2C bus. Drivers only see this, so a Zephyr port swaps one file.
#pragma once
#include <stdint.h>
#include <stddef.h>

class I2cBus {
public:
  virtual ~I2cBus() = default;

  // One transaction: START, addr+W, data[0..len-1], STOP. False on NACK.
  virtual bool write(uint8_t addr, const uint8_t* data, size_t len) = 0;

  // Register read: START, addr+W, reg, REPEATED START, addr+R, len bytes, STOP.
  virtual bool writeRead(uint8_t addr, uint8_t reg, uint8_t* out, size_t len) = 0;

  // Largest `len` write() can take in one go (Wire's TX buffer size).
  virtual size_t maxWrite() const = 0;

  // Convenience: write one register.
  bool writeReg(uint8_t addr, uint8_t reg, uint8_t value) {
    uint8_t buf[2] = {reg, value};
    return write(addr, buf, 2);
  }
};
