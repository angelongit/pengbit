// BLE check: Nordic UART service. Connect from the web page (or nRF Connect),
// and anything you send comes back as "echo:<text>". Also sends a line every 2 s.
#include <bluefruit.h>

BLEUart bleuart;

void setup() {
  Serial.begin(115200);
  Bluefruit.begin();
  Bluefruit.setName("Pengbit");
  bleuart.begin();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.start(0);
  Serial.println("Advertising as Pengbit");
}

void loop() {
  static unsigned long last = 0;
  if (Bluefruit.connected() && millis() - last > 2000) {
    last = millis();
    bleuart.print("ping\n");
  }
  if (bleuart.available()) {
    String line = bleuart.readStringUntil('\n');
    bleuart.print("echo:" + line + "\n");
    Serial.println("got: " + line);
  }
}
