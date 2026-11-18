# Bluetooth message format (draft)

Not final: Angel and Daniel agree on this before the event.

Transport: Nordic UART Service (NUS). The board advertises as `Pengbit`. Same lines over USB serial at 115200 as the fallback.

| | UUID |
|---|---|
| Service | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX (page writes to board) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX (board notifies page) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |

Short comma-separated text lines ending in `\n`, under 20 bytes so each fits in one BLE packet.

## Board to page

| Line | Meaning |
|---|---|
| `S,<happy>,<energy>,<form>,<activity>,<age>` | Status, about once a second. happy/energy 0 to 100. form 0 = baby Pengbit, 1 to 3 = evolved forms. activity `W` walk, `K` shake, `I` still. age in minutes. |
| `E,EVO,<form>` | Just evolved into form 1, 2 or 3. Page asks the LLM for a dex entry. |
| `E,BTN,<A\|B\|C>` | A button was pressed. |

## Page to board

| Line | Meaning |
|---|---|
| `C,FEED` | Feed the pet |
| `C,PLAY` | Play with the pet |
| `C,DEMO,1` / `C,DEMO,0` | Demo mode (about 60x time) on / off |
| `C,RESET` | Start a new egg |
