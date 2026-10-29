// The puzzle trek: the player's king on a long track of stepping stones through
// space, one stone per challenge, a gate at each stage. Drag to look along the
// track, tap a stone (or the meter below) to pick a challenge; the card shows
// what it asks and starts it. The run's tallies stay in view; a finished run
// may be played again from the start, or any challenge replayed.
import { useEffect, useMemo, useRef, useState } from "react";
import { TrekScene, type TrekStop } from "@outofbook/legions/trek";
import { tribe } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { CHALLENGES, MEDAL_NAMES, STAGES, challengeOpen, clock, duration, medalCounts, medalTimes, nextChallenge, NEW_TALLY, worldOf, type Trek as TrekState } from "../puzzles";
import { myLook, update, useProfile } from "../profile";
import { Wallet } from "../components/Wallet";
import { ArrowLeft, Check, Clock, Lock, Play, Puzzle, RotateCcw, Trophy, X } from "lucide-react";

/** Where the hero was last shown standing (this visit). */
let heroAt: number | null = null;

export function Trek({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  const t = p.trek;
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TrekScene | null>(null);
  const place = useMemo(() => {
    const n = nextChallenge(t);
    return n ? CHALLENGES.indexOf(n) : CHALLENGES.length - 1;
  }, [t]);
  const [sel, setSel] = useState(place);
  const c = CHALLENGES[sel];
  const open = challengeOpen(t, c);
  const done = t.cleared.includes(c.id);

  const stops = useMemo<TrekStop[]>(
    () =>
      CHALLENGES.map((x, i) => ({
        stage: x.stage,
        state: t.cleared.includes(x.id) ? "done" : i === place && !t.finished ? "next" : challengeOpen(t, x) ? "open" : "locked",
        medal: t.medals?.[x.id] ?? 0,
      })),
    [t, place],
  );

  useEffect(() => {
    const s = new TrekScene(host.current!, (i) => setSel(i));
    scene.current = s;
    s.setStops(stops);
    s.select(place);
    // Back from a passed challenge: the hero walks on from where it stood.
    void s.setHero(tribe(p.equipped.tribe), Math.min(heroAt ?? place, place), myLook(p)).then(() => s.goTo(place));
    heroAt = place;
    if (import.meta.env.DEV) (window as unknown as { trek?: TrekScene }).trek = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => scene.current?.setStops(stops), [stops]);
  useEffect(() => scene.current?.select(sel), [sel]);

  const start = () => go({ name: "puzzle", challenge: c.id, nonce: Date.now() });
  const startOver = () => {
    update((q) => ({ ...q, trek: { ...q.trek, cleared: [], finished: false, run: NEW_TALLY } }));
    setSel(0);
    scene.current?.goTo(0);
  };

  // The meter: one segment a stage, as wide as its number of challenges, filled as far as the run has gone.
  const byStage = Array.from({ length: STAGES }, (_, i) => CHALLENGES.filter((x) => x.stage === i + 1));

  return (
    <div className="screen trek" data-testid="trek">
      <div className="trek-stage" ref={host} />
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Puzzle trek</h2>
        <div className="spacer" />
        <div className="trek-progress" title="Challenges passed on this run">
          <Trophy size={16} /> {t.cleared.length} / {CHALLENGES.length}
        </div>
        <Wallet />
        <Tallies t={t} />
      </div>

      {t.finished && (
        <div className="trek-done">
          <Trophy size={22} />
          <span>Trek complete{t.runs > 1 ? ` ${t.runs} times` : ""}! Replay any challenge, or start again.</span>
          <button className="btn gold small" onClick={startOver}>
            <RotateCcw size={16} /> Start over
          </button>
        </div>
      )}

      <div className="trek-card">
        <div className="trek-where">
          Stage {c.stage} · Challenge {c.n} of {byStage[c.stage - 1].length} · {worldOf(c.stage).name} world
        </div>
        <div className="trek-asks">
          <span>
            <Puzzle size={16} /> {c.puzzles} puzzles
          </span>
          <span>
            <Clock size={16} /> {clock(c.seconds * 1000)}
          </span>
          <span>Rated about {c.rating}</span>
        </div>
        <div className="muted small">
          Solve every puzzle before the clock runs out. One wrong move and the challenge is lost. Gold within {clock(medalTimes(c).gold * 1000)}, silver within {clock(medalTimes(c).silver * 1000)}.
        </div>
        {!!t.medals?.[c.id] && (
          <div className={`medal-won m${t.medals[c.id]}`}>
            <span className="coin" /> Best: {MEDAL_NAMES[t.medals[c.id]]}
          </div>
        )}
        <button className="btn gold" disabled={!open} onClick={start}>
          {open ? <Play size={20} /> : <Lock size={20} />} {!open ? "Pass the challenge before" : done ? "Play again" : "Start the challenge"}
        </button>
        <div className="trek-meter" aria-label="Trek progress">
          {byStage.map((list, i) => (
            <button
              key={i}
              className="seg"
              style={{ flexGrow: list.length }}
              aria-label={`Stage ${i + 1}`}
              onClick={() => {
                const j = list.find((x) => !t.cleared.includes(x.id) && challengeOpen(t, x)) ?? list[0];
                setSel(CHALLENGES.indexOf(j));
              }}
            >
              <span className="fill" style={{ width: `${(100 * list.filter((x) => t.cleared.includes(x.id)).length) / list.length}%` }} />
              {i + 1 === c.stage && <span className="here" style={{ left: `${(100 * (c.n - 0.5)) / list.length}%` }} />}
            </button>
          ))}
        </div>
        <div className="muted small">
          {t.cleared.length} of {CHALLENGES.length} challenges passed on this run
        </div>
      </div>
    </div>
  );
}

function Tallies({ t }: { t: TrekState }) {
  const m = medalCounts(t);
  return (
    <div className="trek-tallies" title={`All runs: ${duration(t.total.ms)}, ${t.total.played} played, ${t.total.passed} passed, ${t.total.failed} failed`}>
      <span>
        <Clock size={14} /> {duration(t.run.ms)}
      </span>
      <span>
        <Play size={14} /> {t.run.played}
      </span>
      <span className="good">
        <Check size={14} /> {t.run.passed}
      </span>
      <span className="bad">
        <X size={14} /> {t.run.failed}
      </span>
      {[3, 2, 1].map((k) => (
        <span key={k} className={`medal-count m${k}`} title={`${MEDAL_NAMES[k]} medals`}>
          <span className="coin" /> {m[k]}
        </span>
      ))}
      {t.runs > 0 && (
        <span className="all muted">
          All runs: {duration(t.total.ms)} · {t.total.passed}/{t.total.played}
        </span>
      )}
    </div>
  );
}
