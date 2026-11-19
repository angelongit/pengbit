// Pengbit main sketch. Wires the modules together; see ../ARCHITECTURE.md.
// Board: Seeed XIAO nRF52840 Sense (Seeed nRF52 core, non-mbed).
#include <Arduino.h>
#include <Wire.h>
#include "config.h"
#include "arduino_i2c.h"
#include "ssd1306.h"
#include "gfx.h"
#include "ui.h"
#include "lsm6ds3.h"
#include "activity.h"
#include "pet_state.h"
#include "buttons.h"
#include "buzzer.h"
#include "link.h"

const int PIN_BUZZER = D0;
const int PIN_BTN_A  = D1;   // menu
const int PIN_BTN_B  = D2;   // select
const int PIN_BTN_C  = D3;   // demo mode

ArduinoI2c oledBus(Wire);    // D4 / D5
ArduinoI2c imuBus(Wire1);    // internal IMU bus: confirm in variant.h (ARCHITECTURE.md 4.1)

Ssd1306 oled(oledBus, OLED_ADDR);
Gfx gfx(oled);
Ui ui(gfx);
Lsm6ds3 imu(imuBus, IMU_ADDR);
ActivityDetector activity;
PetState pet;
Buttons buttons;
Buzzer buzzer;
Link petLink;   // not "link": clashes with POSIX link()

bool demo = false;

void setup() {
  Serial.begin(115200);
  buttons.begin(PIN_BTN_A, PIN_BTN_B, PIN_BTN_C);
  buzzer.begin(PIN_BUZZER);

  oledBus.begin(I2C_CLOCK_HZ);
  if (!oled.begin()) Serial.println("OLED init failed");

#ifdef PIN_LSM6DS3TR_C_POWER
  pinMode(PIN_LSM6DS3TR_C_POWER, OUTPUT);
  digitalWrite(PIN_LSM6DS3TR_C_POWER, HIGH);   // IMU supply
  delay(10);
#endif
  imuBus.begin(I2C_CLOCK_HZ);
  if (!imu.begin()) Serial.println("IMU init failed");

  petLink.begin();
  pet.reset();
  buzzer.play(Chirp::HAPPY);
}

void handleCommand(Command c) {
  switch (c) {
    case Command::FEED:     pet.feed(); buzzer.play(Chirp::HAPPY); break;
    case Command::PLAY:     pet.play(); buzzer.play(Chirp::HAPPY); break;
    case Command::DEMO_ON:  demo = true; break;
    case Command::DEMO_OFF: demo = false; break;
    case Command::RESET:    pet.reset(); break;
    case Command::NONE:     return;
  }
  ui.markDirty();
}

void handleButtons() {
  if (buttons.pressed(Button::A)) { ui.nextScreen(); petLink.sendButton('A'); buzzer.play(Chirp::CLICK); }
  if (buttons.pressed(Button::B)) { handleCommand(Command::FEED); petLink.sendButton('B'); }  // TODO: menu select
  if (buttons.pressed(Button::C)) { demo = !demo; ui.markDirty(); petLink.sendButton('C'); buzzer.play(Chirp::CLICK); }
}

void handlePetEvents() {
  for (PetEvent e = pet.pollEvent(); e != PetEvent::NONE; e = pet.pollEvent()) {
    switch (e) {
      case PetEvent::HATCHED: buzzer.play(Chirp::HATCH); ui.markDirty(); break;
      case PetEvent::EVOLVED:
        buzzer.play(Chirp::EVOLVE);
        ui.show(Screen::EVOLVING);
        petLink.sendEvolved((uint8_t)pet.form());
        break;
      case PetEvent::HUNGRY:
      case PetEvent::SAD:     buzzer.play(Chirp::HUNGRY); break;
      case PetEvent::NONE:    break;
    }
  }
}

void loop() {
  static uint32_t lastImu = 0, lastTick = 0, lastFrame = 0;
  uint32_t now = millis();

  buttons.update(now);
  buzzer.update(now);
  petLink.update();
  handleButtons();
  handleCommand(petLink.pollCommand());

  if (now - lastImu >= IMU_PERIOD_MS) {
    lastImu = now;
    AccelSample s;
    if (imu.readAccel(s)) {
      activity.addSample(Lsm6ds3::toG(s.x), Lsm6ds3::toG(s.y), Lsm6ds3::toG(s.z));
    }
    if (activity.windowReady()) {
      // Tuning aid: uncomment and open the Serial Plotter.
      // Serial.print("mean:"); Serial.print(activity.lastMean(), 3);
      // Serial.print(" max:"); Serial.println(activity.lastMax(), 3);
    }
  }

  if (now - lastTick >= TICK_PERIOD_MS) {
    lastTick = now;
    pet.tick(demo ? DEMO_SPEEDUP : 1, activity.result());
    handlePetEvents();
    uint8_t form = pet.form() == Form::EGG ? 0 : (uint8_t)pet.form();
    petLink.sendStatus(pet.happiness(), pet.energy(), form, activity.result(), pet.ageSeconds() / 60);
    ui.markDirty();
  }

  if (now - lastFrame >= FRAME_PERIOD_MS) {
    lastFrame = now;
    if (ui.draw(pet, demo, now)) oled.flush();
  }
}
