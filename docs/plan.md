# Plan

Pengbit: a pocket penguin (inspired by TIDAL's mascot) that evolves into one of three forms based on how you move.

- Day plan (schedule, gates, scope): https://claude.ai/artifact/Foz6pP76rnUb2AjQ8jypT9
- Parts and wiring checklist: https://claude.ai/artifact/QLyXei9zVQt3PaazWNY7NQ
- Event: tidalByte 26, Sat Nov 21 2026, MSC 2300. Hacking 10 AM to 8 PM. https://f26.tidaltamu.com/

## Gates (Saturday)

| Time | Done by then |
|---|---|
| 11:00 | OLED working |
| 12:30 | BLE end to end (else USB serial, same messages) |
| 2:00 | Pet loop v1 |
| 4:00 | Core working on the LiPo |
| 5:30 | Feature freeze |
| 7:30 | Submit (closes 8 PM) |

## Scope

**Core:** OLED pet, two-way BLE, activity detection (walk / shake / still), happiness and energy, one evolution into 1 of 3 forms, 4 sprites, companion page with an LLM dex entry, demo mode, buzzer chirps, battery power.

**Stretch, in order:** professor voice, floating professor (Document Picture-in-Picture), Edge Impulse on-device ML, wild encounters.

**Fallbacks:** OLED fails, the pet moves to the companion page. BLE not working by 12:30, use USB serial.
