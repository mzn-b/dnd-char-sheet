import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { roll as rollDice, type RollKind, type RollMode, type RollResult } from "../lib/dice";

interface RollApi {
  roll: (expression: string, opts?: { label?: string; kind?: RollKind; mode?: RollMode; critical?: boolean }) => RollResult;
  mode: RollMode;
  setMode: (m: RollMode) => void;
  log: RollResult[];
  clear: () => void;
}

const RollContext = createContext<RollApi | null>(null);
const STORAGE_KEY = "dice-log";

export function RollProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<RollMode>("normal");
  const [log, setLog] = useState<RollResult[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log.slice(0, 50)));
    } catch {
      /* storage unavailable */
    }
  }, [log]);

  const roll = useCallback<RollApi["roll"]>(
    (expression, opts = {}) => {
      const usesD20 = /(^|[^\d])1?d20/i.test(expression);
      const result = rollDice(expression, { ...opts, mode: usesD20 ? opts.mode ?? mode : "normal" });
      setLog((l) => [result, ...l].slice(0, 50));
      // Advantage/disadvantage applies to one roll, like the table rule.
      if (usesD20 && !opts.mode) setMode("normal");
      return result;
    },
    [mode],
  );

  return <RollContext.Provider value={{ roll, mode, setMode, log, clear: () => setLog([]) }}>{children}</RollContext.Provider>;
}

export function useRoll() {
  const ctx = useContext(RollContext);
  if (!ctx) throw new Error("useRoll needs <RollProvider>");
  return ctx;
}

/**
 * Inline roll trigger. Click rolls with the tray's mode; Shift-click = advantage,
 * Ctrl/⌘-click = disadvantage.
 */
export function RollButton({
  expression, label, kind = "check", children, className = "", title, critical,
}: {
  expression: string;
  label: string;
  kind?: RollKind;
  children: ReactNode;
  className?: string;
  title?: string;
  critical?: boolean;
}) {
  const { roll } = useRoll();
  return (
    <button
      type="button"
      title={title ?? `Roll ${label} (${expression}) · Shift: advantage · Ctrl: disadvantage`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode: RollMode | undefined = e.shiftKey ? "advantage" : e.ctrlKey || e.metaKey ? "disadvantage" : undefined;
        roll(expression, { label, kind, mode, critical });
      }}
      className={`rounded px-1 transition hover:bg-accent-500/15 hover:text-accent-400 ${className}`}
    >
      {children}
    </button>
  );
}

const KIND_COLOR: Record<RollKind, string> = {
  check: "text-ink-200", save: "text-sky-300", attack: "text-accent-400", damage: "text-blood-500", heal: "text-emerald-400", other: "text-ink-200",
};

export function RollLine({ r, compact }: { r: RollResult; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "border-b border-ink-800 py-2 last:border-0"}`}>
      <div className={`w-12 text-center font-display text-2xl ${r.crit ? "text-emerald-400" : r.fumble ? "text-blood-500" : KIND_COLOR[r.kind]}`}>{r.total}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          {r.label}
          {r.mode !== "normal" && <span className="ml-1 text-xs text-ink-400">({r.mode === "advantage" ? "adv" : "dis"})</span>}
          {r.crit && <span className="ml-1 text-xs text-emerald-400">CRIT!</span>}
          {r.fumble && <span className="ml-1 text-xs text-blood-500">nat 1</span>}
        </div>
        <div className="truncate text-xs text-ink-400">
          {r.expression} ·{" "}
          {r.dice.map((d, i) => (
            <span key={i} className={d.dropped ? "line-through opacity-50" : ""}>
              {d.value}{i < r.dice.length - 1 ? ", " : ""}
            </span>
          ))}
          {r.modifier ? ` ${r.modifier > 0 ? "+" : ""}${r.modifier}` : ""}
        </div>
      </div>
    </div>
  );
}

/** Floating dice tray: latest result toast, roll log, custom expressions and adv/dis toggle. */
export function DiceTray() {
  const { log, roll, mode, setMode, clear } = useRoll();
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");
  const [toast, setToast] = useState<RollResult | null>(null);
  useEffect(() => {
    if (!log[0] || Date.now() - log[0].at > 1500) return;
    setToast(log[0]);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [log]);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 print:hidden">
      {toast && !open && (
        <div className="w-72 rounded-xl border border-ink-700 bg-ink-900/95 px-3 py-2 shadow-2xl backdrop-blur">
          <RollLine r={toast} compact />
        </div>
      )}
      {open && (
        <div className="w-80 rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink-800 px-3 py-2">
            <span className="label">Dice</span>
            <div className="flex gap-1 text-xs">
              {(["disadvantage", "normal", "advantage"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`rounded px-2 py-0.5 ${mode === m ? "bg-accent-500 text-ink-950" : "text-ink-400 hover:text-ink-200"}`}>
                  {m === "normal" ? "Normal" : m === "advantage" ? "Adv" : "Dis"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 px-3 pt-3">
            {[4, 6, 8, 10, 12, 20, 100].map((n) => (
              <button key={n} className="btn px-2 py-1 text-xs" onClick={() => roll(`1d${n}`, { label: `d${n}` })}>d{n}</button>
            ))}
          </div>
          <form className="flex gap-2 px-3 py-2" onSubmit={(e) => { e.preventDefault(); if (expr.trim()) roll(expr.trim(), { label: expr.trim() }); }}>
            <input className="field-boxed text-sm" placeholder="e.g. 4d6+2" value={expr} onChange={(e) => setExpr(e.target.value)} />
            <button className="btn-primary px-3">Roll</button>
          </form>
          <div className="max-h-80 overflow-y-auto px-3">
            {log.length === 0 && <p className="py-4 text-center text-sm text-ink-600">Click any bonus on the sheet to roll it.</p>}
            {log.map((r) => <RollLine key={r.id} r={r} />)}
          </div>
          <div className="flex justify-between border-t border-ink-800 px-3 py-2 text-xs text-ink-600">
            <span>Shift-click: adv · Ctrl-click: dis</span>
            <button className="hover:text-ink-200" onClick={clear}>Clear</button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className={`flex h-12 w-12 items-center justify-center rounded-full border text-2xl shadow-xl transition ${open ? "border-accent-500 bg-accent-500 text-ink-950" : "border-ink-700 bg-ink-850 hover:border-accent-500"}`}
        title="Dice tray"
      >
        🎲
      </button>
      {mode !== "normal" && !open && <span className="chip border-accent-600 bg-ink-900 text-accent-400">next roll: {mode}</span>}
    </div>
  );
}
