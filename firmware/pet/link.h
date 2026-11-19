// Line protocol from docs/ble-protocol.md over BLE UART (Bluefruit) and USB Serial.
// Every line goes out on both, and commands are accepted from both.
#pragma once
#include <stdint.h>
#include "activity.h"

enum class Command : uint8_t { NONE, FEED, PLAY, DEMO_ON, DEMO_OFF, RESET };

class Link {
public:
  void begin();                 // Bluefruit.begin, name "Pengbit", BLEUart, advertising (see tests/ble_test)
  void update();                // read bytes from both inputs into line buffers, parse on '\n'
  Command pollCommand();        // NONE when nothing waiting

  void sendStatus(uint8_t happy, uint8_t energy, uint8_t form, Activity act, uint32_t ageMin);
  void sendEvolved(uint8_t form);   // E,EVO,n
  void sendButton(char name);       // E,BTN,A
  bool connected() const;

private:
  void sendLine(const char* line);  // < 20 bytes incl. '\n'
  Command parse(const char* line);  // "C,FEED" etc.

  char bleLine_[24] = {0};
  char serLine_[24] = {0};
  uint8_t bleLen_ = 0, serLen_ = 0;
  Command pending_ = Command::NONE;
};
