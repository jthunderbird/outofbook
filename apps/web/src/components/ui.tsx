// Small component kit (shadcn-style: Radix primitives + utility classes). The
// look of every piece comes from the ui-* classes in styles.css, which each
// design style restyles; components here only carry structure.
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Dialog as D, Switch as S, Tooltip as T } from "radix-ui";
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export const cx = clsx;

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
};
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = "secondary", size = "md", icon, className, ...p }, ref) {
  return <button ref={ref} className={cx("ui-btn", `ui-btn-${variant}`, size !== "md" && `ui-btn-${size}`, icon && "ui-btn-icon", className)} {...p} />;
});

// React 19: `ref` is an ordinary prop, passed on to the div with the rest.
export function Card({ className, children, pad = true, ...p }: { className?: string; children: ReactNode; pad?: boolean; ref?: React.Ref<HTMLDivElement> } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("ui-card", pad && "ui-pad", className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="ui-h2">{title}</div>
        {sub && <div className="mt-0.5 text-[0.82rem] text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx("ui-input", className)} {...p} />;
});

export function Select({ className, options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: [string, string][] }) {
  return (
    <select className={cx("ui-input", className)} {...p}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Labelled form field. */
export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cx("flex min-w-0 flex-col gap-1", className)}>
      <span className="ui-label">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 select-none">
      <S.Root className="ui-switch mt-0.5" checked={checked} onCheckedChange={onChange}>
        <S.Thumb />
      </S.Root>
      {label && (
        <span className="text-sm">
          {label}
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function Seg<V extends string>({ value, onChange, options, className }: { value: V; onChange: (v: V) => void; options: [V, ReactNode][]; className?: string }) {
  return (
    <div className={cx("ui-seg", className)} role="radiogroup">
      {options.map(([v, l]) => (
        // aria-label: inside a Field's <label>, a button would otherwise be named by the whole label text.
        <button key={v} type="button" role="radio" aria-checked={v === value} aria-label={typeof l === "string" ? l : undefined} data-on={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  neutral: ["var(--muted)", "color-mix(in oklab, var(--fg) 8%, transparent)"],
  accent: ["var(--accent)", "color-mix(in oklab, var(--accent) 15%, transparent)"],
  good: ["var(--good)", "color-mix(in oklab, var(--good) 15%, transparent)"],
  warn: ["var(--warn)", "color-mix(in oklab, var(--warn) 16%, transparent)"],
  bad: ["var(--bad)", "color-mix(in oklab, var(--bad) 15%, transparent)"],
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className, style, title }: { tone?: Tone; children: ReactNode; className?: string; style?: React.CSSProperties; title?: string }) {
  const [fg, bg] = TONES[tone];
  return (
    <span className={cx("ui-badge", className)} style={{ color: fg, background: bg, ...style }} title={title}>
      {children}
    </span>
  );
}

export function Progress({ value, className }: { value?: number; className?: string }) {
  return (
    <div className={cx("ui-progress", className)} data-indeterminate={value === undefined}>
      <div style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}

const ALERT = { info: [Info, "accent"], good: [CheckCircle2, "good"], warn: [AlertTriangle, "warn"], bad: [XCircle, "bad"] } as const;
export function Alert({ tone = "info", children, action, onClose, className }: { tone?: keyof typeof ALERT; children: ReactNode; action?: ReactNode; onClose?: () => void; className?: string }) {
  const [Icon, t] = ALERT[tone];
  const c = `var(--${t})`;
  return (
    <div className={cx("ui-alert", className)} style={{ borderColor: `color-mix(in oklab, ${c} 35%, transparent)`, background: `color-mix(in oklab, ${c} 10%, transparent)` }}>
      <Icon size={17} style={{ color: c, flexShrink: 0, marginTop: 1 }} />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
      {onClose && (
        <button className="opacity-60 hover:opacity-100" onClick={onClose} aria-label="Dismiss">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  if (!content) return <>{children}</>;
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-[60] max-w-xs rounded-md bg-fg px-2.5 py-1.5 text-xs text-bg shadow-lg">
            {content}
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}

export function Dialog({ open, onClose, title, children, width = 640, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  return (
    <D.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <D.Portal>
        <D.Overlay className="ui-overlay" />
        <D.Content className="ui-card ui-dialog" style={{ maxWidth: width }} aria-describedby={undefined}>
          <div className="flex items-center gap-3 border-b px-5 py-3.5" style={{ borderColor: "var(--border)" }}>
            <D.Title className="ui-h2 flex-1">{title}</D.Title>
            <D.Close className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm" aria-label="Close">
              <X size={16} />
            </D.Close>
          </div>
          <div className="p-5">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
              {footer}
            </div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Small stat block for overview cards. */
export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <div className="ui-label">{label}</div>
      <div className="num mt-1 text-2xl font-semibold" style={tone ? { color: `var(--${tone === "neutral" ? "fg" : tone})` } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <div className="ui-h2">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Click-to-reveal disclosure. */
export function useToggle(init = false) {
  const [on, set] = useState(init);
  return [on, () => set((x) => !x), set] as const;
}
