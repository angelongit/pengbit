// Laptop tests for the pure C++ pet logic and a PNG preview of the screens.
// Build and run:  make   (needs g++; the preview step needs python3 + Pillow)
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <cstring>
#include <initializer_list>
#include "../pet/pet_state.h"
#include "../pet/activity.h"
#include "../pet/gfx.h"
#include "../pet/ui.h"

static int fails = 0;
#define CHECK(c) do { if (!(c)) { printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #c); fails++; } } while (0)

static PetEventType drainLast(PetState& p, PetEventType want, uint16_t* val = nullptr) {
  PetEvent e; PetEventType found = PetEventType::NONE;
  while (p.pollEvent(e)) if (e.type == want) { found = want; if (val) *val = e.value; }
  return found;
}

static void runDemo(PetState& p, Activity a, uint32_t realSeconds) {
  for (uint32_t i = 0; i < realSeconds; i++) p.tick(DEMO_SPEEDUP, a);
}

void testHatch() {
  PetState p;
  CHECK(p.isEgg());
  CHECK(!p.feed());
  CHECK(!p.forceEvolve());
  for (int i = 0; i < 4; i++) p.tick(60, Activity::STILL);
  CHECK(p.isEgg());
  p.tick(60, Activity::STILL);                   // 5 pet minutes
  CHECK(p.form() == Form::BABY);
  CHECK(drainLast(p, PetEventType::HATCHED) == PetEventType::HATCHED);
  CHECK(p.happiness() == STAT_START && p.energy() == STAT_START);
}

void hatch(PetState& p) { p.reset(); p.tick(HATCH_AGE_S, Activity::STILL); PetEvent e; while (p.pollEvent(e)) {} }

void testWalkEvolvesSprinter() {
  PetState p; hatch(p);
  // Walk for the whole evolution age, feeding when hungry.
  uint16_t form = 99;
  for (uint32_t s = 0; s < 700 && p.form() == Form::BABY; s++) {
    p.tick(60, Activity::WALK);
    if (p.energy() < 30) p.feed();
  }
  CHECK(p.form() == Form::SPRINTER);
  p.reset(); hatch(p);
  for (uint32_t s = 0; s < 700 && p.form() == Form::BABY; s++) { p.tick(60, Activity::WALK); if (p.energy() < 30) p.feed(); }
  (void)form;
}

void testStillNeedsHappiness() {
  PetState p; hatch(p);
  runDemo(p, Activity::STILL, 600);              // 600 pet minutes still
  // Happiness drains at -1/min while still, so it cannot pass the gate alone.
  CHECK(p.form() == Form::BABY);
  CHECK(p.sad());
  p.play(); p.play(); p.play();                  // +45 happiness
  p.tick(60, Activity::STILL);
  CHECK(p.form() == Form::FROST);
}

void testForceEvolveAndTies() {
  PetState p; hatch(p);
  CHECK(p.forceEvolve());                        // all totals 0: tie -> walk wins
  CHECK(p.form() == Form::SPRINTER);
  CHECK(!p.forceEvolve());                       // only once
  p.reset(); hatch(p);
  runDemo(p, Activity::SHAKE, 3);
  runDemo(p, Activity::STILL, 3);                // shake == still -> shake wins
  CHECK(p.dominantForm() == Form::GLITCH);
  runDemo(p, Activity::WALK, 3);                 // three-way tie -> walk wins
  CHECK(p.dominantForm() == Form::SPRINTER);
  p.forceEvolve();
  uint16_t v = 0;
  CHECK(drainLast(p, PetEventType::EVOLVED, &v) == PetEventType::EVOLVED && v == 1);
}

void testNudge() {
  PetState p; hatch(p);
  runDemo(p, Activity::STILL, 44);
  CHECK(!p.shivering());
  CHECK(drainLast(p, PetEventType::IDLE) == PetEventType::NONE);
  runDemo(p, Activity::STILL, 1);                // 45 pet minutes
  uint16_t mins = 0;
  CHECK(p.shivering());
  CHECK(drainLast(p, PetEventType::IDLE, &mins) == PetEventType::IDLE && mins == 45);
  runDemo(p, Activity::SHAKE, 5);                // shake does not clear the streak
  CHECK(p.shivering());
  runDemo(p, Activity::STILL, 30);               // next nudge 30 min later (75)
  CHECK(drainLast(p, PetEventType::IDLE, &mins) == PetEventType::IDLE && mins == 75);
  runDemo(p, Activity::WALK, 1);
  CHECK(!p.shivering());
  CHECK(drainLast(p, PetEventType::MOVE) == PetEventType::MOVE);
  runDemo(p, Activity::WALK, 1);                 // MOVE only once
  CHECK(drainLast(p, PetEventType::MOVE) == PetEventType::NONE);
}

void testLowStatEventsOnce() {
  PetState p; hatch(p);
  int hungry = 0;
  for (int i = 0; i < 100; i++) { p.tick(60, Activity::SHAKE); PetEvent e; while (p.pollEvent(e)) if (e.type == PetEventType::HUNGRY) hungry++; }
  CHECK(hungry == 1);
  CHECK(p.energy() == 0);
  p.feed(); p.feed();                            // 40: recovered, re-armed
  for (int i = 0; i < 30; i++) { p.tick(60, Activity::SHAKE); PetEvent e; while (p.pollEvent(e)) if (e.type == PetEventType::HUNGRY) hungry++; }
  CHECK(hungry == 2);
}

void testRealTime() {
  PetState p;
  for (int i = 0; i < 299; i++) p.tick(1, Activity::STILL);
  CHECK(p.isEgg());
  p.tick(1, Activity::STILL);
  CHECK(!p.isEgg());
  for (int i = 0; i < 59; i++) p.tick(1, Activity::WALK);
  CHECK(p.happiness() == STAT_START);           // not a full minute yet
  p.tick(1, Activity::WALK);
  CHECK(p.happiness() == STAT_START + BASE_HAPPY + WALK_HAPPY);
}

// Synthetic accel: still = gravity + noise, walk = ~2 Hz bob, shake = big fast swings.
void testThresholds() {
  ActivityDetector d;
  auto feed = [&](int kind) {
    for (int i = 0; i < ACT_WINDOW_SAMPLES; i++) {
      float t = i / 50.0f, n = ((rand() % 100) - 50) / 5000.0f;
      float z = 1.0f + n;
      if (kind == 1) z += 0.25f * sinf(2 * 3.14159f * 2.0f * t);
      if (kind == 2) z += 1.8f * sinf(2 * 3.14159f * 6.0f * t);
      d.addSample(n, n, z);
    }
    CHECK(d.windowReady());
    return d.result();
  };
  CHECK(feed(0) == Activity::STILL);
  CHECK(feed(1) == Activity::WALK);
  CHECK(feed(2) == Activity::SHAKE);
}

// ---------------------------------------------------------------- preview
static uint8_t fb[1024];
static void dump(FILE* f, const char* name) {
  fprintf(f, "%s\n", name);
  for (int y = 0; y < 64; y++) {
    for (int x = 0; x < 128; x++) fputc((fb[x + (y / 8) * 128] >> (y & 7)) & 1 ? '#' : '.', f);
    fputc('\n', f);
  }
}

void preview(const char* path) {
  FILE* f = fopen(path, "w");
  Gfx g(fb); Ui ui(g);
  PetState p; UiModel m; m.pet = &p;
  ui.draw(m, 0); dump(f, "egg");
  hatch(p); m.act = Activity::WALK; m.bleConnected = true; runDemo(p, Activity::WALK, 30);
  ui.draw(m, 0); dump(f, "baby walking");
  m.demo = true; ui.menuNext(1000); ui.menuNext(1001);
  ui.draw(m, 1002); dump(f, "menu (PLAY selected), demo on");
  PetState q; hatch(q); runDemo(q, Activity::STILL, 50); m.pet = &q; m.act = Activity::STILL; m.demo = false;
  ui.closeMenu(); ui.draw(m, 9000); dump(f, "shivering + sad after sitting");
  m.pet = &p; ui.setScreen(Screen::STATS); ui.draw(m, 9000); dump(f, "stats");
  ui.setScreen(Screen::HOME);
  for (int form : {1, 2, 3}) {
    PetState e; hatch(e);
    runDemo(e, form == 1 ? Activity::WALK : form == 2 ? Activity::STILL : Activity::SHAKE, 2);
    e.forceEvolve(); m.pet = &e; m.act = Activity::WALK;
    ui.startEvolve(Form::BABY, e.form(), 0);
    ui.draw(m, 4000); char n[32]; snprintf(n, sizeof n, "evolved form %d", form); dump(f, n);
    ui.draw(m, 20000); snprintf(n, sizeof n, "home form %d", form); dump(f, n);
  }
  fclose(f);
}

int main(int argc, char** argv) {
  testHatch();
  testWalkEvolvesSprinter();
  testStillNeedsHappiness();
  testForceEvolveAndTies();
  testNudge();
  testLowStatEventsOnce();
  testRealTime();
  testThresholds();
  if (argc > 1) preview(argv[1]);
  printf(fails ? "%d FAILED\n" : "all tests passed\n", fails);
  return fails ? 1 : 0;
}
