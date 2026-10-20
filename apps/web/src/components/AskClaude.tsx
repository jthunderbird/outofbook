import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { explainMove, type ExplainInput } from "../lib/claude";
import { loadSettings } from "../lib/settings";
import { Alert, Button } from "./ui";

/** "Ask Claude" button that explains one move; needs an Anthropic API key in Settings. */
export function AskClaude({ input, disabled }: { input: () => ExplainInput; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = loadSettings().claudeKey;
  const ask = async () => {
    setBusy(true);
    setErr(null);
    try {
      setText(await explainMove(key, input()));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="ghost" onClick={ask} disabled={!key || busy || disabled} title={key ? "Explain this move" : "Add an Anthropic API key in Settings"}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Ask Claude
      </Button>
      {text && (
        <div
          className="mt-1.5 max-w-sm rounded-ui border p-2.5 text-[0.82rem] leading-relaxed"
          style={{ borderColor: "color-mix(in oklab, var(--accent) 35%, transparent)", background: "color-mix(in oklab, var(--accent) 7%, transparent)" }}
        >
          {text}
        </div>
      )}
      {err && (
        <Alert tone="bad" className="mt-1.5 max-w-sm">
          {err}
        </Alert>
      )}
    </div>
  );
}
