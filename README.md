# Pengbit

A handheld pocket penguin that evolves based on how you move. Built at **tidalByte 26** (Texas A&M, Nov 21 2026), and inspired by TIDAL's penguin mascot.

Pengbit lives on a tiny OLED in a 3D printed shell. It watches the motion sensor (walking, shaking, sitting still), and its happiness and energy change with what you do. After enough activity it evolves into one of three forms. A laptop companion page connects over Bluetooth, shows the pet's stats, and has a "professor" write a dex entry for each new form with an LLM.

Pengbit and its evolved forms are original designs.

## Team

- **Angel**: hardware and firmware
- **Daniel**: companion web page, pixel art, AI

## Repo layout

| Folder | What's in it |
|---|---|
| `firmware/` | Arduino code for the XIAO nRF52840 Sense. `tests/` holds hardware check sketches; `pet/` is the real sketch (written at the event). |
| `web/` | Companion page (Web Bluetooth + LLM dex entries). |
| `shell/` | OpenSCAD model, ready-to-print STLs and renders of the case. |
| `docs/` | Wiring, the Bluetooth message format and the day plan. |

## Hardware

- Seeed Studio XIAO nRF52840 **Sense** (IMU + BLE)
- 0.96" SSD1306 OLED, 128x64, I2C at 0x3C
- 3.7 V LiPo on the XIAO BAT pads, with a slide switch
- Active buzzer driven by an NPN transistor
- 3 tact buttons: A (menu), B (select), C (demo mode)

See [docs/wiring.md](docs/wiring.md) for the pin map.

## Getting started

**Firmware:** see [firmware/README.md](firmware/README.md) for the board package and libraries, then flash the sketches in `firmware/tests/` one at a time to check each part.

**Web:** see [web/README.md](web/README.md).
