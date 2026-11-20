// Pengbit bench test: checks every part one at a time on the breadboard.
//
// Open Serial Monitor at 115200 baud, line ending "Newline" or "No line ending",
// then type a number and press Enter:
//
//   1  Blink        onboard LED (no wiring needed)
//   2  I2C scan     lists every address on SDA D4 / SCL D5 (OLED should be 0x3C)
//   3  OLED         text in the yellow band, a box and a counter in the blue area
//   4  Buttons      prints A / B / C presses (D1, D2, D3 to GND, INPUT_PULLUP)
//   5  Buzzer       three chirps through the NPN on D0
//   6  IMU          built-in LSM6DS3: x/y/z in g plus magnitude, ~10 Hz
//   0  Stop         stop the running test, show the menu again
//
// Wiring for each stage is in firmware/tests/bench_test/README.md.
// Libraries: Adafruit SSD1306, Adafruit GFX Library, Seeed Arduino LSM6DS3.

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <LSM6DS3.h>

// ---- Pins (match docs/wiring.md) ----
const int PIN_BUZZER = D0;  // NPN base through 1k
const int PIN_BTN_A  = D1;  // menu
const int PIN_BTN_B  = D2;  // select
const int PIN_BTN_C  = D3;  // demo mode
// OLED SDA = D4, SCL = D5: these are the default Wire pins, nothing to set.

const uint8_t OLED_ADDR = 0x3C;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
LSM6DS3 imu(I2C_MODE, 0x6A);  // on its own internal bus, not D4/D5

bool oledReady = false;
bool imuReady = false;
int stage = 0;              // which test is running, 0 = none
unsigned long stageStart = 0;
unsigned long lastTick = 0;

// ---------------------------------------------------------------- helpers

void printMenu() {
  Serial.println();
  Serial.println(F("=== Pengbit bench test ==="));
  Serial.println(F(" 1 Blink   2 I2C scan   3 OLED"));
  Serial.println(F(" 4 Buttons 5 Buzzer     6 IMU"));
  Serial.println(F(" 0 Stop"));
  Serial.print(F("> "));
}

// The onboard LEDs on the XIAO are active LOW: LOW = on.
void ledOn(bool on) { digitalWrite(LED_BUILTIN, on ? LOW : HIGH); }

void chirp(int ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

// ---------------------------------------------------------------- stages

void startBlink() {
  Serial.println(F("[1] Blink: onboard LED should flash once per second."));
}
void tickBlink() {
  if (millis() - lastTick < 500) return;
  lastTick = millis();
  static bool on = false;
  on = !on;
  ledOn(on);
  Serial.println(on ? F("LED on") : F("LED off"));
}

void runI2CScan() {
  Serial.println(F("[2] I2C scan on SDA D4 / SCL D5..."));
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    uint8_t err = Wire.endTransmission();
    if (err == 0) {
      Serial.print(F("  found device at 0x"));
      if (addr < 16) Serial.print('0');
      Serial.print(addr, HEX);
      if (addr == 0x3C || addr == 0x3D) Serial.print(F("  <- SSD1306 OLED"));
      Serial.println();
      found++;
    }
  }
  if (found == 0) {
    Serial.println(F("  nothing found. Check VCC on 3V3, GND, and that SDA/SCL"));
    Serial.println(F("  are not swapped (module order is GND VCC SCL SDA)."));
  } else {
    Serial.print(F("  ")); Serial.print(found); Serial.println(F(" device(s)."));
  }
  Serial.println(F("  (The IMU at 0x6A is on a separate internal bus, so it won't show here.)"));
  stage = 0;
  printMenu();
}

void startOled() {
  Serial.println(F("[3] OLED test"));
  if (!oledReady) {
    oledReady = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  }
  if (!oledReady) {
    Serial.println(F("  OLED not found at 0x3C. Run test 2 (I2C scan) first."));
    stage = 0;
    printMenu();
    return;
  }
  Serial.println(F("  You should see 'Pengbit' on top (yellow), a box and a counter (blue)."));
}
void tickOled() {
  if (millis() - lastTick < 250) return;
  lastTick = millis();
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.print("Pengbit");                       // rows 0-15: yellow band
  display.drawRect(0, 18, 128, 46, SSD1306_WHITE);  // blue area
  display.setTextSize(1);
  display.setCursor(6, 26);
  display.print("OLED OK");
  display.setCursor(6, 40);
  display.print("t = ");
  display.print((millis() - stageStart) / 1000);
  display.print(" s");
  // a little dot that bounces, to show the screen is refreshing
  int x = 6 + ((millis() / 50) % 110);
  display.fillCircle(x, 56, 2, SSD1306_WHITE);
  display.display();
}

const int buttons[3] = {PIN_BTN_A, PIN_BTN_B, PIN_BTN_C};
const char* buttonNames[3] = {"A (menu)", "B (select)", "C (demo)"};
bool lastDown[3] = {false, false, false};
unsigned long lastChange[3] = {0, 0, 0};

void startButtons() {
  Serial.println(F("[4] Buttons: press A, B, C. Each press prints once."));
  for (int i = 0; i < 3; i++) {
    lastDown[i] = digitalRead(buttons[i]) == LOW;
    if (lastDown[i]) {
      Serial.print(F("  warning: ")); Serial.print(buttonNames[i]);
      Serial.println(F(" reads pressed already. Wrong legs? Try the diagonal pair."));
    }
  }
}
void tickButtons() {
  for (int i = 0; i < 3; i++) {
    bool down = digitalRead(buttons[i]) == LOW;
    // 30 ms debounce: ignore changes that come too soon after the last one
    if (down != lastDown[i] && millis() - lastChange[i] > 30) {
      lastChange[i] = millis();
      lastDown[i] = down;
      Serial.print(F("  ")); Serial.print(buttonNames[i]);
      Serial.println(down ? F(" pressed") : F(" released"));
    }
  }
}

void runBuzzer() {
  Serial.println(F("[5] Buzzer: three chirps (short, short, long)."));
  chirp(60);  delay(120);
  chirp(60);  delay(120);
  chirp(250);
  Serial.println(F("  Heard nothing? Check NPN orientation (flat side: E B C) and buzzer + to 3V3."));
  stage = 0;
  printMenu();
}

void startImu() {
  Serial.println(F("[6] IMU: lay it flat, z should read about 1.00 g. Shake it to see mag jump."));
  if (!imuReady) imuReady = (imu.begin() == 0);
  if (!imuReady) {
    Serial.println(F("  IMU not found. Check the board is set to 'Seeed XIAO nRF52840 Sense'."));
    stage = 0;
    printMenu();
  }
}
void tickImu() {
  if (millis() - lastTick < 100) return;
  lastTick = millis();
  float x = imu.readFloatAccelX();
  float y = imu.readFloatAccelY();
  float z = imu.readFloatAccelZ();
  float mag = sqrt(x * x + y * y + z * z);
  // "name:value" pairs also work in Serial Plotter
  Serial.print("x:");    Serial.print(x, 2);
  Serial.print(" y:");   Serial.print(y, 2);
  Serial.print(" z:");   Serial.print(z, 2);
  Serial.print(" mag:"); Serial.println(mag, 2);
}

// ---------------------------------------------------------------- main

void startStage(int s) {
  // clean up whatever was running
  ledOn(false);
  digitalWrite(PIN_BUZZER, LOW);
  if (oledReady) { display.clearDisplay(); display.display(); }

  stage = s;
  stageStart = millis();
  lastTick = 0;
  switch (s) {
    case 0: Serial.println(F("Stopped.")); printMenu(); break;
    case 1: startBlink(); break;
    case 2: runI2CScan(); break;
    case 3: startOled(); break;
    case 4: startButtons(); break;
    case 5: runBuzzer(); break;
    case 6: startImu(); break;
    default:
      Serial.println(F("Unknown option."));
      stage = 0;
      printMenu();
  }
}

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  ledOn(false);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  for (int i = 0; i < 3; i++) pinMode(buttons[i], INPUT_PULLUP);

  Serial.begin(115200);
  unsigned long t = millis();
  while (!Serial && millis() - t < 4000) delay(10);  // wait for the monitor, max 4 s

  Wire.begin();  // D4/D5
  printMenu();
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c >= '0' && c <= '9') {
      Serial.println(c);
      startStage(c - '0');
    }
    // ignore '\r', '\n' and anything else
  }

  switch (stage) {
    case 1: tickBlink(); break;
    case 3: tickOled(); break;
    case 4: tickButtons(); break;
    case 6: tickImu(); break;
    default: break;
  }
}
