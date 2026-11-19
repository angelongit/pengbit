#include <Arduino.h>
#include <bluefruit.h>
#include <stdio.h>
#include <string.h>
#include "link.h"

static BLEUart bleuart;

void Link::begin() {
  // TODO: copy setup from tests/ble_test (Bluefruit.begin, setName, bleuart.begin, advertising).
}

void Link::update() {
  // TODO: while bleuart.available() / Serial.available(): append to the line buffer;
  //       on '\n' parse() it into pending_ and reset the buffer; drop overlong lines.
}

Command Link::pollCommand() {
  Command c = pending_;
  pending_ = Command::NONE;
  return c;
}

void Link::sendStatus(uint8_t happy, uint8_t energy, uint8_t form, Activity act, uint32_t ageMin) {
  char line[24];
  snprintf(line, sizeof line, "S,%u,%u,%u,%c,%lu\n", happy, energy, form, activityCode(act),
           (unsigned long)ageMin);
  sendLine(line);
}

void Link::sendEvolved(uint8_t form) {
  char line[12];
  snprintf(line, sizeof line, "E,EVO,%u\n", form);
  sendLine(line);
}

void Link::sendButton(char name) {
  char line[10];
  snprintf(line, sizeof line, "E,BTN,%c\n", name);
  sendLine(line);
}

bool Link::connected() const { return Bluefruit.connected(); }

void Link::sendLine(const char* line) {
  Serial.print(line);
  if (Bluefruit.connected()) bleuart.print(line);
}

Command Link::parse(const char* line) {
  // TODO: strcmp against "C,FEED", "C,PLAY", "C,DEMO,1", "C,DEMO,0", "C,RESET" (strip '\r')
  (void)line;
  return Command::NONE;
}
