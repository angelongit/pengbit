// Screens. Reads PetState, draws with Gfx. Yellow band (y 0..15) = status bar.
#pragma once
#include "gfx.h"
#include "pet_state.h"

enum class Screen : uint8_t { HOME, STATS, EVOLVING };

class Ui {
public:
  explicit Ui(Gfx& gfx) : gfx_(gfx) {}

  void show(Screen s) { screen_ = s; dirty_ = true; }
  void nextScreen();                       // button A
  void markDirty() { dirty_ = true; }
  bool draw(const PetState& pet, bool demo, uint32_t nowMs);  // true if the buffer changed

private:
  void drawStatusBar(const PetState& pet, bool demo);   // name, demo flag, BLE dot
  void drawHome(const PetState& pet, uint32_t nowMs);   // sprite, bobbing animation
  void drawStats(const PetState& pet);                  // bars, age, form name
  void drawEvolving(uint32_t nowMs);                    // flash / invert sequence

  Gfx& gfx_;
  Screen screen_ = Screen::HOME;
  bool dirty_ = true;
};
