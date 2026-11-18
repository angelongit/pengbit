# Pengbit shell

A two-part snap-together handheld case sized for the EEMB 1100 mAh LiPo (LP603449), 46 x 90 x 18.5 mm, with a keychain loop on top.
Front face: screen window, three buttons in a small smile (A, B, C), speaker holes, a sparkle.
Back face: engraved "tidalByte". USB-C on the bottom edge, power switch on the right side.

Files
- `pet_shell.scad`: the parametric OpenSCAD model. All sizes are at the top of the file.
- `stl/pet_shell_front.stl`, `stl/pet_shell_back.stl`, `stl/pet_shell_caps.stl` (3 button caps): ready to print, already oriented.
- `preview/`: renders of the assembled case, an exploded view, and the inside of each half.

## Measure before you print (5 minutes with calipers)

Module sizes vary between sellers, so check these and change the matching value in the .scad if yours is off by more than about 0.5 mm.

| What | Default | Parameter |
|---|---|---|
| Battery width x length x thickness (EEMB LP603449) | 34.5 x 51 x 6.3 | `bat` |
| OLED circuit board width x height | 27.3 x 27.8 | `oled` |
| OLED: distance from the board's top edge (pin side) to the middle of the lit area, compared with half the board height | lit area 1 mm toward the pins | `oled_win_off` |
| Tact switch body height without the stem, and stem height | 3.5 and 1.5 | `tact_body_h`, `tact_stem_h` |
| Buzzer diameter and height | 12 and 9.5 | `bz_d`, `bz_h` |
| Slide switch body length x depth x height | 8.6 x 4.5 x 4.4 | `sw_body` |
| USB-C cable plug overmold (the plastic part) | up to 12.5 x 7.5 | `usb_w`, `usb_h` |

If anything changes, re-export with OpenSCAD (free): open the file, set `part` to `front`, `back` or `caps` in the Customizer, press F6, then File > Export > STL.

## Printing

- Material: PLA (PETG works too). Translucent or "ice" filament gives a nice Y2K iMac look; the XIAO LEDs may glow faintly through it.
- Layer height 0.2 mm, 3 walls, 15 to 20% infill. No supports needed.
- Orientation is already set: front half face down, back half back down, caps flange down.
- Sliced at 0.2 mm on a generic profile: about 1 h 25 m per half and 10 m for the caps (about 3 h total, around 30 g of filament). A fast printer like a Bambu will do it in roughly half that.
- Print the back half first and test-fit the battery and XIAO before printing the front.

## Assembly

1. **OLED.** If your module came with header pins pointing out the back, trim them to about 2.5 mm below the black plastic spacer (or bend them flat) before soldering wires. Straight pins hit the battery. Drop the module face down into the frame inside the front half, glass against the window, pins toward the top, and tack the corners with hot glue.
2. **Buttons.** Put a cap into each hole from the inside, then press a tact switch into the square pocket behind it with the legs sticking out of the side slots. Solder wires, then cover the back of each switch with hot glue so it can't push out.
3. **Buzzer.** Press it into the round socket behind the speaker holes, top facing the holes. Glue it.
4. **XIAO.** Solder the battery and switch wires to the BAT pads first, then slide the board into the cradle at the bottom of the back half with USB-C poking out of the bottom hole. A dot of glue at the far end keeps it in when you plug in a cable.
5. **Switch.** Sit it on the little pedestal on the right side, lever through the slot, glue it.
6. **Battery.** Stick it between the four corner brackets with double-sided foam tape. Run the JST-PH lead out the bottom gap between brackets.
7. **Close.** Route the wires so nothing sits on the snap lip, line up the halves, and press until the four bumps click. Open it later by putting a fingernail in the small notch on the left side.

## Tuning the fit

- Halves too tight or won't click: raise `tol` to 0.3, or set `snap = false` and use a strip of tape.
- Halves too loose: lower `tol` to 0.15.
- Buttons rattle or don't click: change `cap_proud` or the tact switch heights.
- Need more room for wires: raise `D` (thickness) by 2 to 3 mm; everything else follows.
- Don't want the keychain loop or the back text: `lanyard = false`, `back_text = ""`.

The model was checked for collisions between the shell and stand-in blocks for every part, and the two halves only touch at the seam.
