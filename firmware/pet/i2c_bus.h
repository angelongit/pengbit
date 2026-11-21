// Abstract I2C bus. Drivers only see this, so a Zephyr port swaps one file.
#pragma once
#include <stdint.h>
#include <stddef.h>

class I2cBus {
public:
  virtual ~I2cBus() {}
  // Write len bytes to addr in one transaction. false on NACK.
  virtual bool write(uint8_t addr, const uint8_t* data, size_t len) = 0;
  // Write the register address, repeated start, read len bytes. false on NACK / short read.
  virtual bool writeRead(uint8_t addr, uint8_t reg, uint8_t* out, size_t len) = 0;
  // Largest write() payload the bus can take in one transaction.
  virtual size_t maxWrite() const = 0;
  // true if a device ACKs its address.
  virtual bool probe(uint8_t addr) = 0;
};
