# Builds the Arena board's sound clips (apps/web/public/arena-sounds/) from CC0
# recordings: Kenney's audio packs and sounds on Freesound (their MP3 previews).
# Each clip is cut, faded, peak-normalized to -1 dBFS and saved as mono MP3;
# CREDITS.md lists the source of every clip. Sources are cached in a work dir.
#   python3 scripts/build-arena-sounds.py [work dir]
# Needs ffmpeg. Every source is checked to be CC0 before it is used.
import json, os, re, subprocess, sys, urllib.request, zipfile

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../apps/web/public/arena-sounds")
WORK = sys.argv[1] if len(sys.argv) > 1 else "/tmp/arena-sounds-src"
UA = {"User-Agent": "Mozilla/5.0"}
KENNEY = {
    "impact": "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
    "rpg": "https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip",
    "scifi": "https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip",
}

# name: (source, start s, length s or None for all, fade-out s)
# Sources: "fs:<id>" (Freesound) or "kenney:<pack>:<file>".
CLIPS = {
    "order": ("fs:442774", 0, 0.6, 0.3),  # magic spell: the king's order (short: it plays every move)
    "step1": ("kenney:impact:footstep_concrete_000.ogg", 0, None, 0),
    "step2": ("kenney:impact:footstep_concrete_001.ogg", 0, None, 0),
    "step3": ("kenney:impact:footstep_concrete_002.ogg", 0, None, 0),
    "swing": ("fs:367182", 0, None, 0.05),  # sword swing
    "slash": ("fs:504615", 0, None, 0.1),  # blade through flesh
    "gallop": ("fs:197212", 0, None, 0),  # loopable hooves
    "land": ("kenney:impact:impactSoft_heavy_000.ogg", 0, None, 0),
    "neigh": ("fs:269571", 0, None, 0.2),
    "grind": ("fs:844329", 5.0, 1.8, 0.5),  # stone slab grinding
    "stone1": ("kenney:impact:impactMining_000.ogg", 0, None, 0.1),
    "stone2": ("kenney:impact:impactMining_001.ogg", 0, None, 0.1),
    "stone3": ("kenney:impact:impactMining_002.ogg", 0, None, 0.1),
    "portal": ("fs:735062", 0, None, 0.2),  # fast warp
    "boom": ("kenney:scifi:lowFrequency_explosion_000.ogg", 0, None, 0.4),
    "rubble": ("fs:336023", 0.2, 2.0, 0.6),
    "charge": ("fs:187363", 0, 1.6, 0.4),  # electricity crackling
    "thunder": ("fs:672776", 0.1, 3.4, 1.4),
    "zap": ("fs:136542", 0, None, 0.1),
    "whoosh": ("fs:507466", 0, None, 0.1),
    "fire": ("fs:260554", 0, 1.8, 0.6),  # fire whoosh
    "roar": ("fs:186374", 1.2, 2.2, 1.0),  # bonfire catching
    "slam": ("kenney:scifi:lowFrequency_explosion_001.ogg", 0, None, 0.3),
    "hum": ("kenney:scifi:forceField_000.ogg", 0, None, 0.3),
    "death1": ("fs:416838", 0, None, 0.1),  # death grunts
    "death2": ("fs:416839", 0, None, 0.1),
    "fall": ("fs:417994", 0, None, 0.2),  # body fall
    "horn": ("fs:539956", 0, 3.2, 1.2),  # war horn: check
    "knell": ("fs:165331", 0, None, 1.0),  # death bell: checkmate
}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def freesound(sid):
    """The sound's HQ preview and its credit; refuses anything but CC0."""
    path = f"{WORK}/fs-{sid}.mp3"
    meta = f"{WORK}/fs-{sid}.json"
    if not os.path.exists(meta):
        page = get(f"https://freesound.org/s/{sid}/").decode()
        lic = re.search(r"creativecommons\.org/(publicdomain/zero|licenses/[a-z-]+)/[0-9.]+", page)
        if not lic or "zero" not in lic.group(0):
            sys.exit(f"freesound {sid} is not CC0: {lic and lic.group(0)}")
        user = re.search(r"/people/([^/\"]+)/sounds/" + sid, page).group(1)
        title = re.search(r'data-title="([^"]*)"', page).group(1)
        prev = re.search(r"(https://cdn\.freesound\.org/previews/[0-9]+/" + sid + r"_[0-9]+)-lq\.mp3", page).group(1)
        open(path, "wb").write(get(prev + "-hq.mp3"))
        json.dump({"user": user, "title": title, "url": f"https://freesound.org/people/{user}/sounds/{sid}/"}, open(meta, "w"))
    m = json.load(open(meta))
    return path, f"[{m['title']}]({m['url']}) by {m['user']} (Freesound, CC0)"


def kenney(pack, name):
    z = f"{WORK}/kenney-{pack}.zip"
    if not os.path.exists(z):
        open(z, "wb").write(get(KENNEY[pack]))
    with zipfile.ZipFile(z) as zf:
        lic = next(n for n in zf.namelist() if n.endswith("License.txt"))
        if "CC0" not in zf.read(lic).decode(errors="ignore"):
            sys.exit(f"kenney {pack} is not CC0")
        src = next(n for n in zf.namelist() if n.endswith("/" + name))
        path = f"{WORK}/kenney-{pack}-{name}"
        open(path, "wb").write(zf.read(src))
    return path, f"{name} from [Kenney {pack} pack](https://kenney.nl/) (CC0)"


def peak_db(args):
    r = subprocess.run(["ffmpeg", "-hide_banner", *args, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    return float(re.search(r"max_volume: (-?[0-9.]+) dB", r.stderr).group(1))


os.makedirs(WORK, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
credits = []
for name, (src, start, length, fade) in CLIPS.items():
    kind, *rest = src.split(":")
    path, credit = freesound(rest[0]) if kind == "fs" else kenney(*rest)
    cut = ["-ss", str(start)] + (["-t", str(length)] if length else []) + ["-i", path]
    dur = length or float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout) - start
    fx = f"afade=t=in:d=0.005" + (f",afade=t=out:st={max(0, dur - fade):.3f}:d={fade}" if fade else "")
    gain = -1 - peak_db(cut + ["-ac", "1"])
    out = f"{OUT}/{name}.mp3"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *cut, "-ac", "1", "-ar", "44100", "-af", f"{fx},volume={gain:.2f}dB", "-b:a", "64k", out], check=True)
    credits.append(f"- `{name}.mp3`: {credit}")
    print(f"{name:8s} {os.path.getsize(out) // 1024:4d} KB  {credit}")

open(f"{OUT}/CREDITS.md", "w").write(
    "# Arena sounds\n\nSound effects for the Arena board, cut from CC0 (public domain) recordings by\n"
    "`scripts/build-arena-sounds.py`. No attribution is required; the sources are listed as thanks.\n\n" + "\n".join(credits) + "\n"
)
