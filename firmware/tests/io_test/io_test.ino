// Buttons + buzzer check: each button press prints its name and chirps.
const int PIN_BUZZER = D0;  // NPN base through 1k
const int PIN_BTN_A  = D1;  // buttons to GND, internal pull-up
const int PIN_BTN_B  = D2;
const int PIN_BTN_C  = D3;

const int buttons[] = {PIN_BTN_A, PIN_BTN_B, PIN_BTN_C};
const char* names[] = {"A", "B", "C"};
bool lastDown[3] = {false, false, false};

void chirp(int ms) {
  digitalWrite(PIN_BUZZER, HIGH);
  delay(ms);
  digitalWrite(PIN_BUZZER, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
  for (int i = 0; i < 3; i++) pinMode(buttons[i], INPUT_PULLUP);
  chirp(60);
}

void loop() {
  for (int i = 0; i < 3; i++) {
    bool down = digitalRead(buttons[i]) == LOW;
    if (down && !lastDown[i]) {
      Serial.print("Button ");
      Serial.println(names[i]);
      chirp(40);
    }
    lastDown[i] = down;
  }
  delay(10);  // crude debounce
}
