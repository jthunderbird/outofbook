// The app shell: Fluent-style command bar (title bar, command row, nav pane)
// with the board docked right. Earlier layouts are archived in poc/archive/.
import { useState, type ComponentType, type ReactNode } from "react";
import { Menu, Search, X } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  short?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  disabled?: boolean;
  group: "Analyse" | "Play" | "Game";
}

export interface ShellProps {
  nav: NavItem[];
  active: string;
  onNav: (id: string) => void;
  title: string;
  subtitle?: ReactNode;
  actions: ReactNode; // account, load games, settings
  pickers: ReactNode; // the dark/light toggle
  toolbar?: ReactNode; // side filter + min games
  status?: ReactNode; // analysis progress
  hideHead?: boolean; // no title or status line (bot play: the board gets the height)
  main: ReactNode;
  board: ReactNode | null;
  onCommand: () => void;
}

const Brand = () => (
  <div className="flex items-center gap-2 font-display text-[1.02rem] font-bold tracking-tight">
    <span className="grid h-7 w-7 place-items-center rounded-ui text-[15px]" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
      ♞
    </span>
    <span>OutOfBook</span>
  </div>
);

function groups(nav: NavItem[]) {
  const out: [string, NavItem[]][] = [];
  for (const n of nav) {
    const g = out.find((x) => x[0] === n.group);
    if (g) g[1].push(n);
    else out.push([n.group, [n]]);
  }
  return out;
}

function NavList({ p }: { p: ShellProps }) {
  return (
    <>
      {groups(p.nav).map(([g, items]) => (
        <div key={g} className="flex flex-col gap-0.5">
          <div className="ui-label px-2 pt-3 pb-1">{g}</div>
          {items.map((n) => (
            <button key={n.id} className="ui-nav" data-active={p.active === n.id} aria-disabled={n.disabled} onClick={() => p.onNav(n.id)} data-testid={`nav-${n.id}`}>
              <n.icon size={16} className="shrink-0" />
              <span className="truncate">{n.label}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/** Below md: top bar + drawer. */
function MobileChrome({ p }: { p: ShellProps }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-30 flex h-13 items-center gap-2 border-b px-3 backdrop-blur-xl md:hidden" style={{ background: "color-mix(in oklab, var(--bg) 82%, transparent)" }}>
        <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setOpen(true)} aria-label="Menu">
          <Menu size={18} />
        </button>
        <Brand />
        <div className="flex-1" />
        <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={p.onCommand} aria-label="Search">
          <Search size={17} />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="ui-overlay" onClick={() => setOpen(false)} />
          <div className="ui-card absolute top-0 bottom-0 left-0 z-[51] flex w-[82vw] max-w-80 flex-col gap-2 overflow-auto rounded-none p-3" style={{ ["--card-bg" as string]: "var(--surface)" }}>
            <div className="flex items-center justify-between">
              <Brand />
              <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div onClick={() => setOpen(false)}>
              <NavList p={p} />
            </div>
            <div className="mt-2 flex flex-col gap-2">{p.pickers}</div>
            <div className="flex flex-wrap gap-2">{p.actions}</div>
          </div>
        </div>
      )}
    </>
  );
}

function PageHead({ p }: { p: ShellProps }) {
  if (p.hideHead) return p.toolbar ? <div className="mb-3 md:hidden">{p.toolbar}</div> : null;
  return (
    <div className="mb-4">
      <div className="mb-1 text-xs text-muted">Home › {p.title}</div>
      <h1 className="ui-h1 mb-1">{p.title}</h1>
      <div className="text-xs text-muted">{p.status}</div>
      {p.toolbar && <div className="mt-3 md:hidden">{p.toolbar}</div>}
    </div>
  );
}

// Room the board card needs besides the board itself: the two bars above the
// main area, its padding, the card padding and the two text lines under the board.
const CHROME = "14rem";

/** Content on the left, the board docked right at 560px (narrower on small screens, never taller than the window). */
function Body({ p }: { p: ShellProps }) {
  if (!p.board)
    return (
      <>
        <PageHead p={p} />
        <div className="min-w-0">{p.main}</div>
      </>
    );
  return (
    <div className="grid gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_min(560px,45%)]" style={{ ["--board-max" as string]: `calc(100dvh - ${CHROME})` }}>
      <div className="board-col min-w-0 lg:sticky lg:top-0 lg:order-last lg:self-start" data-testid="board-col">
        {p.board}
      </div>
      <div className="min-w-0">
        <PageHead p={p} />
        {p.main}
      </div>
    </div>
  );
}

export function Shell(p: ShellProps) {
  const [paneOpen, setPaneOpen] = useState(true);
  return (
    <div className="flex min-h-dvh flex-col md:h-dvh md:min-h-0 md:overflow-hidden">
      <MobileChrome p={p} />
      <div className="hidden h-11 shrink-0 items-center gap-3 px-3 md:flex" style={{ background: "color-mix(in oklab, var(--surface-2) 80%, transparent)" }}>
        <button className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" onClick={() => setPaneOpen((x) => !x)} aria-label="Toggle navigation">
          <Menu size={16} />
        </button>
        <Brand />
        <div className="flex flex-1 justify-center">
          <button className="ui-input flex w-full max-w-lg items-center gap-2 text-left text-muted" onClick={p.onCommand}>
            <Search size={14} /> <span className="flex-1 text-xs">Search openings, views, settings</span> <span className="ui-kbd">⌘K</span>
          </button>
        </div>
        {p.actions}
      </div>
      <div className="hidden min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-1.5 md:flex" style={{ background: "color-mix(in oklab, var(--surface) 80%, transparent)" }}>
        {p.toolbar}
        <div className="flex-1" />
        {p.pickers}
      </div>
      <div className="flex min-h-0 flex-1">
        {paneOpen && (
          <nav className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-auto border-r p-2 md:flex" style={{ background: "color-mix(in oklab, var(--surface) 70%, transparent)" }}>
            <NavList p={p} />
          </nav>
        )}
        <main className="min-w-0 flex-1 p-4 md:overflow-auto md:p-6" data-testid="main">
          <Body p={p} />
        </main>
      </div>
    </div>
  );
}
