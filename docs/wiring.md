# Wiring

Proposed pin map for the XIAO nRF52840 Sense. Change it here first if the wiring changes, then update the sketches.

| XIAO pin | Connects to | Notes |
|---|---|---|
| D0 | Buzzer driver | NPN (S8050 or PN2222) base through 1k, 10k base to GND |
| D1 | Button A (menu) | Other leg to GND, `INPUT_PULLUP` |
| D2 | Button B (select) | Other leg to GND, `INPUT_PULLUP` |
| D3 | Button C (demo mode) | Other leg to GND, `INPUT_PULLUP` |
| D4 | OLED SDA | |
| D5 | OLED SCL | |
| 3V3 | OLED VCC, buzzer + | Use 3V3, not 5V: the 5V pin is dead on battery |
| GND | OLED GND, buttons, NPN emitter | |
| BAT+ / BAT- (pads underneath) | LiPo through the slide switch | Charges over USB-C |
| D6 to D10 | spare | |

## Buzzer circuit

```
3V3 ── buzzer(+) ── buzzer(-) ── NPN collector
                                 NPN emitter ── GND
D0 ── 1k ── NPN base ── 10k ── GND
```

A 1N4007 across the buzzer (stripe toward 3V3) is optional for an active buzzer.

## Notes

- OLED is 128x64 at I2C 0x3C. Top 16 rows are yellow, the rest blue.
- Built-in IMU (LSM6DS3) is at I2C 0x6A on its own internal bus; no wiring needed.
- Parts and wiring checklist: https://claude.ai/artifact/QLyXei9zVQt3PaazWNY7NQ
- Case and assembly steps: [../shell/README.md](../shell/README.md)
