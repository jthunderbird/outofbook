// A puzzle challenge: its puzzles one after another on the 3D board, the
// player's tribe against the stage's world, against one clock for the lot. A
// puzzle opens with the opponent's move; then every move must be the solution's
// (any mate in one counts). One wrong move, or the clock reaching zero, loses
// the challenge, unless a retry is spent within 3 seconds: then a fresh puzzle
// takes the failed one's place (and a timeout gets 30 more seconds). The clock
// stands still while the board acts out moves.
import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import LegionsBoard from "@outofbook/legions/LegionsBoard";
import type { Side } from "@outofbook/legions/figures";
import { TRIBES } from "@outofbook/legions/tribes";
import type { Screen } from "../App";
import { CHALLENGES, TREK_XP, challengeXp, clock, drawPuzzles, findChallenge, worldOf, type Puzzle, type Tally } from "../puzzles";
import { award, getProfile, owns, update, useProfile, type Reward } from "../profile";
import { Check, Clock, LockOpen, RotateCcw, Trophy, Volume2, VolumeX, X } from "lucide-react";

type State = "loading" | "opening" | "play" | "reply" | "solved" | "failed" | "passed" | "error";
const RETRY_WINDOW = 3000;

export function PuzzleRun({ id, go }: { id: string; go: (s: Screen) => void }) {
  const c = findChallenge(id)!;
  const p = useProfile();
  const world = worldOf(c.stage);
  const chess = useRef(new Chess());
  const frame = useRef<HTMLDivElement>(null);
  const queue = useRef<Puzzle[]>([]);
  const idx = useRef(0);
  const ply = useRef(0);
  const [solved, setSolved] = useState(0);
  const [fen, setFen] = useState(chess.current.fen());
  const [last, setLast] = useState<string | undefined>();
  const [mine, setMine] = useState<Side>("w");
  const [state, setState] = useState<State>("loading");
  const [why, setWhy] = useState<"wrong" | "time">("wrong");
  const [left, setLeft] = useState(c.seconds * 1000);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [reward, setReward] = useState<Reward | null>(null);
  const [complete, setComplete] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(Date.now());
  const recorded = useRef(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => void (live.current = false);
  }, []);
  const later = (ms: number, fn: () => void) => setTimeout(() => live.current && fn(), ms);

  /** Sets up the puzzle at idx: its position, then the opponent's move. */
  const begin = useCallback(async () => {
    if (idx.current >= queue.current.length) queue.current.push(...(await drawPuzzles(c.rating, 3, new Set(queue.current.map((q) => q.id)))));
    const pz = queue.current[idx.current];
    if (!pz) return setState("error");
    chess.current.load(pz.fen);
    setMine(chess.current.turn() === "w" ? "b" : "w");
    setFen(chess.current.fen());
    setLast(undefined);
    setState("opening");
    later(700, () => {
      const m = pz.moves[0];
      chess.current.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      ply.current = 1;
      setFen(chess.current.fen());
      setLast(m);
      setState("play");
    });
  }, [c.rating]);

  useEffect(() => {
    let off = false;
    drawPuzzles(c.rating, c.puzzles)
      .then((list) => {
        if (off) return;
        queue.current = list;
        if (list.length < c.puzzles) return setState("error");
        void begin();
      })
      .catch(() => !off && setState("error"));
    return () => void (off = true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The clock: running only while it is the player's move and the board is still.
  useEffect(() => {
    if (state !== "play" || busy) return;
    let at = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const dt = now - at;
      at = now;
      setLeft((l) => Math.max(0, l - dt));
    }, 100);
    return () => clearInterval(t);
  }, [state, busy]);
  useEffect(() => {
    if (left <= 0 && state === "play") fail("time");
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds this challenge's try to the run's and all-time tallies (once), the pass to the run's progress. */
  const record = (passed: boolean) => {
    if (recorded.current) return;
    recorded.current = true;
    const ms = Date.now() - started.current;
    const add = (x: Tally): Tally => ({ ms: x.ms + ms, played: x.played + 1, passed: x.passed + (passed ? 1 : 0), failed: x.failed + (passed ? 0 : 1) });
    const before = getProfile().trek;
    const first = passed && !before.cleared.includes(c.id);
    const cleared = first ? [...before.cleared, c.id] : before.cleared;
    const finishing = first && !before.finished && CHALLENGES.every((x) => cleared.includes(x.id));
    update((q) => ({
      ...q,
      trek: { ...q.trek, cleared, total: add(q.trek.total), run: add(q.trek.run), finished: q.trek.finished || finishing, runs: q.trek.runs + (finishing ? 1 : 0) },
    }));
    if (first) {
      // The whole trek done: Retro mode the first time, a large XP lump after.
      const items = finishing && before.runs === 0 ? (["mode:retro"] as const) : [];
      setReward(award(challengeXp(c) + (finishing && before.runs > 0 ? TREK_XP : 0), [...items]));
      setComplete(finishing);
    }
  };

  const fail = (w: "wrong" | "time") => {
    setWhy(w);
    setState("failed");
    setCountdown(RETRY_WINDOW);
  };

  // After a failure: 3 seconds to spend a retry, then back to the trek.
  useEffect(() => {
    if (state !== "failed") return;
    const end = performance.now() + RETRY_WINDOW;
    const t = setInterval(() => {
      const r = end - performance.now();
      setCountdown(Math.max(0, r));
      if (r <= 0) {
        clearInterval(t);
        record(false);
        go({ name: "trek" });
      }
    }, 50);
    return () => clearInterval(t);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = () => {
    if (p.perks.retry <= 0 || state !== "failed") return;
    update((q) => ({ ...q, perks: { ...q.perks, retry: q.perks.retry - 1 } }));
    if (why === "time") setLeft((l) => l + 30000);
    idx.current++;
    void begin();
  };

  const onMove = (uci: string) => {
    if (state !== "play") return;
    const pz = queue.current[idx.current];
    const want = pz.moves[ply.current];
    try {
      chess.current.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? (want?.slice(0, 4) === uci.slice(0, 4) ? want[4] : undefined) });
    } catch {
      return;
    }
    setFen(chess.current.fen());
    setLast(uci);
    // The solution's move, or any mate.
    const right = uci.slice(0, 4) === want.slice(0, 4) || chess.current.isCheckmate();
    if (!right) return fail("wrong");
    ply.current++;
    if (ply.current >= pz.moves.length || chess.current.isCheckmate()) {
      const n = solved + 1;
      setSolved(n);
      if (n >= c.puzzles) {
        setState("passed");
        record(true);
        return;
      }
      setState("solved");
      later(900, () => {
        idx.current++;
        void begin();
      });
      return;
    }
    setState("reply");
    later(450, () => {
      const m = pz.moves[ply.current];
      chess.current.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      ply.current++;
      setFen(chess.current.fen());
      setLast(m);
      setState("play");
    });
  };

  // Dev: what the player should play now, and a way to play it: legionsPuzzle.want(), legionsPuzzle.play(uci).
  if (import.meta.env.DEV)
    (window as unknown as { legionsPuzzle?: object }).legionsPuzzle = { want: () => (state === "play" ? queue.current[idx.current]?.moves[ply.current] : null), play: onMove, state, busy, left, fen };

  const leave = () => {
    if (state === "passed" || state === "error" || state === "loading") return go({ name: "trek" });
    setLeaving(true);
  };

  const tribes = mine === "w" ? { w: p.equipped.tribe, b: world.tribe } : { w: world.tribe, b: p.equipped.tribe };
  const nextC = CHALLENGES[CHALLENGES.indexOf(c) + 1];
  const low = left < 10000;

  return (
    <div className="game puzzle-run" data-testid="puzzle-run">
      <div className="stage">
        <LegionsBoard
          frame={frame}
          fen={fen}
          orientation={mine}
          lastMove={last}
          movable={state === "play" ? mine : undefined}
          onMove={onMove}
          onBusy={setBusy}
          sound={p.sound}
          tribes={tribes}
          court={world.court}
          glow={p.glow}
          pixel={p.retro && owns(p, "mode:retro")}
        />
      </div>
      <div className="board" ref={frame} />
      <div className="banner top">
        <div className="sub muted">
          Stage {c.stage} · Challenge {c.n} · rated about {c.rating}
        </div>
        <div className={`puzzle-clock${low ? " low" : ""}`}>
          <Clock size={20} /> {clock(left)}
        </div>
        <div className="puzzle-dots" aria-label={`${solved} of ${c.puzzles} solved`}>
          {Array.from({ length: c.puzzles }, (_, i) => (
            <span key={i} className={i < solved ? "done" : i === solved ? "now" : ""} />
          ))}
        </div>
      </div>
      <div className="banner bottom">
        <div className={`puzzle-prompt${state === "play" ? " on" : ""}`}>
          {state === "solved" ? "Solved!" : state === "play" ? `Your move: find the best move for ${mine === "w" ? "White" : "Black"}` : state === "loading" ? "Gathering puzzles…" : " "}
        </div>
        <div className="sub muted">{TRIBES[p.equipped.tribe]?.name}</div>
      </div>
      <div className="rail">
        <button className="btn mini dark" onClick={() => update((q) => ({ ...q, sound: !q.sound }))} aria-label={p.sound ? "Sound off" : "Sound on"}>
          {p.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className="btn mini red" onClick={leave} aria-label="Leave">
          <X size={18} />
        </button>
      </div>

      {state === "error" && (
        <div className="overlay">
          <div className="panel">
            <h2>Puzzles failed to load</h2>
            <p className="muted">Check your connection and try again.</p>
            <button className="btn dark small" onClick={() => go({ name: "trek" })}>
              Back to the trek
            </button>
          </div>
        </div>
      )}

      {state === "failed" && (
        <div className="overlay">
          <div className="panel">
            <h2 className="loss">{why === "time" ? "Out of time" : "Wrong move"}</h2>
            <div className="muted">
              {solved} of {c.puzzles} solved
            </div>
            <div className="bar" style={{ margin: "14px 0" }}>
              <div style={{ width: `${(100 * countdown) / RETRY_WINDOW}%`, transition: "none" }} />
            </div>
            <div className="row-btns">
              <button
                className="btn dark small"
                onClick={() => {
                  record(false);
                  go({ name: "trek" });
                }}
              >
                Back to the trek
              </button>
              {p.perks.retry > 0 && (
                <button className="btn gold small" onClick={retry}>
                  <RotateCcw size={16} /> Use retry ({p.perks.retry})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {state === "passed" && (
        <div className="overlay" data-testid="passed">
          <div className="panel">
            <h2 className="win">{complete ? "Trek complete!" : "Challenge passed!"}</h2>
            <div className="muted">
              {c.puzzles} puzzles with {clock(left)} to spare
            </div>
            {complete && (
              <div className="unlock">
                <Trophy size={16} style={{ verticalAlign: -3 }} /> Every challenge passed
              </div>
            )}
            {reward && (
              <>
                <div style={{ margin: "14px 0 6px", fontSize: 22, color: "var(--gold)" }}>+{reward.xp} XP</div>
                {reward.unlocked.map((i) => (
                  <div key={i} className="unlock">
                    <LockOpen size={16} style={{ verticalAlign: -3 }} /> Unlocked {i === "mode:retro" ? "Retro mode" : i}
                  </div>
                ))}
              </>
            )}
            <div className="row-btns">
              <button className="btn dark small" onClick={() => go({ name: "trek" })}>
                Back to the trek
              </button>
              {nextC && !complete && (
                <button className="btn gold small" onClick={() => go({ name: "puzzle", challenge: nextC.id, nonce: Date.now() })}>
                  <Check size={16} /> Next challenge
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {leaving && (
        <div className="overlay" onClick={() => setLeaving(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <h2>Leave the challenge?</h2>
            <div className="muted">It counts as failed.</div>
            <div className="row-btns">
              <button className="btn dark small" onClick={() => setLeaving(false)}>
                Keep going
              </button>
              <button
                className="btn red small"
                onClick={() => {
                  record(false);
                  go({ name: "trek" });
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
