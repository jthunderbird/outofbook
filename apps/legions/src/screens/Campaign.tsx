// The campaign, one chapter at a time: each page is its tribe's hero shot (the
// court, the army and its leading piece, live in 3D), with the chapter's name,
// story and reward over it and a button into its next battle. Swipe, the side
// arrows or the dots move between chapters; chapters not yet open are shown
// darkened, with what opens them.
import { useMemo, useRef, useState } from "react";
import type { Screen } from "../App";
import { battleOpen, chapterOpen, CHAPTERS } from "../campaign";
import { owns, update, useProfile } from "../profile";
import { Wallet } from "../components/Wallet";
import { TRIBES } from "@outofbook/legions/tribes";
import { COURTS } from "@outofbook/legions/courts";
import { ArrowLeft, ChevronLeft, ChevronRight, Crown, Lock, Star, Swords } from "lucide-react";
import { CampaignHero } from "../components/CampaignHero";
import { TribeBanner } from "../components/TribeBanner";

export function Campaign({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  // Open on the chapter the player is on: the first not yet beaten among those open.
  const current = useMemo(() => {
    const i = CHAPTERS.findIndex((c, i) => chapterOpen(i, p.won) && !c.battles.every((b) => p.won.includes(b.id)));
    return i < 0 ? CHAPTERS.length - 1 : i;
  }, [p.won]);
  const [i, setI] = useState(current);
  const [shown, setShown] = useState(false);
  const c = CHAPTERS[i];
  const open = chapterOpen(i, p.won);
  const next = c.battles.findIndex((b) => !p.won.includes(b.id));
  const beaten = next < 0;
  const court = COURTS.find((x) => x.id === c.court);
  const prevBoss = i > 0 ? CHAPTERS[i - 1].battles.find((b) => b.boss)?.name : null;

  const turn = (d: number) => {
    const j = Math.max(0, Math.min(CHAPTERS.length - 1, i + d));
    if (j === i) return;
    setShown(false);
    setI(j);
  };
  const swipe = useRef<number | null>(null);
  const battle = (j: number) => {
    const b = c.battles[j];
    go({ name: "game", setup: { nonce: Date.now(), battle: b.id, opponentTribe: c.tribe, elo: b.elo, side: b.side, title: b.name } });
  };

  return (
    <div className="screen campaign" data-testid="campaign">
      <div className={`campaign-stage${open ? "" : " locked"}${shown ? " shown" : ""}`}>
        <CampaignHero chapter={c} glow={p.glow} onReady={() => setShown(true)} />
      </div>
      <div
        className="campaign-swipe"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 50) turn(e.clientX < swipe.current ? 1 : -1);
          swipe.current = null;
        }}
      />
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Campaign</h2>
        <div className="spacer" />
        <label className="lead">
          <span className="muted">You lead</span>
          <select value={p.equipped.tribe} onChange={(e) => update((q) => ({ ...q, equipped: { ...q.equipped, tribe: e.target.value } }))}>
            {Object.values(TRIBES)
              .filter((t) => owns(p, `tribe:${t.id}`))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <Wallet />
      </div>

      <button className="btn dark round side left" aria-label="Previous chapter" disabled={i === 0} onClick={() => turn(-1)}>
        <ChevronLeft size={28} />
      </button>
      <button className="btn dark round side right" aria-label="Next chapter" disabled={i === CHAPTERS.length - 1} onClick={() => turn(1)}>
        <ChevronRight size={28} />
      </button>

      {!open && (
        <div className="campaign-lock">
          <Lock size={44} />
          <div>Beat {prevBoss ?? "the chapter before"} to unlock</div>
        </div>
      )}

      <div className="campaign-info">
        <div className="chapter-no">Chapter {i + 1}</div>
        <TribeBanner tribe={c.tribe} />
        <p className="story">{c.story}</p>
        <div className="reward">
          {beaten ? <Star size={16} fill="currentColor" /> : <Crown size={16} />}
          <span>
            {beaten ? "Won: " : "Win: "}
            {TRIBES[c.tribe]?.name} and {court?.name ?? "its court"}
          </span>
        </div>
        {open && (
          <div className="fight">
            <button className="btn gold" onClick={() => battle(beaten ? c.battles.length - 1 : next)}>
              <Swords size={22} /> {beaten ? "Fight the boss again" : c.battles[next].name}
            </button>
            <div className="pips" aria-label="Battles">
              {c.battles.map((b, j) => {
                const won = p.won.includes(b.id);
                const can = battleOpen(c, j, p.won);
                return (
                  <button
                    key={b.id}
                    className={`pip${won ? " won" : ""}${j === next ? " next" : ""}${b.boss ? " boss" : ""}`}
                    disabled={!can}
                    title={b.name}
                    aria-label={b.name}
                    onClick={() => battle(j)}
                  >
                    {won ? <Star size={14} fill="currentColor" /> : b.boss ? <Crown size={14} /> : j + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="dots">
          {CHAPTERS.map((x, j) => (
            <button key={x.tribe} className={j === i ? "on" : ""} aria-label={`Chapter ${j + 1}`} onClick={() => turn(j - i)} />
          ))}
        </div>
      </div>
    </div>
  );
}
