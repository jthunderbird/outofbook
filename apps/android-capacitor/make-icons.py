# Launcher icons and splash screens for the Capacitor Android project, from
# assets/brand/outofbook-logo.png (transparent): the logo on the app's dark
# background. Run from this folder: python3 make-icons.py (needs Pillow).
from pathlib import Path
from PIL import Image, ImageDraw

BG = (13, 17, 23, 255)  # #0D1117
logo = Image.open("../../assets/brand/outofbook-logo.png").convert("RGBA")
res = Path("android/app/src/main/res")

def placed(size, frac, shape=None):
    """The logo, `frac` of the canvas wide, centred on the dark background (optionally a circle or rounded square)."""
    c = Image.new("RGBA", (size, size), (0, 0, 0, 0) if shape else BG)
    if shape:
        m = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(m)
        if shape == "round":
            d.ellipse((0, 0, size - 1, size - 1), fill=255)
        else:
            r = size // 6  # rounded square, drawn by hand (old Pillow has no rounded_rectangle)
            d.rectangle((r, 0, size - 1 - r, size - 1), fill=255)
            d.rectangle((0, r, size - 1, size - 1 - r), fill=255)
            for x, y in ((0, 0), (size - 1 - 2 * r, 0), (0, size - 1 - 2 * r), (size - 1 - 2 * r, size - 1 - 2 * r)):
                d.ellipse((x, y, x + 2 * r, y + 2 * r), fill=255)
        c.paste(Image.new("RGBA", (size, size), BG), (0, 0), m)
    w, h = logo.size
    s = size * frac / max(w, h)
    im = logo.resize((round(w * s), round(h * s)), Image.LANCZOS)
    c.paste(im, ((size - im.size[0]) // 2, (size - im.size[1]) // 2), im)
    return c

for dpi, n in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    d = res / f"mipmap-{dpi}"
    placed(n, 0.72, "square").save(d / "ic_launcher.png")
    placed(n, 0.66, "round").save(d / "ic_launcher_round.png")
    # Adaptive icon foreground: 108dp with a 66dp safe zone; transparent around the logo.
    f = n * 108 // 48
    fg = Image.new("RGBA", (f, f), (0, 0, 0, 0))
    w, h = logo.size
    s = f * 0.56 / max(w, h)
    im = logo.resize((round(w * s), round(h * s)), Image.LANCZOS)
    fg.paste(im, ((f - im.size[0]) // 2, (f - im.size[1]) // 2), im)
    fg.save(d / "ic_launcher_foreground.png")

(res / "values/ic_launcher_background.xml").write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0D1117</color>\n</resources>\n')

for p in res.glob("drawable*/splash.png"):
    w, h = Image.open(p).size
    c = Image.new("RGBA", (w, h), BG)
    lw = int(min(w, h) * 0.45)
    s = lw / max(logo.size)
    im = logo.resize((round(logo.size[0] * s), round(logo.size[1] * s)), Image.LANCZOS)
    c.paste(im, ((w - im.size[0]) // 2, (h - im.size[1]) // 2), im)
    c.convert("RGB").save(p)
print("icons and splash screens written")
