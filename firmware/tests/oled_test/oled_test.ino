// OLED check: draws text and a box, so you can confirm wiring and the 0x3C address.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// SDA = D4, SCL = D5 (default Wire pins on the XIAO)
Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Serial.begin(115200);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED not found at 0x3C");
    while (true) delay(100);
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Pengbit");          // yellow band (rows 0-15)
  display.drawRect(0, 16, 128, 48, SSD1306_WHITE);  // blue area
  display.setCursor(28, 36);
  display.println("OLED OK");
  display.display();
  Serial.println("OLED OK");
}

void loop() {}
