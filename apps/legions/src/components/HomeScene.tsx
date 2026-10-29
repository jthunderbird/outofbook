// The home screen's key art (homeScenes.ts), moving: the layers shift against
// each other with the pointer or the tilt of the device (and a slow drift when
// there is neither), embers rise, and lightning flashes on one side. Wide
// screens cover the screen with it; on a tall one the art takes the top and the
// two tribes are drawn toward the middle so both stay in view.
import { useEffect, useMemo, useRef, useState } from "react";
import { layerUrl, randomScene, type HomeScene as Scene } from "../homeScenes";

const ASPECT = 16 / 9;

/** The art's size and where it sits on a screen of w by h. */
function fit(w: number, h: number) {
  if (w >= h) {
    const sw = Math.max(w, h * ASPECT) * 1.06;
    return { sw, sh: sw / ASPECT, top: (h - sw / ASPECT) / 2, tall: false };
  }
  const sh = h * 0.5;
  return { sw: sh * ASPECT * 1.04, sh: sh * 1.04, top: h * 0.1, tall: true };
}

export function HomeScene({ scene: given }: { scene?: Scene }) {
  const scene = useMemo(() => given ?? randomScene(), [given]);
  const root = useRef<HTMLDivElement>(null);
  const embers = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const layers = useRef<Record<string, HTMLImageElement | null>>({});
  const [ready, setReady] = useState(false);
  const urls = (["bg", "left", "right", "fg"] as const).map((l) => layerUrl(scene, l));

  // Show the art only once all four layers have loaded.
  useEffect(() => {
    let live = true;
    let n = 0;
    for (const u of urls) {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (live && ++n === urls.length) setReady(true);
      };
      img.src = u;
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  useEffect(() => {
    const el = root.current;
    const cv = embers.current;
    if (!el || !cv) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 1;
    let h = 1;
    let f = fit(1, 1);
    let pull = 0;
    const size = () => {
      w = el.clientWidth || 1;
      h = el.clientHeight || 1;
      f = fit(w, h);
      el.style.setProperty("--sw", `${f.sw}px`);
      el.style.setProperty("--sh", `${f.sh}px`);
      el.style.setProperty("--top", `${f.top}px`);
      // On a tall screen the two tribes are drawn toward each other.
      // (Not past the gap between the two leaders in the art, or they would overlap.)
      const hidden = Math.max(0, f.sw - w);
      pull = f.tall ? Math.min(hidden * 0.36, f.sw * 0.17 * 0.45) : 0;
      cv.width = Math.round(w / 2);
      cv.height = Math.round(h / 2);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    // Where the viewer is looking: -1..1 each way, eased toward the pointer or tilt.
    const aim = { x: 0, y: 0, hasInput: false };
    const at = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      // A finger on the screen is scrolling the menu, not looking around.
      if (e.pointerType !== "mouse") return;
      aim.x = (e.clientX / w) * 2 - 1;
      aim.y = (e.clientY / h) * 2 - 1;
      aim.hasInput = true;
    };
    const tilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      aim.x = Math.max(-1, Math.min(1, e.gamma / 25));
      aim.y = Math.max(-1, Math.min(1, (e.beta - 50) / 25));
      aim.hasInput = true;
    };
    addEventListener("pointermove", move);
    addEventListener("deviceorientation", tilt);

    // Embers.
    const g = cv.getContext("2d")!;
    const [r, gr, b] = scene.ember;
    const dots = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.6, v: 0.01 + Math.random() * 0.03, p: Math.random() * 6.28 }));

    // Lightning: a flash now and then, sometimes twice.
    let flashTimer = 0;
    const strike = () => {
      const fl = flash.current;
      if (fl && !calm) {
        fl.style.opacity = "0.85";
        setTimeout(() => (fl.style.opacity = "0.15"), 60);
        setTimeout(() => (fl.style.opacity = Math.random() < 0.5 ? "0.7" : "0"), 140);
        setTimeout(() => (fl.style.opacity = "0"), 260);
      }
      flashTimer = window.setTimeout(strike, 2500 + Math.random() * 5500);
    };
    flashTimer = window.setTimeout(strike, 1500);

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const t = now / 1000;
      if (!aim.hasInput) {
        // Nothing to follow: a slow drift.
        aim.x = Math.sin(t * 0.25) * 0.5;
        aim.y = Math.cos(t * 0.19) * 0.3;
      }
      const k = calm ? 0 : 1 - Math.pow(0.001, dt / 1000);
      at.x += (aim.x - at.x) * k;
      at.y += (aim.y - at.y) * k;
      // Depth: the further from the back, the more a layer moves.
      const m = Math.min(f.sw, 1400) / 1400;
      for (const [name, d, shift] of [
        ["bg", 8, 0],
        ["left", 22, pull],
        ["right", 22, -pull],
        ["fg", 52, 0],
      ] as const) {
        const x = -at.x * d * m + shift;
        const y = -at.y * d * 0.6 * m;
        const sc = name === "bg" ? 1.03 : name === "fg" ? 1.05 : 1;
        const l = layers.current[name];
        if (l) l.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${sc})`;
      }
      g.clearRect(0, 0, cv.width, cv.height);
      if (!calm)
        for (const d of dots) {
          d.y -= d.v * (dt / 16);
          d.x += Math.sin(t * 0.8 + d.p) * 0.0006 * (dt / 16);
          if (d.y < -0.02) {
            d.y = 1.02;
            d.x = Math.random();
          }
          const a = 0.35 + 0.35 * Math.sin(t * 3 + d.p);
          g.fillStyle = `rgba(${r},${gr},${b},${a.toFixed(2)})`;
          g.beginPath();
          g.arc(d.x * cv.width, d.y * cv.height, d.s, 0, 6.28);
          g.fill();
        }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(flashTimer);
      ro.disconnect();
      removeEventListener("pointermove", move);
      removeEventListener("deviceorientation", tilt);
    };
  }, [scene]);

  return (
    <div ref={root} className={`home-scene${ready ? " ready" : ""}`} aria-hidden="true">
      <div className="hs-stage">
        <img
          ref={(e) => {
            layers.current.bg = e;
          }}
          className="hs-layer hs-bg"
          src={urls[0]}
          alt=""
          draggable={false}
        />
        <div ref={flash} className={`hs-flash ${scene.flashSide}`} style={{ ["--flash" as string]: scene.flash }} />
        <img
          ref={(e) => {
            layers.current.left = e;
          }}
          className="hs-layer hs-left"
          src={urls[1]}
          alt=""
          draggable={false}
        />
        <img
          ref={(e) => {
            layers.current.right = e;
          }}
          className="hs-layer hs-right"
          src={urls[2]}
          alt=""
          draggable={false}
        />
        <img
          ref={(e) => {
            layers.current.fg = e;
          }}
          className="hs-layer hs-fg"
          src={urls[3]}
          alt=""
          draggable={false}
        />
      </div>
      <canvas ref={embers} className="hs-embers" />
      <div className="hs-shade" />
    </div>
  );
}
