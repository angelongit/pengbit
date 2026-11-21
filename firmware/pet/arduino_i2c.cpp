#include "arduino_i2c.h"
#include <RingBuffer.h>   // SERIAL_BUFFER_SIZE: Wire's TX/RX ring size on the nRF52 core

void ArduinoI2c::begin(uint32_t clockHz) {
  wire_.begin();            // XIAO: SDA D4, SCL D5
  wire_.setClock(clockHz);
}

// The Seeed nRF52 core's Wire buffers SERIAL_BUFFER_SIZE (64) bytes per transaction.
// Keep a little margin.
size_t ArduinoI2c::maxWrite() const { return SERIAL_BUFFER_SIZE - 2; }

bool ArduinoI2c::write(uint8_t addr, const uint8_t* data, size_t len) {
  wire_.beginTransmission(addr);
  size_t n = wire_.write(data, len);
  return wire_.endTransmission() == 0 && n == len;
}

bool ArduinoI2c::writeRead(uint8_t addr, uint8_t reg, uint8_t* out, size_t len) {
  wire_.beginTransmission(addr);
  wire_.write(reg);
  if (wire_.endTransmission(false) != 0) return false;   // repeated start
  if (wire_.requestFrom(addr, len) != len) return false;
  for (size_t i = 0; i < len; i++) out[i] = wire_.read();
  return true;
}

bool ArduinoI2c::probe(uint8_t addr) {
  wire_.beginTransmission(addr);
  return wire_.endTransmission() == 0;
}
