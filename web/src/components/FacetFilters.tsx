import { useMemo, useState } from "react";
import {
  activeCount, deriveFacets, describeFilter, isActive, sortOptions, type FacetFilter, type FacetSpec, type FilterState,
} from "../lib/facets";
import type { ContentSummary, ContentType } from "../lib/types";

const SHOWN_OPTIONS = 14;

/**
 * Filters built from the values present in a result list: ranges for numbers (AC, cost, speed…),
 * Any/Yes/No for flags (concentration, attunement…), chips for values (school, damage type…).
 */
export function FacetFilters({
  items, type, state, onChange, sort, onSort,
}: {
  items: ContentSummary[];
  type: ContentType;
  state: FilterState;
  onChange: (s: FilterState) => void;
  sort: { key: string; desc: boolean };
  onSort: (s: { key: string; desc: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const specs = useMemo(() => deriveFacets(items, type), [items, type]);
  const n = activeCount(state);
  if (!specs.length) return null;
  const set = (key: string, f: FacetFilter | undefined) => {
    const next = { ...state };
    if (f && isActive(f)) next[key] = f;
    else delete next[key];
    onChange(next);
  };
  const sorts = sortOptions(specs, type);

  return (
    <div className="rounded-lg border border-ink-800">
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
        <button type="button" className={`chip ${n ? "border-accent-600 text-accent-400" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          ⚲ Filters{n ? ` (${n})` : ""} {open ? "▴" : "▾"}
        </button>
        {specs.map((spec) => isActive(state[spec.key]) && (
          <button key={spec.key} type="button" className="chip border-accent-600/60 text-[11px] text-accent-400" title="Remove this filter" onClick={() => set(spec.key, undefined)}>
            {describeFilter(spec, state[spec.key])} ✕
          </button>
        ))}
        {n > 0 && <button type="button" className="text-[11px] text-ink-400 underline" onClick={() => onChange({})}>clear</button>}
        <label className="ml-auto flex items-center gap-1 text-[11px] text-ink-400">
          Sort
          <select className="field-boxed w-auto py-0 text-[11px]" value={sort.key} onChange={(e) => onSort({ ...sort, key: e.target.value })} aria-label="Sort by">
            <option value="default">Default</option>
            {sorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button type="button" className="px-1" title={sort.desc ? "Descending" : "Ascending"} onClick={() => onSort({ ...sort, desc: !sort.desc })}>{sort.desc ? "↓" : "↑"}</button>
        </label>
      </div>
      {open && (
        <div className="max-h-[35vh] space-y-3 overflow-y-auto border-t border-ink-800 p-2">
          {specs.map((spec) => <FacetControl key={spec.key} spec={spec} value={state[spec.key]} onChange={(f) => set(spec.key, f)} />)}
        </div>
      )}
    </div>
  );
}

function FacetControl({ spec, value, onChange }: { spec: FacetSpec; value?: FacetFilter; onChange: (f: FacetFilter | undefined) => void }) {
  const [more, setMore] = useState(false);
  const label = <span className="label">{spec.label}{spec.unit && spec.unit !== "d" ? ` (${spec.unit})` : ""}</span>;

  if (spec.kind === "bool") {
    const v = value?.bool;
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">{label}</span>
        {([[undefined, "Any"], [true, "Yes"], [false, "No"]] as const).map(([b, text]) => (
          <button key={text} type="button" className={`rounded px-2 py-0.5 text-xs ${v === b ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`} onClick={() => onChange(b === undefined ? undefined : { bool: b })}>
            {text}
          </button>
        ))}
      </div>
    );
  }

  if (spec.kind === "range") {
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
    return (
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">{label}</span>
        <input className="field-boxed w-20 py-0.5 text-center text-xs" inputMode="decimal" placeholder={`min ${spec.min}`} aria-label={`${spec.label} minimum`}
          value={value?.min ?? ""} onChange={(e) => onChange({ ...value, min: num(e.target.value) })} />
        <span className="text-ink-600">–</span>
        <input className="field-boxed w-20 py-0.5 text-center text-xs" inputMode="decimal" placeholder={`max ${spec.max}`} aria-label={`${spec.label} maximum`}
          value={value?.max ?? ""} onChange={(e) => onChange({ ...value, max: num(e.target.value) })} />
      </div>
    );
  }

  const picked = new Set(value?.values ?? []);
  const options = spec.options ?? [];
  const shown = more ? options : options.slice(0, SHOWN_OPTIONS);
  const toggle = (v: string) => {
    const values = picked.has(v) ? [...picked].filter((x) => x !== v) : [...picked, v];
    onChange({ ...value, values });
  };
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        {label}
        {spec.kind === "multi" && picked.size > 1 && (
          <button type="button" className="text-[10px] text-ink-400 underline" title="Match any of the picked values, or all of them" onClick={() => onChange({ ...value, all: !value?.all })}>
            {value?.all ? "all of" : "any of"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((o) => (
          <button key={o.value} type="button" onClick={() => toggle(o.value)}
            className={`rounded-full border px-2 py-0 text-[11px] ${picked.has(o.value) ? "border-accent-500 bg-accent-500/15 text-accent-400" : "border-ink-700 text-ink-400 hover:text-ink-200"}`}>
            {o.value} <span className="text-ink-600">{o.count}</span>
          </button>
        ))}
        {options.length > SHOWN_OPTIONS && (
          <button type="button" className="text-[11px] text-ink-400 underline" onClick={() => setMore(!more)}>{more ? "fewer" : `+${options.length - SHOWN_OPTIONS} more`}</button>
        )}
      </div>
    </div>
  );
}
