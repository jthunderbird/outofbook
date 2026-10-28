import type { Screen } from "../App";
import { battleOpen, chapterOpen, CHAPTERS } from "../campaign";
import { owns, update, useProfile } from "../profile";
import { TRIBES } from "@outofbook/legions/tribes";
import { ArrowLeft, Crown, Lock, Star } from "lucide-react";

export function Campaign({ go }: { go: (s: Screen) => void }) {
  const p = useProfile();
  return (
    <div className="screen" data-testid="campaign">
      <div className="topbar">
        <button className="btn dark round" onClick={() => go({ name: "home" })} aria-label="Back">
          <ArrowLeft size={22} />
        </button>
        <h2>Campaign</h2>
      </div>
      <div className="panel" style={{ width: "min(620px, 100%)", margin: "0 auto 16px" }}>
        <div style={{ marginBottom: 8 }}>You lead</div>
        <div className="choices">
          {Object.values(TRIBES).map((t) => {
            const have = owns(p, `tribe:${t.id}`);
            return (
              <button key={t.id} className={p.equipped.tribe === t.id ? "on" : ""} disabled={!have} onClick={() => update((q) => ({ ...q, equipped: { ...q.equipped, tribe: t.id } }))}>
                {!have && <Lock size={14} />} {t.name}
              </button>
            );
          })}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Each battle is fought against its tribe, on its home court.
        </div>
      </div>
      <div className="grid even">
        {CHAPTERS.map((c, i) => {
          const open = chapterOpen(i, p.won);
          const beaten = c.battles.every((b) => p.won.includes(b.id));
          return (
            <div key={c.tribe} className={`card chapter${open ? "" : " locked"}`} style={{ ["--i" as string]: i }}>
              <h3>
                {c.name}{" "}
                {beaten && (
                  <span className="stars">
                    <Star size={16} fill="currentColor" /> beaten
                  </span>
                )}
              </h3>
              <div className="muted">{c.story}</div>
              <div className="battles">
                {c.battles.map((b, j) => {
                  const won = p.won.includes(b.id);
                  const can = open && battleOpen(c, j, p.won);
                  return (
                    <button
                      key={b.id}
                      className={`btn small ${b.boss ? "red" : won ? "green" : ""}`}
                      style={{ ["--i" as string]: j + 1, justifyContent: "space-between" }}
                      disabled={!can}
                      onClick={() => go({ name: "game", setup: { nonce: Date.now(), battle: b.id, opponentTribe: c.tribe, elo: b.elo, side: b.side, title: b.name } })}
                    >
                      <span>
                        {b.boss && <Crown size={16} style={{ verticalAlign: -2, marginRight: 6 }} />}
                        {b.name}
                      </span>
                      <span>{won ? <Star size={18} fill="currentColor" /> : can ? `${b.elo}` : <Lock size={16} />}</span>
                    </button>
                  );
                })}
              </div>
              {/* Kept in place when beaten (hidden), so every chapter's card is the same size. */}
              <div className="muted" style={{ marginTop: 10, fontSize: 13, visibility: beaten ? "hidden" : "visible" }}>
                Beat the boss to unlock this tribe.
              </div>
            </div>
          );
        })}
        <div className="card chapter locked" style={{ ["--i" as string]: CHAPTERS.length }}>
          <h3>More tribes</h3>
          <div className="muted">New tribes join the campaign one by one, each stronger than the last.</div>
        </div>
      </div>
    </div>
  );
}
