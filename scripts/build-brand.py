# Removes the dark background from the OutOfBook logos (every pixel of the
# background colour, soft edges by colour-to-alpha), makes light-theme variants (white
# letters to the dark ink) and the favicon set.
#   python3 scripts/build-brand.py assets/brand/source <out dir>
# then copy outofbook-*.png and play-*.png to assets/brand/, web-*.png to
# apps/web/public/brand/, and the favicon and icon files to apps/web/public/.
# apps/android-capacitor/make-icons.py makes the Android launcher icons. Needs Pillow.
import sys
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
INK = (13, 17, 23)  # #0D1117, the logo palette's dark

def cut(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    # background colour: median of the border
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    dist = lambda c: max(abs(c[i] - bg[i]) for i in range(3))
    T = 38
    # Every background-coloured pixel goes, not only those connected to the
    # border: letter counters (the holes in O and o) and the dark outlines too.
    seen = bytearray(1 if dist(c) <= T else 0 for c in im.getdata())
    mask = Image.frombytes("L", (w, h), bytes(255 if s else 0 for s in seen))
    near = mask.filter(ImageFilter.MaxFilter(7))  # a band around the background
    nb = near.load(); mk = mask.load()
    rgba = Image.new("RGBA", (w, h))
    o = rgba.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if mk[x, y]:
                o[x, y] = (0, 0, 0, 0)
            elif nb[x, y]:
                # colour to alpha against the background, for anti-aliased edges
                a = max((c[i] - bg[i]) / ((255 - bg[i]) if c[i] > bg[i] else max(1, bg[i])) for i in range(3))
                a = max(0.0, min(1.0, a * 1.15))
                if a < 0.04:
                    o[x, y] = (0, 0, 0, 0)
                else:
                    o[x, y] = tuple(int(max(0, min(255, (c[i] - bg[i] * (1 - a)) / a))) for i in range(3)) + (int(a * 255),)
            else:
                o[x, y] = c + (255,)
    return rgba.crop(rgba.getbbox())

def light(im):
    # White letters become the dark ink, for the light theme; colours stay.
    im = im.copy(); p = im.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = p[x, y]
            if a and min(r, g, b) > 150 and max(r, g, b) - min(r, g, b) < 40:
                k = (min(r, g, b) - 150) / 105
                p[x, y] = tuple(int(INK[i] * k + (r, g, b)[i] * (1 - k)) for i in range(3)) + (a,)
    return im

def fit(im, h):
    return im.resize((round(im.size[0] * h / im.size[1]), h), Image.LANCZOS)

def square(im, n, pad=0.04):
    s = max(im.size)
    canvas = Image.new("RGBA", (s, s))
    canvas.paste(im, ((s - im.size[0]) // 2, (s - im.size[1]) // 2))
    inner = round(n * (1 - 2 * pad))
    c = Image.new("RGBA", (n, n))
    c.paste(canvas.resize((inner, inner), Image.LANCZOS), ((n - inner) // 2, (n - inner) // 2))
    return c

def gradient(w, h):
    """The app-icon background: deep blue at the top left to deep purple at the bottom right
    (the logo's own blue and purple, darkened), with a soft glow behind the centre."""
    a, b = (14, 20, 44), (44, 22, 74)
    cx, cy, rad = w / 2, h / 2, (w * w + h * h) ** 0.5 / 2
    px = []
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2
            g = max(0.0, 1 - (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / rad) ** 2 * 0.22
            px.append(tuple(int(min(255, a[i] * (1 - t) + b[i] * t + 255 * g * (0.35, 0.4, 0.6)[i])) for i in range(3)) + (255,))
    im = Image.new("RGBA", (w, h))
    im.putdata(px)
    return im

def tile(im, n, frac, w=None):
    """`im` centred on the gradient, `frac` of the shorter side wide/tall."""
    w = w or n
    bg = gradient(w, n)
    s = frac * min(w, n) / max(im.size) if w == n else frac * n / im.size[1]
    lo = im.resize((round(im.size[0] * s), round(im.size[1] * s)), Image.LANCZOS)
    at = ((w - lo.size[0]) // 2, (n - lo.size[1]) // 2)
    # The logo's dark outline, as in the original artwork: its shape grown by a few pixels, in the ink colour.
    k = max(3, round(min(w, n) / 90)) | 1
    edge = lo.split()[3].filter(ImageFilter.MaxFilter(k))
    bg.paste(Image.new("RGBA", lo.size, INK + (255,)), at, edge)
    bg.paste(lo, at, lo)
    return bg

icon = cut(f"{src}/outofbook-logo.jpg")
hor = cut(f"{src}/outofbook-horizontal.jpg")
named = cut(f"{src}/outofbook-with-name.jpg")
icon.save(f"{out}/outofbook-logo.png", optimize=True)
hor.save(f"{out}/outofbook-horizontal.png", optimize=True)
named.save(f"{out}/outofbook-with-name.png", optimize=True)
light(hor).save(f"{out}/outofbook-horizontal-light.png", optimize=True)
light(named).save(f"{out}/outofbook-with-name-light.png", optimize=True)
# Web sizes: header logo at 2x of 54 px tall, welcome logo at 2x of 240 px.
fit(hor, 108).save(f"{out}/web-horizontal.png", optimize=True)
fit(light(hor), 108).save(f"{out}/web-horizontal-light.png", optimize=True)
fit(named, 480).save(f"{out}/web-with-name.png", optimize=True)
fit(light(named), 480).save(f"{out}/web-with-name-light.png", optimize=True)
fit(icon, 64).save(f"{out}/web-icon.png", optimize=True)
# Browser tab: the bare logo. App icons: the logo on the gradient.
square(icon, 32, 0).save(f"{out}/favicon-32.png", optimize=True)
square(icon, 256, 0).save(f"{out}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
store = tile(icon, 512, 0.74)
store.convert("RGB").save(f"{out}/play-store-icon-512.png", optimize=True)  # Play listing icon (Google rounds the corners)
store.save(f"{out}/icon-512.png", optimize=True)
store.resize((192, 192), Image.LANCZOS).save(f"{out}/icon-192.png", optimize=True)
store.resize((180, 180), Image.LANCZOS).convert("RGB").save(f"{out}/apple-touch-icon.png", optimize=True)
tile(icon, 512, 0.58).save(f"{out}/icon-maskable-512.png", optimize=True)  # inside the 80% safe zone
gradient(432, 432).save(f"{out}/android-icon-background.png", optimize=True)  # adaptive-icon background
tile(hor, 500, 0.46, 1024).convert("RGB").save(f"{out}/play-feature-graphic-1024x500.png", optimize=True)
print("done", icon.size, hor.size, named.size)
