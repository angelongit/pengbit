#include "lsm6ds3.h"
#include "config.h"

#if USE_LIB_IMU
// Fallback: wrap the Seeed LSM6DS3 library here, convert readFloatAccelX/Y/Z back to raw
// (g / G_PER_LSB) in readAccel() so nothing above this file changes.
#endif

bool Lsm6ds3::begin() {
  // TODO (ARCHITECTURE.md 4.2):
  //   1. CTRL3_C = 0x01 (SW_RESET), wait ~10 ms
  //   2. whoAmI() must be 0x6A or 0x69
  //   3. CTRL3_C = 0x44 (BDU + IF_INC)
  //   4. CTRL1_XL = 0x48 (104 Hz, +-4 g)
  //   5. CTRL2_G = 0x00 (gyro off)
  // Delays: this file stays Arduino-free, so take a delay callback or do the wait in pet.ino.
  return false;
}

uint8_t Lsm6ds3::whoAmI() {
  uint8_t v = 0;
  return bus_.writeRead(addr_, REG_WHO_AM_I, &v, 1) ? v : 0;
}

bool Lsm6ds3::dataReady() {
  // TODO: read REG_STATUS, return bit 0.
  return false;
}

bool Lsm6ds3::readAccel(AccelSample& out) {
  // TODO: writeRead 6 bytes from REG_OUTX_L_XL; x = (int16_t)(b[1] << 8 | b[0]), etc.
  (void)out;
  return false;
}
