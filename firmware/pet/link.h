// The §8 line protocol over BLE UART (Nordic UART Service via Bluefruit) and USB
// Serial at 115200 at the same time. Every line goes out on both; commands are
// accepted from both. Lines are ASCII, comma separated, <= 20 bytes with the '\n'.
#pragma once
#include <stdint.h>
#include "activity.h"

enum class CmdType : uint8_t { NONE, FEED, PLAY, DEMO, RESET, EVO, NAME, HELLO, RAW, TUNE, UNKNOWN };

struct Command {
  CmdType type = CmdType::NONE;
  int arg = 0;              // DEMO: 0/1
  char text[13] = {0};      // NAME: up to 12 chars; UNKNOWN: the command word
  bool fromSerial = false;
};

class Link {
public:
  void begin(const char* bleName);
  void update();                       // read both inputs, parse complete lines
  bool poll(Command& out);             // false when nothing is waiting
  bool connected() const;
  // true once each time the page subscribes to notifications (then send H, S, T).
  bool takeSubscribed();
  // Raw-stream mode: keep protocol lines off USB serial (BLE is unaffected).
  void setSerialQuiet(bool q) { serialQuiet_ = q; }

  void sendHello();
  void sendStatus(uint8_t happy, uint8_t energy, uint8_t form, Activity act, uint32_t age);
  void sendTotals(uint32_t walk, uint32_t still, uint32_t shake);
  void sendEvent(const char* name);                // E,HATCH
  void sendEvent(const char* name, long value);    // E,EVO,2
  void sendEvent(const char* name, char value);    // E,BTN,A
  void sendAck(const char* cmd, bool ok);          // A,FEED / X,EVO
  void sendModel(Activity act, uint8_t conf);      // M,W,92
  void sendLine(const char* line);                 // adds '\n', truncates to 19 chars

private:
  void feed(char c, char* buf, uint8_t& len, bool fromSerial);
  void parse(char* line, bool fromSerial);

  char bleBuf_[32];
  char serBuf_[32];
  uint8_t bleLen_ = 0, serLen_ = 0;
  static constexpr uint8_t QUEUE = 6;
  Command queue_[QUEUE];
  uint8_t qHead_ = 0, qLen_ = 0;
  bool serialQuiet_ = false;
};
