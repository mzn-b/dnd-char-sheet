import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type BookInfo } from "../lib/api";
import { PHB } from "../lib/books";
import { Spinner } from "./ui";

const XGE = "Xanathar's Guide to Everything";
const TCE = "Tasha's Cauldron of Everything";

const PRESETS: { label: string; books: string[] }[] = [
  { label: "All books", books: [] },
  { label: "PHB only", books: [PHB] },
  { label: "PHB + Xanathar's + Tasha's", books: [PHB, XGE, TCE] },
];

const GROUPS: { provider: BookInfo["provider"]; title: string }[] = [
  { provider: "5etools", title: "Official books & 5etools library" },
  { provider: "srd", title: "SRD" },
  { provider: "open5e", title: "Open5e (third-party, OGL)" },
  { provider: "homebrew", title: "Your homebrew (always included)" },
];

const summary = (b: BookInfo) =>
  Object.entries(b.counts).map(([t, n]) => `${n} ${t === "class" ? "classes" : t === "feature" ? "options" : `${t}s`}`).join(", ");

/** Choose which books a character's options may come from. Empty selection = everything enabled. */
export function BookPicker({ value, onChange }: { value: string[]; onChange: (books: string[]) => void }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["books"], queryFn: api.books, staleTime: 5 * 60_000 });
  const [q, setQ] = useState("");
  const selected = new Set(value);
  const toggle = (label: string) => onChange(selected.has(label) ? value.filter((b) => b !== label) : [...value, label]);
  const books = useMemo(() => (data?.books ?? []).filter((b) => !q || b.label.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const missing = value.filter((v) => data && !data.books.some((b) => b.label === v));

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((p) => {
          const active = p.books.length === value.length && p.books.every((b) => selected.has(b));
          return (
            <button key={p.label} type="button" className={`rounded-lg px-3 py-1 ${active ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`} onClick={() => onChange(p.books)}>
              {p.label}
            </button>
          );
        })}
        <input className="field-boxed ml-auto w-48 py-1" placeholder="Find a book…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-xs text-ink-400">
        {value.length === 0 ? "Every enabled book is available." : `${value.length} book${value.length > 1 ? "s" : ""} selected.`} Applies to races, classes, subclasses, backgrounds, feats, spells and class options. Items and creatures are never filtered. Choosing the PHB includes the SRD.
      </p>
      {isLoading && <Spinner label="Collecting books from your sources…" />}
      {data?.warnings.map((w) => (
        <p key={w} className="text-xs text-accent-400">⚠ {w} <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>
      ))}
      {missing.length > 0 && <p className="text-xs text-accent-400">Selected but not currently available: {missing.join(", ")} (is its source turned on?)</p>}
      <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-ink-800 p-2">
        {GROUPS.map((g) => {
          const list = books.filter((b) => b.provider === g.provider);
          if (!list.length) return null;
          return (
            <div key={g.provider}>
              <h4 className="label mb-1">{g.title}</h4>
              <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {list.map((b) => (
                  <li key={b.label}>
                    <label className={`flex cursor-pointer items-start gap-2 ${g.provider === "homebrew" ? "opacity-60" : ""}`} title={summary(b)}>
                      <input type="checkbox" className="mt-1 accent-accent-500" disabled={g.provider === "homebrew"} checked={g.provider === "homebrew" || selected.has(b.label)} onChange={() => toggle(b.label)} />
                      <span>
                        {b.label}
                        <span className="block text-[10px] text-ink-600">{summary(b)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
