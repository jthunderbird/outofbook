import { useState } from "react";
import { MODES, useDesign } from "../design/design";
import type { Settings } from "../lib/settings";
import type { Verdict } from "@outofbook/core/types";
import { Button, Dialog, Field, Input, Seg, Switch } from "./ui";

const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(+v || 0)));

export function SettingsDialog({ open, value, onClose }: { open: boolean; value: Settings; onClose: (s?: Settings) => void }) {
  const [s, setS] = useState(value);
  const { design, setDesign } = useDesign();
  const toggleV = (v: Verdict, on: boolean) => setS({ ...s, whoCaresVerdicts: on ? [...s.whoCaresVerdicts, v] : s.whoCaresVerdicts.filter((x) => x !== v) });
  return (
    <Dialog
      open={open}
      onClose={() => onClose()}
      title="Settings"
      footer={
        <>
          <Button variant="ghost" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onClose(s)}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <div className="ui-h2">Appearance</div>
          <Field label="Theme" hint="Applies right away.">
            <Seg value={design.mode} onChange={(mode) => setDesign({ mode })} options={MODES} />
          </Field>
        </section>
        <section className="flex flex-col gap-3">
          <div className="ui-h2">Analysis</div>
          <Field label="Engine" hint="Used for all analysis. Full is stronger and slower; it downloads 113 MB once.">
            <Seg
              value={s.engineBuild}
              onChange={(engineBuild) => setS({ ...s, engineBuild })}
              options={[
                ["lite", "Stockfish 18 lite (7 MB)"],
                ["full", "Stockfish 18 (113 MB)"],
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Review: live engine depth (0 = until stopped)">
              <Input type="number" value={s.reviewDepth} onChange={(e) => setS({ ...s, reviewDepth: num(e.target.value, 0, 40) })} />
            </Field>
            <Field label="Review: engine lines">
              <Input type="number" value={s.reviewLines} onChange={(e) => setS({ ...s, reviewLines: num(e.target.value, 1, 5) })} />
            </Field>
            <Field label="Engine depth">
              <Input type="number" value={s.depth} onChange={(e) => setS({ ...s, depth: num(e.target.value, 6, 30) })} />
            </Field>
            <Field label="Engine workers (0 = auto)">
              <Input type="number" value={s.poolSize} onChange={(e) => setS({ ...s, poolSize: num(e.target.value, 0, 32) })} />
            </Field>
            <Field label="Cloud eval up to ply">
              <Input type="number" value={s.cloudMaxPly} onChange={(e) => setS({ ...s, cloudMaxPly: num(e.target.value, 0, 60) })} />
            </Field>
            <Field label="Moves analyzed after book ends (plies)" hint="Changing this rebuilds the repertoire.">
              <Input type="number" value={s.pliesAfterBook} onChange={(e) => setS({ ...s, pliesAfterBook: num(e.target.value, 0, 40) })} />
            </Field>
          </div>
          <Switch checked={s.useCloud} onChange={(v) => setS({ ...s, useCloud: v })} label="Use Lichess cloud eval" />
        </section>
        <section className="flex flex-col gap-3">
          <div className="ui-h2">Lists</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min games (starting value for all lists)">
              <Input type="number" value={s.minGames} onChange={(e) => setS({ ...s, minGames: num(e.target.value, 1, 1000) })} />
            </Field>
            <Field label="Earliest move (who cares)" hint="Earlier moves are mostly move-order tricks.">
              <Input type="number" value={s.whoCaresMinMove} onChange={(e) => setS({ ...s, whoCaresMinMove: num(e.target.value, 1, 40) })} />
            </Field>
          </div>
          <div className="text-sm">"Book? Who cares" shows out-of-book moves rated:</div>
          <div className="flex flex-wrap gap-4">
            {(["splendid", "perfect", "best", "excellent"] as Verdict[]).map((v) => (
              <Switch key={v} checked={s.whoCaresVerdicts.includes(v)} onChange={(on) => toggleV(v, on)} label={v} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <div className="ui-h2">Claude</div>
          <Field label="Anthropic API key (kept in this browser only)" hint={'Used by "Ask Claude" on mistakes, in game review and in the chat layout. Billed to your own Anthropic API account.'}>
            <Input type="password" value={s.claudeKey} onChange={(e) => setS({ ...s, claudeKey: e.target.value })} placeholder="sk-ant-…" />
          </Field>
        </section>
      </div>
    </Dialog>
  );
}
