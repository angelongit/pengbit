// Screens drawn into the framebuffer with Gfx. Pure C++ (no Arduino), so the
// same code renders preview PNGs on a laptop (firmware/tools/preview).
// Top 16 rows (yellow band): name, demo/BLE tags, happiness and energy bars.
// Blue area: the pet, activity, age, menu and toasts.
#pragma once
#include <stdint.h>
#include "gfx.h"
#include "pet_state.h"

enum class Screen : uint8_t { HOME, STATS };

enum MenuItem : uint8_t { MENU_FEED = 0, MENU_PLAY, MENU_STATS, MENU_COUNT };

struct UiModel {
  const PetState* pet = nullptr;
  Activity act = Activity::STILL;
  uint8_t conf = 100;
  bool mlActive = false;
  bool demo = false;
  bool bleConnected = false;
  bool imuOk = true;
  bool rawStream = false;
  const char* name = "PENGBIT";
};

class Ui {
public:
  explicit Ui(Gfx& g) : g_(g) {}

  void draw(const UiModel& m, uint32_t nowMs);

  // Navigation (buttons call these).
  void menuNext(uint32_t nowMs);            // A: open the menu / move the cursor
  bool menuOpen(uint32_t nowMs) const;
  MenuItem menuItem() const { return (MenuItem)menu_; }
  void closeMenu() { menuAt_ = 0; menuShown_ = false; }
  void setScreen(Screen s) { screen_ = s; }
  Screen screen() const { return screen_; }

  void toast(const char* msg, uint32_t nowMs, uint32_t ms = 1500);
  void startEvolve(Form from, Form to, uint32_t nowMs);
  bool evolving(uint32_t nowMs) const;

private:
  void drawStatusBar(const UiModel& m);
  void drawHome(const UiModel& m, uint32_t now);
  void drawStats(const UiModel& m);
  void drawEvolve(uint32_t now);
  void drawBottom(const UiModel& m, uint32_t now);
  void drawPet(Form f, int x, int y, uint32_t now, bool shiver);
  static const char* formName(Form f);

  Gfx& g_;
  Screen screen_ = Screen::HOME;
  uint8_t menu_ = 0;
  uint32_t menuAt_ = 0;
  bool menuShown_ = false;
  char toast_[22] = {0};
  uint32_t toastUntil_ = 0;
  uint32_t evoStart_ = 0;
  bool evoActive_ = false;
  Form evoFrom_ = Form::BABY, evoTo_ = Form::BABY;
};
