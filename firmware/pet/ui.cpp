#include "ui.h"
#include "config.h"
#include "sprites.h"
#include <stdio.h>
#include <string.h>

static const char* const MENU_LABELS[MENU_COUNT] = {"FEED", "PLAY", "STATS"};

const char* Ui::formName(Form f) {
  switch (f) {
    case Form::BABY:     return "PENGBIT";
    case Form::SPRINTER: return "SPRINTER";
    case Form::FROST:    return "FROST";
    case Form::GLITCH:   return "GLITCH";
    case Form::EGG:      return "EGG";
  }
  return "?";
}

static int spriteIndex(Form f) { return f == Form::EGG ? 4 : (int)f; }

void Ui::menuNext(uint32_t now) {
  if (menuOpen(now)) menu_ = (menu_ + 1) % MENU_COUNT;
  else menu_ = 0;
  menuShown_ = true;
  menuAt_ = now;
}

bool Ui::menuOpen(uint32_t now) const {
  return menuShown_ && now - menuAt_ < MENU_TIMEOUT_MS;
}

void Ui::toast(const char* msg, uint32_t now, uint32_t ms) {
  strncpy(toast_, msg, sizeof(toast_) - 1);
  toast_[sizeof(toast_) - 1] = 0;
  toastUntil_ = now + ms;
}

void Ui::startEvolve(Form from, Form to, uint32_t now) {
  evoFrom_ = from;
  evoTo_ = to;
  evoStart_ = now;
  evoActive_ = true;
}

bool Ui::evolving(uint32_t now) const {
  return evoActive_ && now - evoStart_ < EVOLVE_ANIM_MS + 1500;
}

void Ui::draw(const UiModel& m, uint32_t now) {
  g_.clear();
  drawStatusBar(m);
  if (evolving(now)) { drawEvolve(now); return; }
  evoActive_ = false;
  if (screen_ == Screen::STATS) drawStats(m);
  else drawHome(m, now);
}

// ---------------------------------------------------------------- status bar (yellow)
void Ui::drawStatusBar(const UiModel& m) {
  g_.text(0, 0, m.name);
  int x = 128;
  if (m.bleConnected) { x -= 12; g_.text(x, 0, "BT"); }
  if (m.demo) { x -= 24; g_.fillRect(x - 1, 0, 21, 8); g_.text(x, 0, "x60", 1, false); }
  if (m.rawStream) { x -= 24; g_.text(x, 0, "RAW"); }

  const PetState& p = *m.pet;
  if (p.isEgg()) {
    // Egg: a hatch progress bar instead of stats.
    g_.text(0, 9, "HATCH");
    uint32_t pct = p.ageSeconds() * 100 / HATCH_AGE_S;
    g_.bar(34, 9, 94, 6, pct > 100 ? 100 : (uint8_t)pct);
    return;
  }
  g_.text(0, 8, "H");
  g_.bar(7, 9, 54, 6, p.happiness());
  g_.text(67, 8, "E");
  g_.bar(74, 9, 54, 6, p.energy());
}

// ---------------------------------------------------------------- home
void Ui::drawPet(Form f, int x, int y, uint32_t now, bool shiver) {
  int frame = (now / ANIM_PERIOD_MS) % 2;
  if (shiver) x += ((now / 66) % 2) ? 1 : -1;
  if (f == Form::EGG && frame) x += 1;   // wobble
  int8_t shift[SPRITE_H];
  const int8_t* rows = nullptr;
  if (f == Form::GLITCH) {
    // Scanline glitch: a few rows jump sideways, changing every ~200 ms.
    uint32_t seed = (now / 200) * 2654435761u;
    for (int i = 0; i < SPRITE_H; i++) {
      seed = seed * 1103515245u + 12345u;
      shift[i] = ((seed >> 24) % 11 == 0) ? (int8_t)(((seed >> 16) % 5) - 2) : 0;
    }
    rows = shift;
  }
  g_.sprite(x, y, SPRITES[spriteIndex(f)][frame], SPRITE_W, SPRITE_H, false, rows);
}

void Ui::drawHome(const UiModel& m, uint32_t now) {
  const PetState& p = *m.pet;
  bool shiver = p.shivering();
  drawPet(p.form(), 48, 19, now, shiver);

  // Mood marks beside the pet.
  if (!p.isEgg()) {
    if (p.hungry() || p.sad()) {
      g_.rect(84, 18, 9, 11);
      g_.text(86, 20, "!");
    }
    if (shiver) {   // little cold lines
      int o = (now / 250) % 2;
      g_.text(38 - o, 30, "~");
      g_.text(84 + o, 30, "~");
    }
  }
  // Left column: activity. Right column: age.
  if (!p.isEgg()) {
    g_.text(0, 20, m.imuOk ? activityName(m.act) : "NO IMU");
    if (m.mlActive) {
      char b[8];
      snprintf(b, sizeof(b), "%u%%", m.conf);
      g_.text(0, 30, b);
    }
    char age[12];
    uint32_t min = p.ageSeconds() / 60;
    if (min < 600) snprintf(age, sizeof(age), "%lum", (unsigned long)min);
    else snprintf(age, sizeof(age), "%luh", (unsigned long)(min / 60));
    g_.text(128 - Gfx::textWidth(age), 20, age);
  }
  drawBottom(m, now);
}

void Ui::drawBottom(const UiModel& m, uint32_t now) {
  const int y = 56;
  if (now < toastUntil_) {
    int w = Gfx::textWidth(toast_);
    g_.text((128 - w) / 2, y, toast_);
    return;
  }
  if (menuOpen(now)) {
    int x = 4;
    for (uint8_t i = 0; i < MENU_COUNT; i++) {
      int w = Gfx::textWidth(MENU_LABELS[i]);
      if (i == menu_) {
        g_.fillRect(x - 2, y - 1, w + 3, 9);
        g_.text(x, y, MENU_LABELS[i], 1, false);
      } else {
        g_.text(x, y, MENU_LABELS[i]);
      }
      x += w + 10;
    }
    return;
  }
  const PetState& p = *m.pet;
  if (p.isEgg()) g_.text(22, y, "keep me warm");
  else if (p.shivering()) g_.text(16, y, "brr... walk me!");
  else if (p.hungry()) g_.text(37, y, "hungry!");
  else if (p.sad()) g_.text(43, y, "bored");
  else g_.text((128 - Gfx::textWidth(formName(p.form()))) / 2, y, formName(p.form()));
}

// ---------------------------------------------------------------- stats
void Ui::drawStats(const UiModel& m) {
  const PetState& p = *m.pet;
  char b[24];
  snprintf(b, sizeof(b), "%s  %lum", formName(p.form()), (unsigned long)(p.ageSeconds() / 60));
  g_.text(0, 17, b);
  snprintf(b, sizeof(b), "WALK  %5lum", (unsigned long)(p.total(Activity::WALK) / 60));
  g_.text(0, 27, b);
  snprintf(b, sizeof(b), "STILL %5lum", (unsigned long)(p.total(Activity::STILL) / 60));
  g_.text(0, 36, b);
  snprintf(b, sizeof(b), "SHAKE %5lum", (unsigned long)(p.total(Activity::SHAKE) / 60));
  g_.text(0, 45, b);
  snprintf(b, sizeof(b), "H%u E%u", p.happiness(), p.energy());
  g_.text(128 - Gfx::textWidth(b), 27, b);
  if (p.form() == Form::BABY) {
    g_.text(84, 40, "->");
    g_.text(128 - Gfx::textWidth(formName(p.dominantForm())), 49, formName(p.dominantForm()));
  }
  g_.text(0, 56, "A:menu");
}

// ---------------------------------------------------------------- evolve
void Ui::drawEvolve(uint32_t now) {
  uint32_t t = now - evoStart_;
  if (t < EVOLVE_ANIM_MS) {
    // Flicker between the old and new form, faster and faster, with flashes.
    uint32_t period = 300 - (t * 250 / EVOLVE_ANIM_MS);
    bool showNew = (t / period) % 2;
    drawPet(showNew ? evoTo_ : evoFrom_, 48, 19, now, false);
    g_.text(28, 56, "evolving...");
    if ((t / 90) % 7 == 0) g_.invertRect(0, 16, 128, 48);
  } else {
    drawPet(evoTo_, 48, 19, now, false);
    const char* n = formName(evoTo_);
    char b[16];
    snprintf(b, sizeof(b), "%s!", n);
    g_.text((128 - Gfx::textWidth(b)) / 2, 56, b);
  }
}
