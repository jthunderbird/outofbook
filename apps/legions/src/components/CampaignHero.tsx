// A campaign page's hero shot: the chapter's court and board in the engine's
// own scene, its army drawn up on the far side, and its leading piece in front,
// ready for battle, now and then leaping toward the player. One scene serves
// every page; changing chapter swaps the court, tribe and hero.
import { useEffect, useRef } from "react";
import { DirectionalLight, SpotLight } from "three";
import { LegionsScene } from "@outofbook/legions/scene";
import { tribe } from "@outofbook/legions/tribes";
import type { Fig } from "@outofbook/legions/figures";
import type { Chapter } from "../campaign";

/** The chapter's army on the far side of the board, facing the player. */
const ARMY = "rnbqkbnr/pppppppp/8/8/8/8/8/8 b - - 0 1";
/** Where the hero stands: just in front of the board, on the player's side. */
const SPOT = 4.4;

export function CampaignHero({ chapter, glow, onReady }: { chapter: Chapter; glow: boolean; onReady?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<LegionsScene | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const s = new LegionsScene(host.current!);
    scene.current = s;
    // Low in front of the hero, looking up at it (the heroic angle) and past it up the board at the army.
    // On wide screens the chapter's card stands at the left: the shot shifts so the hero stands right of the middle.
    // On tall screens the card takes the lower part: the camera stands back and looks lower, so the hero stands in the upper part, whole.
    const frame = () => {
      const a = innerWidth / innerHeight;
      if (a >= 4 / 3) s.setShowcase({ pos: [-1.1, 0.8, 8.4], target: [-1.1, 1.3, 2.5], fov: 40 });
      else if (a >= 0.8) s.setShowcase({ pos: [0, 1, 10], target: [0, 0.9, 2.5], fov: 42 });
      else s.setShowcase({ pos: [0, 1.2, 11], target: [0, 0.45, 2.5], fov: 46 });
    };
    frame();
    addEventListener("resize", frame);
    // The hero's own light: a warm key from the front, high on the left, and a strong cool rim from behind that cuts it out of the scene.
    const key = new SpotLight(0xffe6c0, 26, 16, 0.22, 0.7, 1.2);
    key.position.set(-2.5, 6, 11);
    key.target.position.set(0, 1.3, SPOT);
    const rim = new DirectionalLight(0x9fc4ff, 1.6);
    rim.position.set(1.5, 3.5, -2);
    rim.target.position.set(0, 1, SPOT);
    for (const o of [key, key.target, rim, rim.target]) s.addObject(o);
    if (import.meta.env.DEV) (window as unknown as { legions?: LegionsScene }).legions = s;
    return () => {
      removeEventListener("resize", frame);
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => scene.current?.setGlow(glow), [glow]);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    const t = tribe(chapter.tribe);
    let hero: Fig | null = null;
    let gone = false;
    let timer = 0;
    s.setTribes({ w: t, b: t });
    s.setCourt(chapter.court);
    s.setPosition(ARMY);
    void (async () => {
      await t.ready?.();
      if (gone) return;
      const f = t.figure(chapter.hero.role, "b");
      f.root.position.set(0, 0, SPOT);
      s.addFigure(f);
      hero = f;
      const { idle, action, leap = 0 } = chapter.hero;
      if (f.anim && idle) void f.play(idle, { loop: true });
      ready.current?.();
      // Now and then: the action (a clip, or a hop for a sprite) with a leap toward the player and back.
      const act = async () => {
        if (gone) return;
        const start = performance.now();
        const run = f.anim && action ? f.play(action, { fade: 0.2 }) : new Promise<void>((r) => setTimeout(r, 900));
        const sprite = !f.anim;
        const step = () => {
          if (gone) return;
          const k = Math.min(1, (performance.now() - start) / 900);
          f.root.position.z = SPOT + Math.sin(k * Math.PI) * leap;
          if (sprite) f.root.position.y = Math.sin(k * Math.PI) * 0.6;
          if (k < 1) requestAnimationFrame(step);
        };
        step();
        await run;
        if (f.anim && idle && !gone) void f.play(idle, { loop: true, fade: 0.3 });
        timer = window.setTimeout(act, 5200);
      };
      timer = window.setTimeout(act, 1400);
    })();
    return () => {
      gone = true;
      clearTimeout(timer);
      if (hero) s.removeFigure(hero);
    };
  }, [chapter]);

  return <div ref={host} className="campaign-hero" />;
}
