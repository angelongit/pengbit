# Laptop tests for the pet logic, activity thresholds and UI (no Arduino needed).
SRC = test_pet.cpp ../pet/pet_state.cpp ../pet/activity.cpp ../pet/gfx.cpp ../pet/ui.cpp
test_pet: $(SRC) ../pet/*.h
	g++ -std=c++17 -Wall -Wextra -O1 -o $@ $(SRC)
test: test_pet
	./test_pet
preview: test_pet
	./test_pet screens.txt && python3 render_preview.py screens.txt screens.png
clean:
	rm -f test_pet screens.txt screens.png
.PHONY: test preview clean
