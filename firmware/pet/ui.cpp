#include "ui.h"

void Ui::nextScreen() {
  screen_ = screen_ == Screen::HOME ? Screen::STATS : Screen::HOME;
  dirty_ = true;
}

bool Ui::draw(const PetState& pet, bool demo, uint32_t nowMs) {
  // TODO: animation frames also count as dirty on HOME/EVOLVING.
  if (!dirty_) return false;
  drawStatusBar(pet, demo);
  switch (screen_) {
    case Screen::HOME: drawHome(pet, nowMs); break;
    case Screen::STATS: drawStats(pet); break;
    case Screen::EVOLVING: drawEvolving(nowMs); break;
  }
  dirty_ = false;
  return true;
}

void Ui::drawStatusBar(const PetState& pet, bool demo) { (void)pet; (void)demo; /* TODO */ }
void Ui::drawHome(const PetState& pet, uint32_t nowMs) { (void)pet; (void)nowMs; /* TODO */ }
void Ui::drawStats(const PetState& pet) { (void)pet; /* TODO */ }
void Ui::drawEvolving(uint32_t nowMs) { (void)nowMs; /* TODO */ }
