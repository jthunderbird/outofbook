// "Explain this move" via Claude, called straight from the browser with the
// user's own API key (kept in this browser only). The engine already knows the
// numbers; Claude narrates the why. Prompt shape follows the user's Chesskit fork.
import Anthropic from "@anthropic-ai/sdk";

export interface ExplainInput {
  fen: string; // position before the move
  moveSan: string;
  mover: "w" | "b";
  verdict?: string;
  evalBefore?: string;
  evalAfter?: string;
  bestSan?: string;
  bestLineSan?: string[];
  afterLineSan?: string[];
  opening?: string;
  timesPlayed?: number;
  book?: string; // in / left / exhausted / after
}

const buildPrompt = (p: ExplainInput) => {
  const side = p.mover === "w" ? "White" : "Black";
  const lines = [`Position (FEN) before the move: ${p.fen}`, `Move played by ${side}: ${p.moveSan}`];
  if (p.opening) lines.push(`Opening: ${p.opening}`);
  if (p.book === "left") lines.push("This move left the named opening lines.");
  if (p.book === "in") lines.push("This move is part of a named opening line.");
  if (p.timesPlayed && p.timesPlayed > 1) lines.push(`The player has played this exact move in this position ${p.timesPlayed} times.`);
  if (p.verdict) lines.push(`Engine classification: ${p.verdict}`);
  if (p.evalBefore) lines.push(`Engine eval before (White's perspective, positive favors White): ${p.evalBefore}`);
  if (p.evalAfter) lines.push(`Engine eval after (White's perspective): ${p.evalAfter}`);
  if (p.bestSan) lines.push(`Engine's best move instead: ${p.bestSan}`);
  if (p.bestLineSan?.length) lines.push(`Engine's best continuation: ${p.bestLineSan.join(" ")}`);
  if (p.afterLineSan?.length) lines.push(`Engine's top line after the move played: ${p.afterLineSan.join(" ")}`);
  lines.push(
    "",
    "Explain in at most three sentences, for a club player, why this move deserves that classification and what idea the better move carries. " +
      "Name the concrete tactical or positional reason; do not restate the eval numbers.",
  );
  return lines.join("\n");
};

export async function explainMove(apiKey: string, input: ExplainInput): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  if (res.stop_reason === "refusal") return "Claude declined to answer this one.";
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
}

/** Free-form question about the user's repertoire (chat layout), answered from a compact summary. */
export async function askRepertoire(apiKey: string, question: string, summary: string): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 3000,
    output_config: { effort: "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You are a chess coach inside an opening-repertoire app. Answer the player's question from the repertoire summary given, " +
      "in at most five short sentences or a short list. Be concrete: name moves and openings from the summary. Plain text, no headers.",
    messages: [{ role: "user", content: `Repertoire summary:\n${summary}\n\nQuestion: ${question}` }],
  });
  if (res.stop_reason === "refusal") return "Claude declined to answer this one.";
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n")
    .trim();
}
