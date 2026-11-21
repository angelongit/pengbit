#!/usr/bin/env python3
"""Build firmware/pet/sprites.h.

Usage:
  python3 sprites_to_h.py                 # use Daniel's PNGs where they exist, placeholders otherwise
  python3 sprites_to_h.py --placeholders  # placeholders only
  python3 sprites_to_h.py --preview out.png   # also write a 4x preview sheet

PNGs: web/assets/sprites/form{0,1,2,3,9}_{a,b}.png (9 = egg), 32x32.
Any non-black, non-transparent pixel = lit. Output format matches image2cpp
(horizontal rows, 1 bit per pixel, MSB = leftmost), so hand-pasted image2cpp
arrays also work.
Needs Pillow (pip install pillow).
"""
import argparse, math, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
PNG_DIR = os.path.join(REPO, "web", "assets", "sprites")
OUT = os.path.join(REPO, "firmware", "pet", "sprites.h")
W = H = 32
FORMS = [(9, "EGG"), (0, "BABY"), (1, "SPRINTER"), (2, "FROST"), (3, "GLITCH")]


# ------------------------------------------------------------ placeholders
def penguin(d, dy, form, frame):
    """Draw a round penguin. Lit = white. Back is lit, belly dark with lit rim."""
    cx = 16
    top = 4 + dy
    # body silhouette
    d.ellipse([cx - 11, top + 6, cx + 11, top + 27], fill=1)        # body
    d.ellipse([cx - 8, top, cx + 8, top + 15], fill=1)               # head
    # belly + face (dark)
    d.ellipse([cx - 7, top + 11, cx + 7, top + 26], fill=0)
    d.ellipse([cx - 6, top + 4, cx + 6, top + 13], fill=0)
    # eyes (lit pupils on dark face)
    if form == 2 and frame == 1:          # frost blinks / meditates
        d.line([cx - 4, top + 8, cx - 2, top + 8], fill=1)
        d.line([cx + 2, top + 8, cx + 4, top + 8], fill=1)
    else:
        d.rectangle([cx - 4, top + 7, cx - 3, top + 8], fill=1)
        d.rectangle([cx + 3, top + 7, cx + 4, top + 8], fill=1)
    # beak
    d.polygon([(cx - 2, top + 10), (cx + 2, top + 10), (cx, top + 12)], fill=1)
    # flippers
    flap = -2 if frame else 0
    d.polygon([(cx - 11, top + 12), (cx - 15, top + 20 + flap), (cx - 11, top + 21)], fill=1)
    d.polygon([(cx + 11, top + 12), (cx + 15, top + 20 + flap), (cx + 11, top + 21)], fill=1)
    # feet
    fy = min(top + 27, 31)
    if frame:
        d.line([cx - 6, fy, cx - 2, fy], fill=1); d.line([cx + 3, fy - 1, cx + 6, fy - 1], fill=1)
    else:
        d.line([cx - 6, fy - 1, cx - 3, fy - 1], fill=1); d.line([cx + 2, fy, cx + 6, fy], fill=1)

    if form == 1:   # Sprinter: headband + speed lines
        d.line([cx - 7, top + 3, cx + 7, top + 3], fill=0)
        d.line([cx + 8, top + 3, cx + 12, top + 1 + frame], fill=1)
        d.line([cx + 8, top + 4, cx + 13, top + 4 + frame], fill=1)
        for i, y in enumerate((10, 16, 22)):
            x0 = 0 + ((i + frame) % 2)
            d.line([x0, top + y, x0 + 2, top + y], fill=1)
    elif form == 2:  # Frost: ice crown + snowflakes
        for x in (cx - 5, cx, cx + 5):
            d.line([x, top - 3, x, top], fill=1)
        for (sx, sy) in ((2, 4), (28, 9)) if frame == 0 else ((3, 9), (27, 3)):
            d.point([(sx, sy), (sx - 1, sy), (sx + 1, sy), (sx, sy - 1), (sx, sy + 1)], fill=1)
    elif form == 3:  # Glitch: antenna + broken pixels
        d.line([cx, top - 3, cx, top], fill=1)
        d.point([(cx + 1, top - 4), (cx - 1, top - 4)], fill=1)
        pts = [(3, 6), (28, 12), (1, 22), (29, 26)] if frame == 0 else [(4, 14), (27, 5), (2, 27), (30, 20)]
        for (px, py) in pts:
            d.rectangle([px, py, px + 1, py + 1], fill=1)


def egg(d, frame):
    wob = 1 if frame else 0
    d.ellipse([6 + wob, 2, 25 + wob, 30], outline=1)
    d.ellipse([7 + wob, 3, 24 + wob, 29], outline=1)
    # zigzag crack + spots
    d.line([(9 + wob, 16), (12 + wob, 13), (15 + wob, 17), (18 + wob, 13), (21 + wob, 17), (23 + wob, 15)], fill=1)
    d.ellipse([11 + wob, 6, 14 + wob, 9], fill=1)
    d.ellipse([18 + wob, 21, 21 + wob, 24], fill=1)


def placeholder(code, frame):
    img = Image.new("1", (W, H), 0)
    d = ImageDraw.Draw(img)
    if code == 9:
        egg(d, frame)
    else:
        penguin(d, frame, code, frame)
    return img


# ------------------------------------------------------------ io
def load_png(code, frame):
    p = os.path.join(PNG_DIR, f"form{code}_{'ab'[frame]}.png")
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert("RGBA")
    if im.size != (W, H):
        im = im.resize((W, H), Image.NEAREST)
    out = Image.new("1", (W, H), 0)
    for y in range(H):
        for x in range(W):
            r, g, b, a = im.getpixel((x, y))
            if a > 127 and (r + g + b) > 3 * 64:
                out.putpixel((x, y), 1)
    return out


def to_bytes(img):
    data = []
    for y in range(H):
        for xb in range(W // 8):
            v = 0
            for bit in range(8):
                if img.getpixel((xb * 8 + bit, y)):
                    v |= 0x80 >> bit
            data.append(v)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--placeholders", action="store_true")
    ap.add_argument("--preview")
    a = ap.parse_args()

    imgs, srcs = {}, {}
    for code, _ in FORMS:
        for f in (0, 1):
            im = None if a.placeholders else load_png(code, f)
            srcs[(code, f)] = "png" if im else "placeholder"
            imgs[(code, f)] = im or placeholder(code, f)

    lines = [
        "// Pengbit sprites: 32x32, 1 bit per pixel, rows MSB-first (image2cpp format).",
        "// GENERATED by firmware/tools/sprites_to_h.py. Re-run it after Daniel's PNGs land",
        "// in web/assets/sprites/ (form0_a.png ... form3_b.png, form9 = egg).",
        "#pragma once",
        "#include <stdint.h>",
        "",
        "constexpr int SPRITE_W = 32, SPRITE_H = 32;",
        "",
    ]
    for code, name in FORMS:
        for f in (0, 1):
            b = to_bytes(imgs[(code, f)])
            lines.append(f"// form {code} {name} frame {'ab'[f]} ({srcs[(code, f)]})")
            lines.append(f"static const uint8_t SPR_{name}_{'AB'[f]}[128] = {{")
            for i in range(0, 128, 16):
                lines.append("  " + ", ".join(f"0x{v:02X}" for v in b[i:i + 16]) + ",")
            lines.append("};")
    lines += ["",
              "// [form index][frame]. Index: 0 baby, 1 sprinter, 2 frost, 3 glitch, 4 egg.",
              "static const uint8_t* const SPRITES[5][2] = {",
              "  {SPR_BABY_A, SPR_BABY_B}, {SPR_SPRINTER_A, SPR_SPRINTER_B},",
              "  {SPR_FROST_A, SPR_FROST_B}, {SPR_GLITCH_A, SPR_GLITCH_B},",
              "  {SPR_EGG_A, SPR_EGG_B},",
              "};", ""]
    open(OUT, "w").write("\n".join(lines))
    print("wrote", OUT, {k: v for k, v in srcs.items()})

    if a.preview:
        sheet = Image.new("L", (len(FORMS) * 2 * (W + 4) * 4, (H + 4) * 4), 40)
        for i, (code, _) in enumerate(FORMS):
            for f in (0, 1):
                im = imgs[(code, f)].convert("L").resize((W * 4, H * 4), Image.NEAREST)
                sheet.paste(im, (((i * 2 + f) * (W + 4) + 2) * 4, 8))
        sheet.save(a.preview)
        print("preview", a.preview)


if __name__ == "__main__":
    main()
