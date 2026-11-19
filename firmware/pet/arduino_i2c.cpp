#include "arduino_i2c.h"

void ArduinoI2c::begin(uint32_t clockHz) {
  // TODO: start the bus and set the clock.
  (void)clockHz;
}

bool ArduinoI2c::write(uint8_t addr, const uint8_t* data, size_t len) {
  // TODO: beginTransmission(addr), write(data, len), endTransmission() == 0
  (void)addr; (void)data; (void)len;
  return false;
}

bool ArduinoI2c::writeRead(uint8_t addr, uint8_t reg, uint8_t* out, size_t len) {
  // TODO: beginTransmission, write(reg), endTransmission(false) for a repeated start,
  //       then requestFrom(addr, len) and read() each byte. False if fewer bytes arrive.
  (void)addr; (void)reg; (void)out; (void)len;
  return false;
}
