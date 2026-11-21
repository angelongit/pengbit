#include "link.h"
#include <Arduino.h>
#include <bluefruit.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include "config.h"

static BLEUart bleuart;
static volatile bool subscribed = false;

static void onNotify(uint16_t, bool enabled) {
  if (enabled) subscribed = true;
}

static uint32_t clamp5(uint32_t v) { return v > 99999 ? 99999 : v; }   // keep lines <= 20 bytes

static uint32_t linkTime(uint32_t petSeconds) {
#if LINK_TIME_SECONDS
  return clamp5(petSeconds);
#else
  return clamp5(petSeconds / 60);
#endif
}

void Link::begin(const char* bleName) {
  Bluefruit.begin();
  Bluefruit.setTxPower(4);
  Bluefruit.setName(bleName);
  bleuart.begin();
  bleuart.setNotifyCallback(onNotify);

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addService(bleuart);
  Bluefruit.ScanResponse.addName();
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);   // 20 ms fast, 152.5 ms slow (0.625 ms units)
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);               // advertise forever
}

bool Link::connected() const { return Bluefruit.connected() > 0; }

bool Link::takeSubscribed() {
  if (!subscribed) return false;
  subscribed = false;
  return true;
}

void Link::update() {
  while (bleuart.available()) feed((char)bleuart.read(), bleBuf_, bleLen_, false);
  while (Serial.available()) feed((char)Serial.read(), serBuf_, serLen_, true);
}

void Link::feed(char c, char* buf, uint8_t& len, bool fromSerial) {
  if (c == '\r') return;
  if (c == '\n') {
    buf[len] = 0;
    if (len) parse(buf, fromSerial);
    len = 0;
    return;
  }
  if (len < 31) buf[len++] = c;   // overlong lines get truncated, then ignored if unknown
}

void Link::parse(char* line, bool fromSerial) {
  Command c;
  c.fromSerial = fromSerial;
  // Serial-only extras (not part of §8): RAW toggles the Edge Impulse raw accel
  // stream, TUNE toggles mean/max per window for the Serial Plotter.
  if (fromSerial && (!strcmp(line, "RAW") || !strcmp(line, "raw"))) {
    c.type = CmdType::RAW;
  } else if (fromSerial && (!strcmp(line, "TUNE") || !strcmp(line, "tune"))) {
    c.type = CmdType::TUNE;
  } else {
    if (line[0] != 'C' || line[1] != ',') return;   // not a command: ignore, never crash
    char* word = line + 2;
    char* arg = strchr(word, ',');
    if (arg) *arg++ = 0;
    if      (!strcmp(word, "FEED"))  c.type = CmdType::FEED;
    else if (!strcmp(word, "PLAY"))  c.type = CmdType::PLAY;
    else if (!strcmp(word, "RESET")) c.type = CmdType::RESET;
    else if (!strcmp(word, "EVO"))   c.type = CmdType::EVO;
    else if (!strcmp(word, "HELLO")) c.type = CmdType::HELLO;
    else if (!strcmp(word, "DEMO"))  { c.type = CmdType::DEMO; c.arg = arg ? atoi(arg) : 1; }
    else if (!strcmp(word, "NAME"))  {
      c.type = CmdType::NAME;
      strncpy(c.text, arg ? arg : "", 12);
      c.text[12] = 0;
    } else {
      c.type = CmdType::UNKNOWN;
      strncpy(c.text, word, 12);
      c.text[12] = 0;
    }
  }
  if (qLen_ == QUEUE) return;   // full: drop
  queue_[(qHead_ + qLen_) % QUEUE] = c;
  qLen_++;
}

bool Link::poll(Command& out) {
  if (!qLen_) return false;
  out = queue_[qHead_];
  qHead_ = (qHead_ + 1) % QUEUE;
  qLen_--;
  return true;
}

void Link::sendLine(const char* line) {
  char b[21];
  size_t n = strlen(line);
  if (n > 19) n = 19;
  memcpy(b, line, n);
  b[n++] = '\n';
  if (connected() && bleuart.notifyEnabled()) bleuart.write((const uint8_t*)b, n);
  if (!serialQuiet_ && Serial) Serial.write((const uint8_t*)b, n);
}

void Link::sendHello() {
  char b[24];
  snprintf(b, sizeof(b), "H,%d,%s", PROTO_VERSION, FW_VERSION);
  sendLine(b);
}

void Link::sendStatus(uint8_t happy, uint8_t energy, uint8_t form, Activity act, uint32_t age) {
  char b[24];
  snprintf(b, sizeof(b), "S,%u,%u,%u,%c,%lu", happy, energy, form, activityCode(act),
           (unsigned long)linkTime(age));
  sendLine(b);
}

void Link::sendTotals(uint32_t walk, uint32_t still, uint32_t shake) {
  char b[24];
  snprintf(b, sizeof(b), "T,%lu,%lu,%lu", (unsigned long)linkTime(walk),
           (unsigned long)linkTime(still), (unsigned long)linkTime(shake));
  sendLine(b);
}

void Link::sendEvent(const char* name) {
  char b[24];
  snprintf(b, sizeof(b), "E,%s", name);
  sendLine(b);
}

void Link::sendEvent(const char* name, long value) {
  char b[24];
  snprintf(b, sizeof(b), "E,%s,%ld", name, value);
  sendLine(b);
}

void Link::sendEvent(const char* name, char value) {
  char b[24];
  snprintf(b, sizeof(b), "E,%s,%c", name, value);
  sendLine(b);
}

void Link::sendAck(const char* cmd, bool ok) {
  char b[24];
  snprintf(b, sizeof(b), "%c,%s", ok ? 'A' : 'X', cmd);
  sendLine(b);
}

void Link::sendModel(Activity act, uint8_t conf) {
  char b[24];
  snprintf(b, sizeof(b), "M,%c,%u", activityCode(act), conf);
  sendLine(b);
}
