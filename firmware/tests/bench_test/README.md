# Bench test (Friday night)

One sketch, `bench_test.ino`, that checks each part on the breadboard one at a time. Add one part, flash nothing new, just type its number in Serial Monitor. If a stage fails you know exactly which part to look at.

| Key | Stage | Wiring needed |
|---|---|---|
| 1 | Blink onboard LED | none |
| 2 | I2C scan | OLED |
| 3 | OLED text + animation | OLED |
| 4 | Buttons A/B/C | 3 buttons |
| 5 | Buzzer chirps | NPN + resistors + buzzer |
| 6 | IMU (x, y, z, magnitude) | none, it's on the board |
| 0 | Stop, show menu | |

## 0. Arduino IDE setup (once)

1. **File > Preferences > Additional boards manager URLs**, add
   `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`
2. **Tools > Board > Boards Manager**, search "seeed nrf52", install **Seeed nRF52 Boards** (the one *without* "mbed").
   - Why not mbed: the mbed core works for the IMU too, but `ble_test` and the pet use the Bluefruit BLE library, which only ships with the non-mbed core. One core for everything.
3. **Tools > Board > Seeed nRF52 Boards > Seeed XIAO nRF52840 Sense**. The "Sense" part matters for the IMU.
4. **Sketch > Include Library > Manage Libraries**, install:
   - Adafruit SSD1306 (say yes to installing Adafruit GFX + BusIO with it)
   - Seeed Arduino LSM6DS3
5. Plug in the XIAO with a **data** USB-C cable, pick its port under **Tools > Port**.

If upload fails or no port appears: double-tap the tiny reset button. The orange LED pulses and a drive called XIAO-SENSE shows up. Pick the new port and upload again.

## Breadboard layout

- XIAO straddles the center gap on its D0 to D6 header. The other side has no header, so it just rests on the board.
- Jumper wire from the **3V3** pad to the **+ rail**, and from **GND** to the **- rail**. Use 3V3, not 5V (5V is dead on battery, so test on what you'll ship).
- Multimeter check before adding parts: plugged into USB, + rail to - rail should read about **3.3 V**.

## Stage 1: Blink

No wiring. Flash, open Serial Monitor at **115200**, type `1` and Enter. The onboard LED blinks once a second and serial prints `LED on` / `LED off`.

If this works, your board package, port and upload are all good.

## Stages 2 and 3: OLED

The ELEGOO module's pins are in this order: **GND, VCC, SCL, SDA**.

| OLED pin | Goes to |
|---|---|
| GND | - rail |
| VCC | + rail (3V3) |
| SCL | D5 |
| SDA | D4 |

No pull-up resistors needed; the module has them.

- Type `2`: expect `found device at 0x3C <- SSD1306 OLED`. If it says 0x3D, change `OLED_ADDR` at the top of the sketch.
- Nothing found: SDA and SCL swapped is the usual cause, then VCC/GND.
- Type `3`: "Pengbit" in the yellow band, a box, "OLED OK", a seconds counter and a bouncing dot in the blue part.

## Stage 4: Buttons

Each button: one leg to its pin, the **diagonally opposite** leg to the - rail. Diagonal legs are always on opposite sides of the switch, so you can't accidentally pick two legs that are already connected inside it.

| Button | Pin |
|---|---|
| A (menu) | D1 |
| B (select) | D2 |
| C (demo) | D3 |

No resistors. The sketch uses `INPUT_PULLUP`, which turns on a resistor inside the chip that pulls the pin to 3.3 V. Pressing the button connects the pin to GND, so **pressed reads LOW**.

Type `4`, press each one. You should see `A (menu) pressed` / `released` once per press. If a button says "reads pressed already" at the start, its two legs are internally connected: use the diagonal pair.

## Stage 5: Buzzer through the NPN

The pin can only give a few mA; the buzzer wants about 30 mA. The transistor works as a switch: a small current into the base lets a big current flow collector to emitter.

Parts from the kit: active buzzer (the one with a sticker / sealed bottom; it has a longer + leg), **PN2222 or S8050** NPN, 1 kΩ (brown black red), 10 kΩ (brown black orange).

NPN pins: hold it with the **flat side facing you, legs down**: left to right is **E, B, C** (true for both PN2222 and S8050).

```
+ rail (3V3) ── buzzer (+, long leg)
                buzzer (-) ── C (collector)
                              E (emitter) ── - rail
D0 ── 1 kΩ ── B (base)
               B ── 10 kΩ ── - rail
```

- **1 kΩ** limits base current: (3.3 V - 0.7 V) / 1 kΩ ≈ 2.6 mA, plenty to switch 30 mA.
- **10 kΩ** pulls the base to GND so the buzzer stays quiet while the board boots and D0 is floating.

Type `5`: short, short, long chirp. Silent? Check the E/B/C orientation first, then that the buzzer's + goes to 3V3. If it's quiet, that's normal at 3.3 V; most kit buzzers are rated 5 V but still work.

DMM check if stuck: with the buzzer "on", voltage from collector to emitter should be under 0.3 V.

## Stage 6: IMU

No wiring. Type `6`, lay the board flat: `z` should be close to `1.00` and `mag` close to `1.00`. Shake it and `mag` jumps to 2 or more. That jump is what the pet's shake detection will use.

Close Serial Monitor and open **Tools > Serial Plotter** to see it as a graph (type `6` there too).

`IMU not found` almost always means the board is set to plain "XIAO nRF52840" instead of "Sense".

## After this

- `tests/ble_test` checks Bluetooth (needs the same board package, nothing extra).
- Keep the breadboard wired: it is the reference for the point-to-point build.
