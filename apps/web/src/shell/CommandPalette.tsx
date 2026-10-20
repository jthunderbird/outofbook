import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Moon, Search, Sparkles, Sun } from "lucide-react";
import { MODES, useDesign } from "../design/design";
import type { RepertoireModel, Side } from "@outofbook/core/types";
import type { NavItem } from "./Shells";

export function CommandPalette({
  open,
  setOpen,
  nav,
  onNav,
  model,
  onLine,
  onAsk,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  nav: NavItem[];
  onNav: (id: string) => void;
  model: RepertoireModel | null;
  onLine: (color: Side, key: string) => void;
  onAsk: (q: string) => void;
}) {
  const { setDesign } = useDesign();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, setOpen]);

  const lines = useMemo(() => {
    if (!model) return [];
    return (["w", "b"] as Side[]).flatMap((c) =>
      Object.values(model.graphs[c])
        .filter((n) => n.book && n.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 150)
        .map((n) => ({ c, key: n.key, label: `${n.book!.eco} ${n.book!.name}`, count: n.count })),
    );
  }, [model]);

  const run = (f: () => void) => {
    f();
    setOpen(false);
  };
  const item = "flex cursor-pointer items-center gap-2.5 rounded-ui px-3 py-2 text-sm data-[selected=true]:bg-hover";
  const group =
    "px-1 py-1 [&_[cmdk-group-heading]]:text-[0.7rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5";

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="ui-overlay" />
        <D.Content
          className="ui-card fixed top-[12vh] left-1/2 z-[51] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden"
          style={{ ["--card-bg" as string]: "var(--surface)" }}
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">Command palette</D.Title>
          <Command loop>
            <div className="flex items-center gap-2 border-b px-4" style={{ borderColor: "var(--border)" }}>
              <Search size={16} className="text-muted" />
              <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Go to a view, find an opening, ask a question…" className="h-12 flex-1 bg-transparent text-[0.95rem] outline-none" />
            </div>
            <Command.List className="max-h-[60vh] overflow-auto p-1">
              <Command.Empty className="p-6 text-center text-sm text-muted">Nothing found.</Command.Empty>
              {q.trim().length > 3 && (
                <Command.Group heading="Ask" className={group} forceMount>
                  <Command.Item forceMount value={`ask ${q}`} className={item} onSelect={() => run(() => onAsk(q.trim()))} data-testid="ask-item">
                    <Sparkles size={16} style={{ color: "var(--accent)" }} /> <span className="truncate">Ask about your repertoire: “{q.trim()}”</span>
                  </Command.Item>
                </Command.Group>
              )}
              <Command.Group heading="Go to" className={group}>
                {nav
                  .filter((n) => !n.disabled)
                  .map((n) => (
                    <Command.Item key={n.id} value={`go ${n.label}`} className={item} onSelect={() => run(() => onNav(n.id))}>
                      <n.icon size={16} className="text-muted" /> {n.label}
                    </Command.Item>
                  ))}
              </Command.Group>
              {lines.length > 0 && (
                <Command.Group heading="Your openings" className={group}>
                  {lines.map((l) => (
                    <Command.Item key={l.c + l.key} value={`${l.label} ${l.c === "w" ? "white" : "black"}`} className={item} onSelect={() => run(() => onLine(l.c, l.key))}>
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: l.c === "w" ? "#f4f4f4" : "#222", outline: "1px solid var(--border)" }} />
                      <span className="flex-1 truncate">{l.label}</span>
                      <span className="num text-xs text-muted">{l.count}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Theme" className={group}>
                {MODES.map(([id, label]) => (
                  <Command.Item key={id} value={`theme ${label}`} className={item} onSelect={() => run(() => setDesign({ mode: id }))}>
                    {id === "dark" ? <Moon size={16} className="text-muted" /> : <Sun size={16} className="text-muted" />} {label}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
