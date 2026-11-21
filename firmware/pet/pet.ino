// Pengbit: a pocket penguin that only thrives when you move.
// Board: Seeed XIAO nRF52840 (regular, not Sense), "Seeed nRF52 Boards" core (non-mbed).
// Wiring: OLED 0x3C + MPU-6500/9250 0x68 on D4 SDA / D5 SCL, buzzer D0 via NPN,
// buttons D1 A (menu), D2 B (select), D3 C (demo; hold = evolve now) to GND.
//
// Serial Monitor at 115200, "Newline": the same lines as BLE go out here, and you
// can type commands: C,FEED  C,PLAY  C,DEMO,1  C,EVO  C,RESET  C,HELLO  C,NAME,Bob
// Serial-only: RAW (accel stream for Edge Impulse), TUNE (mean/max for the plotter).
//
// No delay() in loop(): one millis() scheduler. Rules and numbers are in config.h.
#include <Arduino.h>
#include <Wire.h>
#include <string.h>
#include "config.h"
#include "arduino_i2c.h"
#include "ssd1306.h"
#include "mpu6500.h"
#include "gfx.h"
#include "ui.h"
#include "activity.h"
#include "activity_ml.h"
#include "pet_state.h"
#include "buttons.h"
#include "buzzer.h"
#include "link.h"

const int PIN_BUZZER = D0;
const int PIN_BTN_A  = D1;   // menu
const int PIN_BTN_B  = D2;   // select
const int PIN_BTN_C  = D3;   // demo mode; hold = evolve now

ArduinoI2c bus(Wire);        // D4 / D5, shared by the OLED and the IMU
Ssd1306 oled(bus, OLED_ADDR);
Mpu6500 imu(bus);
Gfx gfx(oled.buffer());
Ui ui(gfx);
ActivityDetector activity;
PetState pet;
Buttons buttons;
Buzzer buzzer;
Link petLink;                // not "link": clashes with POSIX link()

bool demo = false;
bool rawStream = false;      // RAW: x,y,z lines for the Edge Impulse data forwarder
bool tunePrint = false;      // TUNE: mean/max per window for the Serial Plotter
char petName[13] = "PENGBIT";
uint8_t lastFrame[Ssd1306::BUF_SIZE];

// ---------------------------------------------------------------- helpers
void sendStatus() {
  petLink.sendStatus(pet.happiness(), pet.energy(), (uint8_t)pet.form(), activity.result(),
                     pet.ageSeconds());
}

void sendTotals() {
  petLink.sendTotals(pet.total(Activity::WALK), pet.total(Activity::STILL),
                     pet.total(Activity::SHAKE));
}

void sendHelloBundle() {
  petLink.sendHello();
  sendStatus();
  sendTotals();
}

void setDemo(bool on) {
  demo = on;
  petLink.sendEvent("DEMO", (long)(on ? 1 : 0));
  ui.toast(on ? "DEMO x60 ON" : "DEMO OFF", millis());
}

void setQuiet() { petLink.setSerialQuiet(rawStream || tunePrint); }

bool doFeed() {
  if (!pet.feed()) return false;
  petLink.sendEvent("FED");
  ui.toast("yum! +energy", millis());
  buzzer.play(Chirp::HAPPY);
  return true;
}

bool doPlay() {
  if (!pet.play()) return false;
  petLink.sendEvent("PLAYED");
  ui.toast("wheee! +happy", millis());
  buzzer.play(Chirp::HAPPY);
  return true;
}

// Judge shortcut: same path for C,EVO and holding button C.
bool doEvolveNow() {
  if (pet.isEgg()) { ui.toast("still an egg!", millis()); return false; }
  if (!pet.forceEvolve()) { ui.toast("already evolved", millis()); return false; }
  return true;   // the EVOLVED event does the rest
}

void doReset() {
  pet.reset();
  activity.reset();
  ui.setScreen(Screen::HOME);
  ui.closeMenu();
  ui.toast("a new egg!", millis());
  buzzer.play(Chirp::CLICK);
}

// ---------------------------------------------------------------- inputs
void handleButtons(uint32_t now) {
  if (buttons.pressed(Button::A)) {
    ui.menuNext(now);
    petLink.sendEvent("BTN", 'A');
    buzzer.play(Chirp::CLICK);
  }
  if (buttons.pressed(Button::B)) {
    petLink.sendEvent("BTN", 'B');
    if (ui.menuOpen(now)) {
      MenuItem item = ui.menuItem();
      ui.closeMenu();
      if (item == MENU_FEED && !doFeed()) buzzer.play(Chirp::ERROR);
      if (item == MENU_PLAY && !doPlay()) buzzer.play(Chirp::ERROR);
      if (item == MENU_STATS) {
        ui.setScreen(ui.screen() == Screen::STATS ? Screen::HOME : Screen::STATS);
        buzzer.play(Chirp::CLICK);
      }
    } else {
      // No menu open: B flips between the home and stats screens.
      ui.setScreen(ui.screen() == Screen::STATS ? Screen::HOME : Screen::STATS);
      buzzer.play(Chirp::CLICK);
    }
  }
  if (buttons.longPressed(Button::B)) {
    buzzer.setMuted(!buzzer.muted());
    ui.toast(buzzer.muted() ? "sound off" : "sound on", now);
    if (!buzzer.muted()) buzzer.play(Chirp::CLICK);
  }
  if (buttons.pressed(Button::C)) {
    petLink.sendEvent("BTN", 'C');
    setDemo(!demo);
    buzzer.play(Chirp::CLICK);
  }
  if (buttons.longPressed(Button::C)) {
    if (!doEvolveNow()) buzzer.play(Chirp::ERROR);
  }
}

void handleCommands() {
  Command c;
  while (petLink.poll(c)) {
    switch (c.type) {
      case CmdType::FEED:  petLink.sendAck("FEED", doFeed()); break;
      case CmdType::PLAY:  petLink.sendAck("PLAY", doPlay()); break;
      case CmdType::DEMO:  petLink.sendAck("DEMO", true); setDemo(c.arg != 0); break;
      case CmdType::RESET: doReset(); petLink.sendAck("RESET", true); sendHelloBundle(); break;
      case CmdType::EVO:   petLink.sendAck("EVO", doEvolveNow()); break;
      case CmdType::NAME:
        if (c.text[0]) {
          strncpy(petName, c.text, sizeof(petName) - 1);
          for (char* p = petName; *p; p++) if (*p >= 'a' && *p <= 'z') *p -= 32;
        }
        petLink.sendAck("NAME", c.text[0] != 0);
        break;
      case CmdType::HELLO: sendHelloBundle(); break;
      case CmdType::RAW:
        rawStream = !rawStream;
        tunePrint = false;
        setQuiet();
        break;
      case CmdType::TUNE:
        tunePrint = !tunePrint;
        rawStream = false;
        setQuiet();
        break;
      case CmdType::UNKNOWN: petLink.sendAck(c.text, false); break;
      case CmdType::NONE: break;
    }
  }
}

// ---------------------------------------------------------------- pet events
void handlePetEvents(uint32_t now) {
  PetEvent e;
  while (pet.pollEvent(e)) {
    switch (e.type) {
      case PetEventType::HATCHED:
        petLink.sendEvent("HATCH");
        buzzer.play(Chirp::HATCH);
        ui.toast("it hatched!", now, 2500);
        break;
      case PetEventType::EVOLVED:
        sendTotals();                          // §8: T right before E,EVO
        petLink.sendEvent("EVO", (long)e.value);
        buzzer.play(Chirp::EVOLVE);
        ui.setScreen(Screen::HOME);
        ui.closeMenu();
        ui.startEvolve(Form::BABY, (Form)e.value, now);
        break;
      case PetEventType::HUNGRY:
        petLink.sendEvent("HUNGRY");
        buzzer.play(Chirp::HUNGRY);
        break;
      case PetEventType::SAD:
        petLink.sendEvent("SAD");
        buzzer.play(Chirp::HUNGRY);
        break;
      case PetEventType::IDLE:
        petLink.sendEvent("IDLE", (long)e.value);
        buzzer.play(Chirp::NUDGE);
        break;
      case PetEventType::MOVE:
        petLink.sendEvent("MOVE");
        buzzer.play(Chirp::HAPPY);
        ui.toast("warm again!", now);
        break;
      case PetEventType::NONE: break;
    }
  }
}

// ---------------------------------------------------------------- IMU
void readImu() {
  AccelSample s;
  if (!imu.readAccel(s)) return;
  float x = Mpu6500::toG(s.x), y = Mpu6500::toG(s.y), z = Mpu6500::toG(s.z);
  activity.addSample(x, y, z);
  if (rawStream && Serial) {
    Serial.print(x, 3); Serial.print(','); Serial.print(y, 3); Serial.print(','); Serial.println(z, 3);
  }
  if (activity.windowReady()) {
    if (activity.usingModel()) petLink.sendModel(activity.result(), activity.confidence());
    if (tunePrint && Serial) {
      Serial.print("mean:"); Serial.print(activity.lastMean(), 3);
      Serial.print(" max:"); Serial.print(activity.lastMax(), 3);
      Serial.print(" act:"); Serial.println((int)activity.result());
    }
  }
}

// ---------------------------------------------------------------- setup / loop
void drawSplash() {
  gfx.clear();
  gfx.text(22, 0, "PENGBIT", 2);
  gfx.text(4, 24, "move to thrive");
  gfx.text(4, 40, imu.ok() ? imu.chipName() : "IMU not found");
  gfx.text(4, 52, "fw " FW_VERSION);
  oled.flush();
}

void setup() {
  Serial.begin(115200);
  buttons.begin(PIN_BTN_A, PIN_BTN_B, PIN_BTN_C);
  buzzer.begin(PIN_BUZZER);

  bus.begin(I2C_CLOCK_HZ);
  delay(100);                                   // OLED power-up
  bool oledOk = oled.begin();
  bool imuOk = imu.begin(IMU_ADDR);
  drawSplash();

  Classifier* ml = mlClassifier();
  if (ml) activity.setClassifier(ml);

  petLink.begin("Pengbit");
  pet.reset();

  // Short boot report (also handy when the screen is dark).
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 1500) {}    // give USB a moment, never block on battery
  Serial.print("# Pengbit fw "); Serial.println(FW_VERSION);
  Serial.print("# OLED 0x3C: "); Serial.println(oledOk ? "ok" : "NOT FOUND");
  Serial.print("# IMU: ");
  if (imuOk) { Serial.print(imu.chipName()); Serial.print(" WHO_AM_I=0x"); Serial.print(imu.whoAmI(), HEX);
               Serial.print(" at 0x"); Serial.println(imu.address(), HEX); }
  else Serial.println("NOT FOUND (pet stays STILL)");
  Serial.print("# classifier: "); Serial.println(ml ? "Edge Impulse" : "thresholds");

  buzzer.play(Chirp::HAPPY);
  memset(lastFrame, 0xA5, sizeof(lastFrame));   // force the first flush
}

void loop() {
  static uint32_t lastImu = 0, lastTick = 0, lastTotals = 0, lastFrameAt = 0, lastRetry = 0;
  uint32_t now = millis();

  buttons.update(now);
  buzzer.update(now);
  petLink.update();
  handleButtons(now);
  handleCommands();
  if (petLink.takeSubscribed()) sendHelloBundle();

  if (now - lastImu >= IMU_PERIOD_MS) {
    lastImu += IMU_PERIOD_MS;
    if (now - lastImu > 4 * IMU_PERIOD_MS) lastImu = now;   // don't burst after a stall
    readImu();
  }

  // Hot-plug recovery: re-init a missing OLED or IMU every couple of seconds.
  if (now - lastRetry >= IMU_RETRY_MS) {
    lastRetry = now;
    if (!imu.ok()) imu.begin(IMU_ADDR);
    if (!oled.ok()) { oled.begin(); memset(lastFrame, 0xA5, sizeof(lastFrame)); }
  }

  if (now - lastTick >= TICK_PERIOD_MS) {
    lastTick += TICK_PERIOD_MS;
    if (now - lastTick > TICK_PERIOD_MS) lastTick = now;
    pet.tick(demo ? DEMO_SPEEDUP : 1, imu.ok() ? activity.result() : Activity::STILL);
    handlePetEvents(now);
    sendStatus();
  }

  if (now - lastTotals >= TOTALS_PERIOD_MS) {
    lastTotals = now;
    sendTotals();
  }

  if (now - lastFrameAt >= FRAME_PERIOD_MS) {
    lastFrameAt = now;
    UiModel m;
    m.pet = &pet;
    m.act = activity.result();
    m.conf = activity.confidence();
    m.mlActive = activity.usingModel();
    m.demo = demo;
    m.bleConnected = petLink.connected();
    m.imuOk = imu.ok();
    m.rawStream = rawStream;
    m.name = petName;
    ui.draw(m, now);
    if (oled.ok() && memcmp(lastFrame, oled.buffer(), sizeof(lastFrame)) != 0) {
      if (oled.flush()) memcpy(lastFrame, oled.buffer(), sizeof(lastFrame));
    }
  }
}
