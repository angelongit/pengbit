#include "mpu6500.h"

// Registers (same on MPU-6050 / 6500 / 9250 / 9255 for what we use)
static constexpr uint8_t REG_SMPLRT_DIV   = 0x19;
static constexpr uint8_t REG_CONFIG       = 0x1A;
static constexpr uint8_t REG_ACCEL_CONFIG = 0x1C;
static constexpr uint8_t REG_ACCEL_CONFIG2= 0x1D;   // 6500/9250 only: accel low-pass
static constexpr uint8_t REG_ACCEL_XOUT_H = 0x3B;
static constexpr uint8_t REG_PWR_MGMT_1   = 0x6B;
static constexpr uint8_t REG_PWR_MGMT_2   = 0x6C;
static constexpr uint8_t REG_WHO_AM_I     = 0x75;

bool Mpu6500::writeReg(uint8_t reg, uint8_t val) {
  uint8_t b[2] = {reg, val};
  return bus_.write(addr_, b, 2);
}

const char* Mpu6500::chipName() const {
  switch (who_) {
    case 0x71: return "MPU-9250";
    case 0x70: return "MPU-6500";
    case 0x73: return "MPU-9255";
    case 0x68: return "MPU-6050";
    default:   return "MPU clone";
  }
}

bool Mpu6500::tryInit(uint8_t addr) {
  addr_ = addr;
  if (!bus_.probe(addr)) return false;
  // Chip boots asleep. 0x01 = wake, clock from PLL (falls back to internal osc).
  if (!writeReg(REG_PWR_MGMT_1, 0x01)) return false;
  if (!bus_.writeRead(addr, REG_WHO_AM_I, &who_, 1)) return false;
  // Clones report all sorts of IDs; accept anything that answers except 0x00/0xFF.
  if (who_ == 0x00 || who_ == 0xFF) return false;
  writeReg(REG_PWR_MGMT_2, 0x07);      // gyro X/Y/Z standby, accel on
  writeReg(REG_CONFIG, 0x03);          // DLPF ~44 Hz (gyro on 6500, both on 6050)
  writeReg(REG_SMPLRT_DIV, 19);        // 1 kHz / 20 = 50 Hz internal rate
  if (!writeReg(REG_ACCEL_CONFIG, 0x08)) return false;   // ±4 g, 8192 LSB/g
  if (who_ != 0x68) writeReg(REG_ACCEL_CONFIG2, 0x03);   // accel DLPF ~44 Hz
  return true;
}

bool Mpu6500::begin(uint8_t addr) {
  ok_ = tryInit(addr) || tryInit(addr ^ 0x01);
  return ok_;
}

bool Mpu6500::readAccel(AccelSample& s) {
  if (!ok_) return false;
  uint8_t b[6];
  if (!bus_.writeRead(addr_, REG_ACCEL_XOUT_H, b, 6)) { ok_ = false; return false; }
  s.x = (int16_t)((b[0] << 8) | b[1]);   // big-endian
  s.y = (int16_t)((b[2] << 8) | b[3]);
  s.z = (int16_t)((b[4] << 8) | b[5]);
  return true;
}
