# Removes the dark background from the OutOfBook logos (every pixel of the
# background colour, soft edges by colour-to-alpha), makes light-theme variants (white
# letters to the dark ink) and the favicon set.
#   python3 scripts/build-brand.py assets/brand/source <out dir>
# then copy outofbook-*.png to assets/brand/, web-*.png to apps/web/public/brand/
# and the favicon and icon files to apps/web/public/. Needs Pillow.
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
square(icon, 32, 0).save(f"{out}/favicon-32.png", optimize=True)
square(icon, 180, 0.06).save(f"{out}/apple-touch-icon.png", optimize=True)
square(icon, 192).save(f"{out}/icon-192.png", optimize=True)
square(icon, 512).save(f"{out}/icon-512.png", optimize=True)
square(icon, 256, 0).save(f"{out}/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("done", icon.size, hor.size, named.size)
