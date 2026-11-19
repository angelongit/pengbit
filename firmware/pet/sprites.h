// Pengbit sprites. Format: column bytes, LSB on top (same as the OLED), h a multiple of 8.
// Daniel's pixel art -> convert to this format with a small script (or image2cpp, "vertical").
#pragma once
#include <stdint.h>

constexpr int SPRITE_W = 32;
constexpr int SPRITE_H = 32;   // 4 pages

// TODO: egg, baby, sprinter, frost, glitch (2 animation frames each if time allows)
// extern const uint8_t SPR_BABY_0[SPRITE_W * SPRITE_H / 8];
