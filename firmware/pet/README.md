# pet

The main Pengbit sketch. Open `pet.ino` in the Arduino IDE; every `.h`/`.cpp` here shows up as a tab.

The files are skeletons: interfaces are filled in, bodies are `TODO`s to write. Read [../ARCHITECTURE.md](../ARCHITECTURE.md) first: it has the module layout, the SSD1306 and LSM6DS3 register sequences, the activity and evolution rules, and the build order with fallbacks.

Fallback switches are at the top of `config.h` (`USE_LIB_OLED`, `USE_LIB_IMU`).

`activity.*` and `pet_state.*` have no Arduino includes, so they can be tested on a laptop:

```
g++ -std=c++17 -I. my_pet_test.cpp pet_state.cpp activity.cpp -o pet_test && ./pet_test
```
