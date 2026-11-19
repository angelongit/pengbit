# Pengbit firmware architecture

How the pet firmware is split up, what each piece does, the register sequences for the two hand-written drivers, and the order to build it in with a fallback for every risky part.

**Approach:** the Arduino core handles boot, `millis()`, GPIO and Bluetooth (Bluefruit). Everything else is ours: an SSD1306 OLED driver and an LSM6DS3 IMU driver over raw I2C (`Wire` only), plus plain C++ classes for the pet. The skeleton files in `pet/` have the interfaces and `TODO`s; the bodies are yours to write.

**Two rules that keep it simple, and portable to Zephyr later:**

1. Drivers talk to an `I2cBus` interface, never to `Wire` directly. Only `arduino_i2c.cpp` knows about Arduino. A Zephyr port swaps that one file.
2. Pet logic (`pet_state`, `activity`) uses no Arduino headers at all. It only sees numbers and a time step, so it can be compiled and tested on the laptop with `g++`.

---

## 1. Module layout

All files sit flat in `firmware/pet/` so the Arduino IDE shows each one as a tab and compiles them all.

```
pet.ino            setup() and loop(): wires the modules together, runs the scheduler
config.h           pins, I2C addresses, timings, thresholds, fallback switches

── hardware layer (knows about the board) ─────────────────────────
i2c_bus.h          abstract I2C interface (write, writeRead)
arduino_i2c.h/.cpp I2cBus on top of TwoWire
ssd1306.h/.cpp     OLED driver: init sequence, 1 KB framebuffer, flush
lsm6ds3.h/.cpp     IMU driver: power-up, WHO_AM_I, config, read accel
buttons.h/.cpp     3 debounced buttons, press events
buzzer.h/.cpp      non-blocking chirp patterns on D0
link.h/.cpp        line protocol over BLE UART and USB serial (docs/ble-protocol.md)

── drawing ────────────────────────────────────────────────────────
gfx.h/.cpp         pixels, rects, bars, sprites, 5x7 text into the framebuffer
sprites.h          Pengbit bitmaps (from Daniel's pixel art)
ui.h/.cpp          screens: home, stats, evolving, egg

── pet logic (pure C++, no Arduino) ───────────────────────────────
activity.h/.cpp    accel samples -> STILL / WALK / SHAKE per 2 s window
pet_state.h/.cpp   stats, age, activity tally, evolution, events
```

Dependencies only point downward:

```
pet.ino ──► ui ──► gfx ──► ssd1306 ──► i2c_bus ◄── lsm6ds3
   │                                     ▲
   │                                 arduino_i2c (Wire)
   ├──► pet_state ◄── activity
   ├──► link (Bluefruit BLEUart + Serial)
   └──► buttons, buzzer
```

`pet_state` never draws, never beeps, never sends. It returns events; `pet.ino` decides what to do with them.

---

## 2. Class interfaces (summary)

The full declarations are in the headers. In short:

| Class | Key methods | Notes |
|---|---|---|
| `I2cBus` | `write(addr, data, len)`, `writeRead(addr, reg, out, len)` | Returns `false` on NACK. Pure virtual. |
| `ArduinoI2c` | constructed with a `TwoWire&` | `Wire` for the OLED, `Wire1` for the IMU (see 4.1) |
| `Ssd1306` | `begin()`, `buffer()`, `clear()`, `flush()`, `setContrast()`, `setPower()` | Owns the 1024-byte framebuffer |
| `Gfx` | `pixel`, `rect`, `fillRect`, `bar`, `sprite`, `text` | Draws into `Ssd1306::buffer()` |
| `Lsm6ds3` | `begin()`, `whoAmI()`, `readAccel(AccelSample&)` | Raw `int16` plus `toG()` helper |
| `ActivityDetector` | `addSample(ax, ay, az)`, `windowReady()`, `result()` | Units: g |
| `PetState` | `tick(seconds, activity)`, `feed()`, `play()`, `reset()`, `pollEvent()` | `tick` gets real or demo-scaled seconds |
| `Buttons` | `update(nowMs)`, `pressed(Button)` | Edge-triggered, 25 ms debounce |
| `Buzzer` | `update(nowMs)`, `play(Pattern)` | Never calls `delay()` |
| `Link` | `begin()`, `update()`, `sendStatus(...)`, `sendEvent(...)`, `pollCommand()` | Same lines on BLE and Serial |

---

## 3. SSD1306 driver

### 3.1 How the chip is addressed over I2C

Every I2C write to 0x3C starts with a **control byte**:

| Control byte | Meaning |
|---|---|
| `0x00` | the rest of this transaction is commands |
| `0x40` | the rest of this transaction is display RAM data |

So a command write is `[0x00, cmd, arg, ...]` and a data write is `[0x40, d0, d1, ...]`.

### 3.2 Init sequence (128x64, internal charge pump)

Send in order after a ~100 ms power-up delay:

| Bytes | Command | Why |
|---|---|---|
| `AE` | Display off | Configure while dark |
| `D5 80` | Clock divide / osc freq | Datasheet default |
| `A8 3F` | Multiplex ratio = 63 | 64 rows |
| `D3 00` | Display offset = 0 | |
| `40` | Start line = 0 | |
| `8D 14` | Charge pump on | **Required** on these modules, or the screen stays black |
| `20 00` | Memory mode = horizontal | Lets one flush stream all 1024 bytes |
| `A1` | Segment remap (col 127 = SEG0) | Not mirrored left-right |
| `C8` | COM scan descending | Not upside down |
| `DA 12` | COM pins = alternative | Correct for 128x64 panels |
| `81 CF` | Contrast | 0x00 to 0xFF; drop it to save battery |
| `D9 F1` | Pre-charge period | For the internal charge pump |
| `DB 40` | VCOMH deselect level | |
| `A4` | Show RAM contents | (`A5` lights every pixel: handy test) |
| `A6` | Normal, not inverted | |
| `2E` | Scrolling off | |
| `AF` | Display on | |

If the image is mirrored or flipped, swap `A1`↔`A0` or `C8`↔`C0`.

### 3.3 Framebuffer layout

1024 bytes = 8 **pages** of 8 rows x 128 columns. Each byte is a vertical strip of 8 pixels, LSB on top.

```
index = x + (y / 8) * 128
bit   = y % 8            (1 = pixel on)
```

Pages 0 and 1 (rows 0 to 15) are the yellow band; pages 2 to 7 are blue. Put the status bar in pages 0 and 1.

### 3.4 Flush

```
commands: 21 00 7F     column range 0..127
          22 00 07     page range 0..7
data:     1024 bytes, in chunks
```

Send the data as several transactions of `[0x40, up to 31 bytes]`. The Arduino `Wire` TX buffer is small (often 32 bytes; check `Wire.h` in the installed Seeed nRF52 core and use bigger chunks if it allows). Run the bus at 400 kHz (`Wire.setClock(400000)`): a full flush is then about 25 to 30 ms. Only flush when something changed (keep a dirty flag), at most ~15 times a second.

### 3.5 Things to try once it works (good learning, cheap)

- `81 xx` contrast fade for a "sleepy" pet.
- `A7` invert for a flash when the pet evolves.
- Partial flush: set the column/page range to just the sprite area.

---

## 4. LSM6DS3 IMU driver

### 4.1 Board specifics (check these first)

- The Sense board has an **LSM6DS3TR-C**. `WHO_AM_I` reads `0x6A` (an original LSM6DS3 reads `0x69`; accept both).
- It is at I2C address **0x6A** on an **internal I2C bus** that is not D4/D5. In the Seeed nRF52 (non-mbed) core this is `Wire1`.
- The IMU's supply comes from a GPIO: `PIN_LSM6DS3TR_C_POWER`. Set it as output and drive it HIGH, then wait ~10 ms before talking to the chip.
- Confirm all three in the core's `variant.h` (search for `LSM6DS3` and `WIRE1`). The first test (step 2 in the build order) is an I2C scan of both buses, which settles it.

### 4.2 Registers

| Reg | Name | Value to write | Meaning |
|---|---|---|---|
| `0x12` | CTRL3_C | `0x01` | SW_RESET, then wait ~10 ms (bit self-clears) |
| `0x0F` | WHO_AM_I | read | expect `0x6A` |
| `0x12` | CTRL3_C | `0x44` | BDU (bit 6): high and low bytes from the same sample. IF_INC (bit 2): address auto-increments on multi-byte reads |
| `0x10` | CTRL1_XL | `0x48` | Accel ODR 104 Hz (bits 7:4 = `0100`), full scale ±4 g (bits 3:2 = `10`) |
| `0x11` | CTRL2_G | `0x00` | Gyro off (not needed; saves power). `0x40` = 104 Hz, 250 dps if you want it |
| `0x1E` | STATUS_REG | read | bit 0 XLDA = new accel sample ready |
| `0x28`..`0x2D` | OUTX_L_XL .. OUTZ_H_XL | read 6 bytes | X, Y, Z as little-endian `int16` |

Conversion at ±4 g: **0.122 mg per LSB**, so `g = raw * 0.000122f`. A board lying flat reads about `(0, 0, 1.0)`.

Burst read: `writeRead(0x6A, 0x28, buf, 6)`, i.e. write the register address with a repeated start (`endTransmission(false)`), then `requestFrom(0x6A, 6)`.

### 4.3 Stretch: hardware step counter

The chip has a built-in pedometer (enable `FUNC_EN` and `PEDO_EN` in CTRL10_C `0x19`, needs accel ODR ≥ 26 Hz; count in `0x4B`/`0x4C`). Check the LSM6DS3TR-C datasheet and app note AN5130 for the exact bits before using it. It would give a real "steps today" stat and a nice line on the resume, but the threshold detector below is enough for evolution.

---

## 5. Activity detection

Runs in `ActivityDetector`, pure math, no Arduino.

1. Read the accel at ~50 Hz from `loop()` (every 20 ms, or when XLDA is set).
2. Per sample: `m = sqrt(ax² + ay² + az²)`, then `d = |m - 1.0|` (how far from "just gravity").
3. Over a 2 s window (100 samples) track `mean(d)` and `max(d)`.
4. Classify the window:

| Result | Rule (starting values, tune them) |
|---|---|
| SHAKE | `max(d) > 1.2` g, or `mean(d) > 0.6` g |
| WALK | `mean(d) > 0.08` g |
| STILL | otherwise |

Tune with the Serial Plotter: print `mean` and `max` per window while sitting, walking around the room, and shaking the board. Put the thresholds in `config.h`.

Optional upgrade if WALK and SHAKE blur: count how many times `m` crosses 1.0 g per window. Walking is a steady ~2 crossings a second; shaking is many more and much larger.

---

## 6. Pet state and evolution

`PetState::tick(dtSeconds, activity)` is the only place time passes. `pet.ino` calls it once per second with `dt = 1` normally and `dt = 60` in demo mode, so demo mode needs no special cases.

**State:** `happiness` and `energy` (0 to 100), `ageSeconds`, `form` (EGG/BABY → SPRINTER, FROST, GLITCH), and seconds spent in each activity since hatching.

**Rules (starting values, all in `config.h`):**

| Thing | Effect |
|---|---|
| Every minute | energy −1, happiness −1 |
| WALK minute | happiness +2, energy −2 |
| STILL minute | energy +2 |
| SHAKE minute | happiness −1 (it's dizzy), energy −1 |
| `feed()` (button or `C,FEED`) | energy +20 |
| `play()` (button or `C,PLAY`) | happiness +15, energy −5 |
| Hatch | `ageSeconds` ≥ 2 min |
| Evolve | `ageSeconds` ≥ 30 min **and** happiness ≥ 30; the activity with the most seconds picks the form: WALK → SPRINTER (1), STILL → FROST (2), SHAKE → GLITCH (3) |

In demo mode 30 minutes is 30 real seconds, which is about right for judges.

**Events** go into a small queue that `pet.ino` drains with `pollEvent()`: `HATCHED`, `EVOLVED(form)`, `HUNGRY` (energy < 20), `SAD` (happiness < 20). `pet.ino` turns them into a chirp, a UI screen, and `E,EVO,n` on the link.

**Stretch:** save `PetState` to flash every few minutes (the core has `InternalFileSystem`) so a reset doesn't lose the pet.

---

## 7. Main loop

No `delay()` anywhere. One cooperative scheduler on `millis()`:

| Every | Job |
|---|---|
| each loop | `buttons.update()`, `buzzer.update()`, `link.update()` |
| 20 ms | read IMU, `activity.addSample()` |
| 1 s | `pet.tick(demo ? 60 : 1, activity.result())`, drain pet events |
| 1 s | `link.sendStatus(...)` → `S,happy,energy,form,activity,age` |
| ~66 ms | animate sprite frame, redraw UI if dirty, `oled.flush()` |

Commands from the page (`C,FEED`, `C,PLAY`, `C,DEMO,1|0`, `C,RESET`) and buttons (A menu, B select, C demo toggle) both end up calling the same `PetState` methods.

---

## 8. Build order and fallbacks

The drivers get written **before Saturday** (parts arrive Thursday), so the event day is integration, not register debugging. The library test sketches in `tests/` stay as the known-good baseline: if a custom driver misbehaves, run the matching test sketch first to rule out wiring.

### Thursday (parts arrive)

1. Solder the header. Run all four `tests/` sketches. **This proves the hardware.**
2. I2C scan of `Wire` (expect 0x3C) and `Wire1` after powering the IMU (expect 0x6A). Settles 4.1.
3. `ArduinoI2c` + `Ssd1306::begin()`. First success: `A5` (all pixels on), then a checkerboard from the framebuffer.

### Friday

4. `Gfx`: rects, bars, a sprite, text. Draw the home screen with fake numbers.
5. `Lsm6ds3`: WHO_AM_I, then accel on the Serial Plotter next to the library `imu_test` to compare numbers.
6. `ActivityDetector`: tune thresholds by walking around with the laptop.
7. `PetState`: write it and test it on the laptop with `g++` (simulate 30 min of WALK and check it evolves to SPRINTER).
8. Buttons and buzzer (copy logic from `io_test`, minus the `delay`).

### Saturday (fits the gates in docs/plan.md)

| By | Do | If it's not working |
|---|---|---|
| **10:45** | Custom OLED driver showing the pet on the shell hardware | Set `USE_LIB_OLED 1` in `config.h`. The library only does init and the transfer; our framebuffer, `Gfx` and UI stay the same (copy our buffer into `display.getBuffer()` and call `display.display()`). |
| 11:00 | Gate: OLED working | If neither works, the pet moves to the companion page (plan fallback) |
| **11:30** | Custom IMU driver feeding `ActivityDetector` | Set `USE_LIB_IMU 1`: `Lsm6ds3::readAccel` calls the Seeed library's `readFloatAccelX/Y/Z` instead. Nothing above it changes. |
| 12:30 | Gate: BLE end to end (Bluefruit `BLEUart`, already tested in `ble_test`) | `Link` keeps sending on `Serial`; the page uses Web Serial |
| 2:00 | Gate: pet loop v1 (tick, stats, evolution, demo mode) | Drop the HUNGRY/SAD events and the hatch step; keep evolution |
| 4:00 | Gate: core on the LiPo | |
| 5:30 | Feature freeze | |

The fallback switches only change the inside of two `.cpp` files, so flipping one costs minutes, not a rewrite. That's the payoff of keeping `Wire` and the libraries behind our own interfaces.

---

## 9. Later: Zephyr port (not for Saturday)

Replace `arduino_i2c.cpp` with one built on Zephyr's `i2c_write` / `i2c_write_read`, the scheduler with `k_timer`s or a work queue, and Bluefruit with Zephyr's NUS sample. `ssd1306`, `lsm6ds3`, `gfx`, `activity` and `pet_state` move over unchanged.

## References

- SSD1306 datasheet (Solomon Systech), sections 8.1.5 (I2C), 9 (command table), 10.1.3 (addressing modes)
- LSM6DS3TR-C datasheet (ST), section 9 (register description); app note AN5130
- Seeed XIAO nRF52840 Sense wiki and the installed core's `variants/Seeed_XIAO_nRF52840_Sense/variant.h`
