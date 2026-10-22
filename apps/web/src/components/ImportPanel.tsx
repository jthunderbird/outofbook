import { useState } from "react";
import { Download } from "lucide-react";
import { importChessCom, importLichess, type ImportFilters, type ImportProgress } from "@outofbook/core/import";
import type { RawGame } from "@outofbook/core/types";
import { Alert, Button, Field, Input, Progress, Select, cx } from "./ui";

const SPEEDS = ["bullet", "blitz", "rapid", "classical", "correspondence"];
export const SERVER_SAVE_LIMIT = 200;

export function ImportPanel({
  token,
  defaultUser,
  saveLimit,
  onImported,
  compact,
}: {
  token: string | null;
  defaultUser: string;
  saveLimit?: number | null; // undefined: not logged in; null: unlimited
  onImported: (games: RawGame[], meta: { filters: ImportFilters; ms: number }) => void;
  compact?: boolean;
}) {
  const [f, setF] = useState<ImportFilters>({
    site: "lichess",
    username: defaultUser,
    max: 1000,
    speeds: ["blitz", "rapid", "classical"],
    rated: "all",
  });
  const [sinceStr, setSinceStr] = useState("");
  const [prog, setProg] = useState<ImportProgress | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setErr("");
    setBusy(true);
    const all: RawGame[] = [];
    const filters = { ...f, since: sinceStr ? new Date(sinceStr).getTime() : undefined };
    let last: ImportProgress = { games: 0, ms: 0, done: false };
    const onGames = (b: RawGame[], p: ImportProgress) => {
      all.push(...b);
      last = p;
      setProg(p);
    };
    try {
      if (f.site === "lichess") await importLichess(filters, token, onGames);
      else await importChessCom(filters, onGames);
      onImported(all, { filters, ms: last.ms });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={cx("grid items-end gap-2.5", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[130px_1fr_110px_150px_110px_auto]")}>
        <Field label="Site">
          <Select
            value={f.site}
            onChange={(e) => setF({ ...f, site: e.target.value as ImportFilters["site"] })}
            options={[
              ["lichess", "Lichess"],
              ["chesscom", "Chess.com"],
            ]}
          />
        </Field>
        <Field label="Username">
          <Input aria-label="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.trim() })} placeholder="your username" />
        </Field>
        <Field label="Last N games">
          <Input aria-label="Last N games" type="number" value={f.max} onChange={(e) => setF({ ...f, max: Math.max(1, +e.target.value) })} />
        </Field>
        <Field label="Since">
          <Input type="date" value={sinceStr} onChange={(e) => setSinceStr(e.target.value)} />
        </Field>
        <Field label="Rated">
          <Select
            value={f.rated}
            onChange={(e) => setF({ ...f, rated: e.target.value as ImportFilters["rated"] })}
            options={[
              ["all", "All"],
              ["rated", "Rated"],
              ["casual", "Casual"],
            ]}
          />
        </Field>
        <Button variant="primary" onClick={run} disabled={busy || !f.username} className={compact ? "col-span-2" : ""}>
          <Download size={15} /> Load games
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SPEEDS.map((s) => {
          const on = f.speeds.includes(s);
          return (
            <button
              key={s}
              type="button"
              className="ui-badge cursor-pointer capitalize"
              style={
                on
                  ? { background: "color-mix(in oklab, var(--accent) 18%, transparent)", color: "var(--accent)", borderColor: "color-mix(in oklab, var(--accent) 40%, transparent)" }
                  : { color: "var(--muted)", borderColor: "var(--border)" }
              }
              onClick={() => setF({ ...f, speeds: on ? f.speeds.filter((x) => x !== s) : [...f.speeds, s] })}
            >
              {on ? "✓ " : ""}
              {s}
            </button>
          );
        })}
      </div>
      {saveLimit !== null && saveLimit !== undefined && f.max > saveLimit && (
        <Alert tone="info">
          More than {saveLimit} games: they are analyzed in this browser session but will <b>not be saved</b> to your account.
        </Alert>
      )}
      {saveLimit === undefined && <Alert tone="info">Log in with Lichess to save up to {SERVER_SAVE_LIMIT} games to your account and share engine work with other users.</Alert>}
      {f.site === "lichess" && !token && <Alert tone="warn">Not logged in to Lichess: export is throttled harder. Log in for faster import.</Alert>}
      {prog && (
        <div className="flex flex-col gap-1">
          {busy && <Progress value={f.max ? (prog.games / f.max) * 100 : undefined} />}
          <span className="num text-xs text-muted" data-testid="import-progress">
            {prog.games} games in {(prog.ms / 1000).toFixed(1)} s ({(prog.games / Math.max(0.001, prog.ms / 1000)).toFixed(0)} games/s)
            {prog.done ? " · done" : ""}
          </span>
        </div>
      )}
      {err && <Alert tone="bad">{err}</Alert>}
    </div>
  );
}
