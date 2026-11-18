# Firmware

Board: **Seeed Studio XIAO nRF52840 Sense**.

## Arduino IDE setup

1. File > Preferences > Additional boards manager URLs, add
   `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`
2. Boards Manager: install **Seeed nRF52 Boards** (the non-mbed one; it includes the Bluefruit BLE library).
3. Select board **Seeed XIAO nRF52840 Sense**.
4. Library Manager: install
   - Adafruit SSD1306
   - Adafruit GFX Library
   - Seeed Arduino LSM6DS3

If upload fails, double-tap the reset button to enter the bootloader and try again.

## Sketches

| Sketch | Checks |
|---|---|
| `tests/oled_test` | OLED wiring and I2C address |
| `tests/io_test` | Buttons A/B/C and the buzzer |
| `tests/imu_test` | IMU readings and motion magnitude on serial |
| `tests/ble_test` | Bluetooth UART: board shows up in Web Bluetooth and echoes lines |
| `pet/` | The pet itself. Written at the event. |

Pin numbers are in [../docs/wiring.md](../docs/wiring.md). Each test sketch repeats the pins it uses at the top so it stays standalone.
