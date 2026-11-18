# Wiring

Pin map and final parts for the XIAO nRF52840 Sense. Change it here first if the wiring changes, then update the sketches.

## Parts

| Part | Notes |
|---|---|
| Seeed XIAO nRF52840 Sense | One 7-pin header on the D0 to D6 side only, for breadboard testing |
| 0.96" SSD1306 OLED, 128x64 (ELEGOO 3-pack) | I2C at 0x3C. Pin order on the module: GND, VCC, SCL, SDA |
| EEMB 1100 mAh LiPo, LP603449 | 51 x 34.5 x 6.3 mm, built-in protection, JST-PH 2.0 plug |
| JST-PH 2.0 socket (from the 25-set kit) | Soldered to the BAT pads so the battery unplugs |
| SS12D00 slide switch | On battery + |
| Active buzzer + S8050 or PN2222 NPN, 1k and 10k resistors | From the ELEGOO kit |
| 3 tact buttons | From the ELEGOO kit |
| 4 mm heat shrink | Over every soldered joint |

## Pin map

| XIAO pin | Connects to | Notes |
|---|---|---|
| D0 | Buzzer driver | NPN base through 1k, 10k base to GND |
| D1 | Button A (menu) | Other leg to GND, `INPUT_PULLUP` |
| D2 | Button B (select) | Other leg to GND, `INPUT_PULLUP` |
| D3 | Button C (demo mode) | Other leg to GND, `INPUT_PULLUP` |
| D4 | OLED SDA | |
| D5 | OLED SCL | |
| D6 | spare | On the header |
| 3V3 | OLED VCC, buzzer + | Not on the header: jumper wire. Use 3V3, not 5V (5V is dead on battery) |
| GND | OLED GND, buttons, NPN emitter | Not on the header: jumper wire |
| BAT+ / BAT- (pads underneath) | Battery, see below | |
| D7 to D10 | spare | |

## Battery and power switch

```
BAT+ pad ── SS12D00 (middle pin ↔ one side pin) ── JST-PH socket (+)
BAT- pad ─────────────────────────────────────────── JST-PH socket (-)
```

- **Check polarity before plugging in.** JST-PH leads are not standardized: make sure the battery's red wire lands on the socket pin wired to BAT+. Reversed polarity can kill the XIAO.
- The battery charges over USB-C whenever the switch is on. Default charge current is 50 mA (about 22 h for 1100 mAh). Driving P0.13 LOW in firmware raises it to 100 mA (about 11 h). Top it up Friday night.
- Heat-shrink the BAT pad joints; they sit right under the board.

## Buzzer circuit

```
3V3 ── buzzer(+) ── buzzer(-) ── NPN collector
                                 NPN emitter ── GND
D0 ── 1k ── NPN base ── 10k ── GND
```

A 1N4007 across the buzzer (stripe toward 3V3) is optional for an active buzzer.

## Building it

1. **Test on the breadboard first.** XIAO on its D0 to D6 header, jumper wires from the 3V3 and GND pads, and flash each sketch in `firmware/tests/`.
2. **Final build is point-to-point wiring inside the case.** Desolder or clip the header, then solder short wires straight between the XIAO, OLED, buttons, buzzer circuit and switch. Heat-shrink each joint. Follow the assembly steps in [../shell/README.md](../shell/README.md).

## Notes

- OLED is 128x64. Top 16 rows are yellow, the rest blue.
- The built-in IMU (LSM6DS3) is at I2C 0x6A on its own internal bus; no wiring needed.
- Parts and wiring checklist: https://claude.ai/artifact/QLyXei9zVQt3PaazWNY7NQ
