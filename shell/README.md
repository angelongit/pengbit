# Pengbit egg shell

A round, egg-shaped handheld case for Pengbit, 68 x 76 x 18.5 mm, in two halves that press together.
Sized for the EEMB 1100 mAh LiPo (LP603449, 51 x 34.5 x 6.3 mm).

- **Front:** screen window inside an engraved penguin face patch with a little beak, and three buttons (A, B, C) in a smile near the bottom.
- **Top edge:** USB-C for charging and flashing.
- **Back:** engraved "Pengbit", the power switch lever (marked PWR), and speaker holes for the buzzer.

## Files

- `pet_shell.scad`: the parametric OpenSCAD model. All sizes are at the top of the file.
- `stl/pet_shell_front.stl`, `stl/pet_shell_back.stl`, `stl/pet_shell_caps.stl` (3 button caps): ready to print, already oriented.
- `preview/`: renders of the front, back, an exploded view, and the inside of each half.

## Inside layout

The battery lies sideways on the back floor in the wide lower part of the egg.
Above it, in the narrower top, the XIAO sits in a cradle in the middle with USB-C pointing out the top.
The buzzer sits face down in a ring to its left, so it beeps out the back, and the slide switch sits in a pocket to its right, with the lever through the back.
The screen and buttons hang from the front half, over the XIAO and the battery.

## Measure before you print (5 minutes with calipers)

Module sizes vary between sellers, so check these and change the matching value in the .scad if yours is off by more than about 0.5 mm.

| What | Default | Parameter |
|---|---|---|
| Battery width x height x thickness | 51 x 34.5 x 6.3 | `bat` |
| OLED circuit board width x height | 27.3 x 27.8 | `oled` |
| OLED: where the lit area sits, compared with the middle of the board | 1 mm toward the pins | `oled_win_off` |
| Tact switch body height without the stem, and stem height | 3.5 and 1.5 | `tact_body_h`, `tact_stem_h` |
| Buzzer diameter and height | 12 and 9.5 | `bz_d`, `bz_h` |
| Slide switch body (SS12D00) | 4.4 x 8.6 x 4.5 | `sw_body` |
| USB-C cable plug (the plastic part) | up to 12.5 x 7.5 | `usb_w`, `usb_h` |

If anything changes, re-export with OpenSCAD (free): open the file, set `part` to `front`, `back` or `caps` in the Customizer, press F6, then File > Export > STL.
The egg itself is set by `A` (half width), `Bb` and `Bt` (bottom and top heights) and `n` (2 is a true ellipse; higher is squarer). If you make it smaller, run `part = "check"`: anything that renders is a part hitting the shell.

## Printing

- Material: PLA (PETG works too). Penguin colors work well: a dark front and a white or icy back.
- Layer height 0.2 mm, 3 walls, 15 to 20% infill. No supports needed. The rounded edges stay under 40 degrees of overhang.
- Orientation is already set: front half face down, back half back down, caps flange down.
- Sliced at 0.2 mm on a generic profile: about 1 h 20 m per half and 10 m for the caps (about 2 h 55 m total, around 30 g of filament). A fast printer will take about half that.
- Print the back half first and test-fit the battery, XIAO, buzzer and switch before you print the front.

## Assembly

1. **OLED.** If the header pins stick straight out the back, trim them to about 2.5 mm below the black plastic spacer, or bend them flat, before soldering wires. Full-length pins hit the battery. Drop the module face down into the frame inside the front half, glass against the window, pins toward the top, and tack the corners with hot glue.
2. **Buttons.** Put a cap into each hole from the inside, then press a tact switch into the square pocket behind it, with the legs out the side slots. Solder wires, then cover the back of each switch with hot glue.
3. **Buzzer.** Press it face down into the ring on the back floor, so its top faces the speaker holes. Bend the legs over sideways and glue it.
4. **Switch.** Drop it into its pocket with the lever through the slot in the back, and glue it.
5. **XIAO.** Solder the battery and switch wires to the BAT pads first. Then slide the board into the cradle, USB-C toward the top hole, so it rests on the ledges and the bottom edge sits against the stop. Add a dot of glue so it stays put when you plug in a cable.
6. **Battery.** Stick it between the four corner brackets with double-sided foam tape. The JST-PH lead can leave through any gap between the brackets.
7. **Close.** Route the wires so nothing sits on the lip, line up the halves and press them together. It's a friction fit. If it's loose, add a strip of tape around the seam or a few dots of hot glue. Open it with a fingernail in the small notch on the left side.

## Tuning the fit

- Halves too tight: raise `tol` to 0.25. Too loose: lower it to 0.1.
- Buttons rattle or don't click: change `cap_proud` or the tact switch heights.
- Need more room for wires: raise `D` (thickness) by 2 to 3 mm.

The model was checked for collisions between the shell and stand-in blocks for every part. The two halves only touch at the seam.
