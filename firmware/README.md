# Firmware

Board: **Seeed Studio XIAO nRF52840** (regular, not Sense). IMU: external MPU-6500/9250 on D4/D5 at 0x68.

The pet firmware is in [pet/](pet/README.md).

## Arduino IDE setup

1. File > Preferences > Additional boards manager URLs, add
   `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`
2. Boards Manager: install **Seeed nRF52 Boards** (the non-mbed one; it includes the Bluefruit BLE library).
3. Select board **Seeed XIAO nRF52840**.
4. Library Manager: install
   - Adafruit SSD1306
   - Adafruit GFX Library
   - Seeed Arduino LSM6DS3

If upload fails, double-tap the reset button to enter the bootloader and try again.

## Sketches

| Sketch | Checks |
|---|---|
| `tests/bench_test` | **Start here.** Every part one at a time from a Serial Monitor menu. Wiring guide in its README |
| `tests/oled_test` | OLED wiring and I2C address |
| `tests/io_test` | Buttons A/B/C and the buzzer |
| `tests/imu_test` | IMU readings and motion magnitude on serial |
| `tests/ble_test` | Bluetooth UART: board shows up in Web Bluetooth and echoes lines |
| `pet/` | The pet itself. See [pet/README.md](pet/README.md). |

## Hardware for testing

The XIAO has one 7-pin header on the D0 to D6 side. 3V3 and GND are on the other side, so run jumper wires from those pads to the breadboard rails. The final build drops the header and is wired point to point inside the case.

Pin numbers are in [../docs/wiring.md](../docs/wiring.md). Each test sketch repeats the pins it uses at the top so it stays standalone.
