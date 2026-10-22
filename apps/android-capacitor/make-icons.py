# Launcher icons and splash screens for the Capacitor Android project, from
# assets/brand/ (run scripts/build-brand.py first): the logo, with its dark
# outline, on the app-icon gradient. Run from this folder: python3 make-icons.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

INK = (13, 17, 23, 255)  # #0D1117
brand = Path("../../assets/brand")
logo = Image.open(brand / "outofbook-logo.png").convert("RGBA")
store = Image.open(brand / "play-store-icon-512.png").convert("RGBA")  # logo on the gradient, full bleed
background = Image.open(brand / "android-icon-background.png").convert("RGBA")
res = Path("android/app/src/main/res")


def outlined(size, frac):
    """The logo `frac` of `size` wide with its dark outline, on a transparent square."""
    c = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    s = size * frac / max(logo.size)
    lo = logo.resize((round(logo.size[0] * s), round(logo.size[1] * s)), Image.LANCZOS)
    at = ((size - lo.size[0]) // 2, (size - lo.size[1]) // 2)
    edge = lo.split()[3].filter(ImageFilter.MaxFilter(max(3, round(size / 90)) | 1))
    c.paste(Image.new("RGBA", lo.size, INK), at, edge)
    c.paste(lo, at, lo)
    return c


def masked(im, n, shape):
    """`im` scaled to n×n, cut to a circle or a rounded square."""
    im = im.resize((n, n), Image.LANCZOS)
    m = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(m)
    if shape == "round":
        d.ellipse((0, 0, n - 1, n - 1), fill=255)
    else:
        r = n // 6  # rounded square, drawn by hand (old Pillow has no rounded_rectangle)
        d.rectangle((r, 0, n - 1 - r, n - 1), fill=255)
        d.rectangle((0, r, n - 1, n - 1 - r), fill=255)
        for x, y in ((0, 0), (n - 1 - 2 * r, 0), (0, n - 1 - 2 * r), (n - 1 - 2 * r, n - 1 - 2 * r)):
            d.ellipse((x, y, x + 2 * r, y + 2 * r), fill=255)
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out


for dpi, n in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    d = res / f"mipmap-{dpi}"
    masked(store, n, "square").save(d / "ic_launcher.png")
    masked(store, n, "round").save(d / "ic_launcher_round.png")
    # Adaptive icon: 108dp layers; the logo stays inside the 66dp safe zone.
    f = n * 108 // 48
    outlined(f, 0.58).save(d / "ic_launcher_foreground.png")
    background.resize((f, f), Image.LANCZOS).save(d / "ic_launcher_background.png")

for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (res / "mipmap-anydpi-v26" / name).write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n'
    )

for p in res.glob("drawable*/splash.png"):
    w, h = Image.open(p).size
    c = Image.new("RGBA", (w, h), INK)
    lo = outlined(int(min(w, h) * 0.5), 0.9)
    c.paste(lo, ((w - lo.size[0]) // 2, (h - lo.size[1]) // 2), lo)
    c.convert("RGB").save(p)
print("icons and splash screens written")
