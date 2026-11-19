// I2cBus on top of Arduino's TwoWire. The only file in the driver stack that includes Wire.h.
#pragma once
#include <Wire.h>
#include "i2c_bus.h"

class ArduinoI2c : public I2cBus {
public:
  explicit ArduinoI2c(TwoWire& wire) : wire_(wire) {}

  void begin(uint32_t clockHz);   // wire_.begin(); wire_.setClock(clockHz);

  bool write(uint8_t addr, const uint8_t* data, size_t len) override;
  bool writeRead(uint8_t addr, uint8_t reg, uint8_t* out, size_t len) override;
  size_t maxWrite() const override { return 32; }  // TODO: check the core's Wire.h buffer size

private:
  TwoWire& wire_;
};
