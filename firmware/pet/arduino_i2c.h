// I2cBus on top of Arduino TwoWire. The only file that touches Wire.
#pragma once
#include <Wire.h>
#include "i2c_bus.h"

class ArduinoI2c : public I2cBus {
public:
  explicit ArduinoI2c(TwoWire& wire) : wire_(wire) {}
  void begin(uint32_t clockHz);
  bool write(uint8_t addr, const uint8_t* data, size_t len) override;
  bool writeRead(uint8_t addr, uint8_t reg, uint8_t* out, size_t len) override;
  size_t maxWrite() const override;
  bool probe(uint8_t addr) override;

private:
  TwoWire& wire_;
};
