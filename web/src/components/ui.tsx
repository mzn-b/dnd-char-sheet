import { useEffect, useState, type ReactNode } from "react";
import type { ContentSource } from "../lib/types";

export function Modal({
  title, onClose, children, footer, wide,
}: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl ${wide ? "max-w-5xl" : "max-w-xl"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <h2 className="font-display text-lg text-accent-400">{title}</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Number input that commits on blur/enter so typing "-" or "" doesn't fight the state. */
export function NumberField({
  value, onChange, className = "field", min, max, ...rest
}: { value: number; onChange: (n: number) => void; className?: string; min?: number; max?: number } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"
>) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let n = Number(text);
    if (text.trim() === "" || Number.isNaN(n)) return setText(String(value));
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    if (n !== value) onChange(n);
    else setText(String(value));
  };
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      className={className}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TextField({
  value, onChange, className = "field", ...rest
}: { value: string; onChange: (s: string) => void; className?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"
>) {
  return <input {...rest} className={className} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function TextArea({
  value, onChange, rows = 4, placeholder, className = "field-boxed",
}: { value: string; onChange: (s: string) => void; rows?: number; placeholder?: string; className?: string }) {
  return (
    <textarea
      className={`${className} resize-y leading-relaxed`}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Section({ title, action, children, className = "" }: {
  title: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="label">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Clickable pips for slots, death saves, hit dice, limited-use features. */
export function Pips({
  max, used, onChange, color = "bg-accent-500", title,
}: { max: number; used: number; onChange: (used: number) => void; color?: string; title?: string }) {
  return (
    <div className="flex flex-wrap gap-1" title={title}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < used;
        return (
          <button
            key={i}
            type="button"
            aria-label={`${filled ? "Restore" : "Use"} ${i + 1}`}
            onClick={() => onChange(filled ? i : i + 1)}
            className={`h-4 w-4 rounded-full border transition ${filled ? `${color} border-transparent` : "border-ink-600 hover:border-ink-400"}`}
          />
        );
      })}
    </div>
  );
}

const SOURCE_STYLES: Record<ContentSource, string> = {
  srd: "border-sky-800 text-sky-300",
  open5e: "border-emerald-800 text-emerald-300",
  "5etools": "border-orange-800 text-orange-300",
  homebrew: "border-fuchsia-800 text-fuchsia-300",
};

export function SourceBadge({ source, label }: { source: ContentSource; label?: string }) {
  const text = source === "srd" ? "SRD" : source === "homebrew" ? "Homebrew" : label ?? source;
  return <span className={`chip max-w-[10rem] shrink-0 truncate ${SOURCE_STYLES[source]}`} title={label}>{text}</span>;
}

/** Tiny markdown subset: paragraphs, **bold**, *italic*, "- " bullets, and | tables | as preformatted text. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink-200">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => l.trim().startsWith("- ") || l.trim().startsWith("* "))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.trim().slice(2))}</li>)}
            </ul>
          );
        }
        if (lines[0].trim().startsWith("|")) {
          return <pre key={i} className="overflow-x-auto rounded bg-ink-850 p-2 text-xs">{b}</pre>;
        }
        if (/^#{1,6}\s/.test(b)) return <h4 key={i} className="font-semibold text-ink-200">{inline(b.replace(/^#+\s/, ""))}</h4>;
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i} className="text-ink-200">{part.slice(2, -2)}</strong>
    : part.startsWith("*") && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em>
    : part,
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-400">
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-600 border-t-accent-500" />
      {label}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
      <span className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-accent-500" : "bg-ink-700"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink-950 transition ${checked ? "left-4.5" : "left-0.5"}`} />
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
