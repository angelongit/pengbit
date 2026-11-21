# Pengbit color sprites for the phone/desk app: 32x32 RGBA, 2 frames, dark teal screen (#0d2a36).
# Original character; soft kawaii style (dark hood, one white face+belly, dot eyes, round beak, rosy cheeks).
import numpy as np, sys, os
from PIL import Image

N = 32
yy, xx = np.mgrid[0:N, 0:N]
def ell(cx, cy, rx, ry): return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0

# region ids
T, OUT, HOOD, FACE, EYE, BEAK, CHEEK, FEET, A1, A2, A3, SHINE = range(12)

def put(g, pts, v):
    for x, y in pts:
        if 0 <= x < N and 0 <= y < N: g[y, x] = v
def rect(g, x0, y0, x1, y1, v): g[max(0, y0):min(N, y1 + 1), max(0, x0):min(N, x1 + 1)] = v

def penguin(dy=0, flap=False, blink=False, w=10.5, h=12.0, tuft=True, squash=0):
    g = np.zeros((N, N), np.uint8)
    cy = 18 + dy + squash
    h = h - squash
    body = ell(16, cy, w + squash * 0.6, h)
    g[body] = OUT
    inner = ell(16, cy, w + squash * 0.6 - 1.1, h - 1.1)
    g[inner] = HOOD
    white = (ell(16, cy - 2, 6.6, 5.0) | ell(16, cy + 4.5, 6.4, 6.6)) & ell(16, cy, w - 3.0, h - 2.0)
    g[white] = FACE
    # flippers
    fy = cy + 1 - (2 if flap else 0)
    for x, y in [(5, fy), (4, fy + 1), (4, fy + 2), (5, fy + 3), (27, fy), (28, fy + 1), (28, fy + 2), (27, fy + 3)]:
        if g[y, x] == T: g[y, x] = OUT
    put(g, [(5, fy + 1), (5, fy + 2), (27, fy + 1), (27, fy + 2)], HOOD)
    ey = cy - 3
    if blink:
        put(g, [(11, ey + 1), (12, ey + 1), (13, ey + 1), (19, ey + 1), (20, ey + 1), (21, ey + 1)], EYE)
    else:
        rect(g, 12, ey, 13, ey + 1, EYE); rect(g, 19, ey, 20, ey + 1, EYE)
        put(g, [(12, ey), (19, ey)], SHINE)
    put(g, [(15, ey + 2), (16, ey + 2), (17, ey + 2), (16, ey + 3)], BEAK)
    put(g, [(10, ey + 3), (11, ey + 3), (21, ey + 3), (22, ey + 3)], CHEEK)
    fy2 = cy + int(h) + 1
    put(g, [(11, fy2), (12, fy2), (13, fy2), (19, fy2), (20, fy2), (21, fy2)], FEET)
    if tuft:
        top = cy - int(h)
        put(g, [(16, top - 1), (17, top - 2), (15, top - 2)], OUT)
    return g, cy

def baby(f): return penguin(dy=0 if f == 'a' else 1, flap=(f == 'b'))[0]

def sprinter(f):
    g, cy = penguin(flap=(f == 'b'), w=9.5, h=12.0, tuft=False)
    gy = cy - 9
    for x0 in (10, 18):                                   # goggles on the hood
        rect(g, x0, gy, x0 + 3, gy + 2, A1); rect(g, x0 + 1, gy + 1, x0 + 2, gy + 1, A2)
    rect(g, 14, gy + 1, 17, gy + 1, A1)
    top = cy - 12                                          # swept-back crest
    put(g, [(17, top), (18, top - 1), (19, top - 1), (20, top - 2)] if f == 'a' else [(17, top), (18, top), (19, top - 1), (21, top - 1)], OUT)
    off = 0 if f == 'a' else 1                             # speed lines
    for y in (12, 17, 22):
        put(g, [(x, y + off) for x in range(0, 3)], A1)
    return g

def frost(f):
    g, cy = penguin(blink=True, w=11.0, h=11.5, tuft=False)
    top = cy - 11
    for x, hgt in ((11, 2), (14, 3), (16, 4), (18, 3), (21, 2)):    # ice crown
        put(g, [(x, top - k) for k in range(hgt)], A1)
    for x, y in ((9, 10), (22, 10), (7, 16), (25, 16), (8, 22), (24, 22), (13, 8), (19, 8)):
        if g[y, x] == HOOD: g[y, x] = A1                              # frosted feathers
    def sparkle(x, y):
        put(g, [(x, y), (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], A2)
    if f == 'a': sparkle(3, 5); sparkle(28, 9); put(g, [(29, 27), (2, 24)], A2)
    else: sparkle(28, 4); sparkle(3, 12); put(g, [(30, 22), (4, 28)], A2)
    return g

def glitch(f):
    g, cy = penguin(tuft=False)
    out = g.copy()
    rng = np.random.default_rng(7 if f == 'a' else 11)
    for y0, y1, s in ([(9, 10, 2), (22, 23, -2)] if f == 'a' else [(12, 13, -2), (24, 25, 2)]):
        out[y0:y1 + 1] = np.roll(g[y0:y1 + 1], s, axis=1)
    for _ in range(5):
        x, y = rng.integers(0, 32), rng.integers(0, 32)
        out[y, x] = A1 if rng.random() < .5 else A2
    for _ in range(3):                                     # dead pixels in the belly
        x, y = rng.integers(10, 22), rng.integers(20, 28)
        if out[y, x] == FACE: out[y, x] = A2
    put(out, [(16, 4), (16, 3), (15, 2), (17, 2)] if f == 'a' else [(17, 4), (17, 3), (16, 2), (18, 2)], A1)
    return out

def egg(f):
    g = np.zeros((N, N), np.uint8)
    cx = 16 if f == 'a' else 17
    g[ell(cx, 18, 9.5, 12)] = OUT
    g[ell(cx, 18, 8.5, 11)] = FACE
    for x, y in ((cx - 4, 20), (cx + 3, 25), (cx + 4, 14)):
        rect(g, x, y, x + 1, y + 1, A1)
    put(g, [(cx - 3, 9), (cx - 2, 10), (cx - 1, 9), (cx, 10), (cx + 1, 9), (cx + 2, 10), (cx + 1, 11)], A2)
    if f == 'b': put(g, [(4, 26), (5, 27), (28, 26), (29, 27)], OUT)
    return g

def slouch(f):
    # Desk-mode reaction: Pengbit hunched forward and squashed, with posture-glitch tears.
    g, cy = penguin(blink=(f == 'b'), tuft=True, squash=2)
    out = g.copy()
    for y0, y1, s in ([(13, 14, 3), (23, 23, -2)] if f == 'a' else [(15, 16, -3), (21, 22, 2)]):
        out[y0:y1 + 1] = np.roll(g[y0:y1 + 1], s, axis=1)
    put(out, [(26, 6), (27, 5), (28, 6), (27, 7)] if f == 'a' else [(4, 7), (5, 6), (6, 7)], A1)   # sweat/strain mark
    return out

def professor():
    # Professor Liveoak: older penguin researcher with round glasses, white whiskery brows, lab-coat collar, bow tie.
    g, cy = penguin(w=11.0, h=12.5, tuft=False)
    ey = cy - 3
    for x0 in (10, 18):                                    # round glasses around the eyes
        put(g, [(x0, ey - 1), (x0 + 1, ey - 2), (x0 + 2, ey - 2), (x0 + 3, ey - 1), (x0 + 4, ey), (x0 + 4, ey + 1),
                (x0 + 3, ey + 2), (x0 + 2, ey + 3), (x0 + 1, ey + 3), (x0, ey + 2), (x0 - 1, ey + 1), (x0 - 1, ey)], A1)
    put(g, [(15, ey), (16, ey), (17, ey)], A1)
    put(g, [(9, ey - 4), (10, ey - 5), (11, ey - 5), (21, ey - 5), (22, ey - 5), (23, ey - 4)], A3)   # bushy brows
    put(g, [(14, 3), (15, 2), (16, 3), (17, 2), (18, 3)], A3)                                        # wisps of hair
    y = cy + 2                                             # bow tie just under the beak
    put(g, [(12, y - 1), (12, y), (12, y + 1), (13, y - 1), (13, y), (13, y + 1), (14, y), (15, y),
            (17, y), (18, y), (19, y - 1), (19, y), (19, y + 1), (20, y - 1), (20, y), (20, y + 1)], A2)
    put(g, [(16, y)], A3)
    return g

PALETTES = {
    'base':     {OUT: '#e8f4ff', HOOD: '#2b3a55', FACE: '#f6fafd', EYE: '#141b2b', BEAK: '#ffb347', CHEEK: '#ff9fb0',
                 FEET: '#ffb347', SHINE: '#ffffff'},
}
FORM_COLORS = {
    'egg':      {OUT: '#bcd3e6', FACE: '#eef4f9', A1: '#7fb3d9', A2: '#3c5468'},
    'baby':     {},
    'sprinter': {HOOD: '#24365e', A1: '#ffd84a', A2: '#7fd6ff'},
    'frost':    {HOOD: '#2f5a73', A1: '#9ff3ff', A2: '#d8f6ff'},
    'glitch':   {HOOD: '#3a2556', A1: '#ff6bf1', A2: '#4ff0ff'},
    'slouch':   {HOOD: '#2b3a55', A1: '#9ff3ff'},
    'professor':{HOOD: '#33415e', A1: '#ffd84a', A2: '#e5484d', A3: '#f0f4f8', SHINE: '#dfe9f2'},
}

def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)

def render(g, form):
    pal = {**PALETTES['base'], **FORM_COLORS[form]}
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); px = im.load()
    for y in range(N):
        for x in range(N):
            v = int(g[y, x])
            if v and v in pal: px[x, y] = hexrgb(pal[v])
    return im

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True)
    fns = {'egg': egg, 'baby': baby, 'sprinter': sprinter, 'frost': frost, 'glitch': glitch, 'slouch': slouch}
    tiles = []
    for name, fn in fns.items():
        for f in 'ab':
            im = render(fn(f), name); im.save(f'{out}/{name}_{f}.png'); tiles.append(im)
    prof = render(professor(), 'professor'); prof.save(f'{out}/professor.png'); tiles.append(prof)
    S, pad = 6, 10
    cols = 6
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (N * S + pad) + pad, rows * (N * S + pad) + pad), (13, 42, 54))
    for i, t in enumerate(tiles):
        big = t.resize((N * S, N * S), Image.NEAREST)
        sheet.paste(big, (pad + (i % cols) * (N * S + pad), pad + (i // cols) * (N * S + pad)), big)
    sheet.save(f'{out}/../color_preview.png'); print('ok')
