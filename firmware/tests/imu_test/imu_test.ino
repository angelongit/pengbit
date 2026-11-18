// IMU check: prints acceleration (g) and its magnitude. Open Serial Plotter to watch it.
#include <LSM6DS3.h>
#include <Wire.h>

LSM6DS3 imu(I2C_MODE, 0x6A);  // built-in IMU on the Sense

void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);
  if (imu.begin() != 0) {
    Serial.println("IMU not found");
    while (true) delay(100);
  }
}

void loop() {
  float x = imu.readFloatAccelX();
  float y = imu.readFloatAccelY();
  float z = imu.readFloatAccelZ();
  float mag = sqrt(x * x + y * y + z * z);
  Serial.print("x:"); Serial.print(x, 3);
  Serial.print(" y:"); Serial.print(y, 3);
  Serial.print(" z:"); Serial.print(z, 3);
  Serial.print(" mag:"); Serial.println(mag, 3);
  delay(50);
}
