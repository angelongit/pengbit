#!/usr/bin/env python3
"""Turn the text dump from test_pet into a PNG that looks like the OLED (yellow band on top)."""
import sys
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
blocks, cur = [], None
for line in open(src).read().splitlines():
    if line and set(line) <= set("#.") and len(line) == 128:
        cur[1].append(line)
    else:
        cur = (line, []); blocks.append(cur)
S, PAD = 3, 10
cols = 3
rows = (len(blocks) + cols - 1) // cols
img = Image.new("RGB", (cols * (128 * S + PAD) + PAD, rows * (64 * S + PAD + 14) + PAD), (30, 30, 30))
d = ImageDraw.Draw(img)
for i, (name, px) in enumerate(blocks):
    ox = PAD + (i % cols) * (128 * S + PAD)
    oy = PAD + (i // cols) * (64 * S + PAD + 14)
    d.text((ox, oy), name, fill=(200, 200, 200))
    oy += 14
    d.rectangle([ox, oy, ox + 128 * S - 1, oy + 64 * S - 1], fill=(0, 0, 0))
    for y, row in enumerate(px):
        c = (255, 210, 0) if y < 16 else (90, 180, 255)
        for x, ch in enumerate(row):
            if ch == "#":
                d.rectangle([ox + x * S, oy + y * S, ox + x * S + S - 2, oy + y * S + S - 2], fill=c)
img.save(out)
print("wrote", out)
