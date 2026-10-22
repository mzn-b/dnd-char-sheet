import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BookInfo } from "../lib/api";
import { PHB } from "../lib/books";
import { Spinner } from "./ui";

const XGE = "Xanathar's Guide to Everything";
const TCE = "Tasha's Cauldron of Everything";

const DMG = "Dungeon Master's Guide (2014)";

/** "Core": the 2014 core books plus the supplements and setting books usually allowed at the table. */
export const CORE_BOOKS = [
  "Acquisitions Incorporated", "Astral Adventurer's Guide", DMG, "Eberron: Rising from the Last War",
  "Elemental Evil Player's Companion", "Explorer's Guide to Wildemount", "Fizban's Treasury of Dragons",
  "Guildmasters' Guide to Ravnica", "Mordenkainen Presents: Monsters of the Multiverse", "Mordenkainen's Tome of Foes",
  "Mythic Odysseys of Theros", PHB, "Sword Coast Adventurer's Guide", TCE, "Van Richten's Guide to Ravenloft",
  "Volo's Guide to Monsters", XGE,
];
/** "Vanilla": a minimal set around the 2014 Player's Handbook and Dungeon Master's Guide. */
const VANILLA = [DMG, "Fizban's Treasury of Dragons", "Mordenkainen Presents: Monsters of the Multiverse", PHB, "Sword Coast Adventurer's Guide", TCE];

const PRESETS: { label: string; books: string[]; title?: string }[] = [
  { label: "All books", books: [] },
  { label: "Core", books: CORE_BOOKS, title: CORE_BOOKS.join(", ") },
  { label: "Vanilla", books: VANILLA, title: VANILLA.join(", ") },
  { label: "PHB only", books: [PHB] },
  { label: "PHB + Xanathar's + Tasha's", books: [PHB, XGE, TCE] },
];

const GROUPS: { provider: BookInfo["provider"]; title: string }[] = [
  { provider: "5etools", title: "Official books & 5etools library" },
  { provider: "srd", title: "SRD" },
  { provider: "open5e", title: "Open5e (third-party, OGL)" },
  { provider: "homebrew", title: "Your homebrew (always included)" },
];

const PLURAL: Record<string, [string, string]> = {
  race: ["race", "races"], class: ["class", "classes"], subclass: ["subclass", "subclasses"], background: ["background", "backgrounds"],
  feat: ["feat", "feats"], spell: ["spell", "spells"], feature: ["class option", "class options"],
};
const summary = (b: BookInfo) =>
  Object.entries(b.counts).map(([t, n]) => `${n} ${(PLURAL[t] ?? [t, `${t}s`])[n === 1 ? 0 : 1]}`).join(", ");

/** Choose which books a character's options may come from. Empty selection = everything enabled. */
export function BookPicker({ value, onChange }: { value: string[]; onChange: (books: string[]) => void }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["books"],
    queryFn: api.books,
    staleTime: 60_000,
    // While 5etools downloads, check again every few seconds so its books appear on their own.
    refetchInterval: (q) => (q.state.data?.fivetools.enabled && !q.state.data.fivetools.loaded && !q.state.data.fivetools.error ? 4000 : false),
  });
  const [enabling, setEnabling] = useState(false);
  const enableFivetools = async () => {
    setEnabling(true);
    try {
      await api.setProviders({ "5etools": true });
      for (const k of ["providers", "content", "detail", "classRules", "books", "search", "5etools-status"]) qc.invalidateQueries({ queryKey: [k] });
    } finally {
      setEnabling(false);
    }
  };
  const ft = data?.fivetools;
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
            <button key={p.label} type="button" title={p.title} className={`rounded-lg px-3 py-1 ${active ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`} onClick={() => onChange(p.books)}>
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
      {ft && !ft.enabled && (
        <div className="rounded-lg border border-accent-600/60 bg-accent-500/5 p-3 text-sm">
          <b className="text-accent-400">The Player's Handbook, Xanathar's, Tasha's and the other official books come from 5etools, which is turned off.</b>
          <p className="mt-1 text-xs text-ink-400">Without it you only get the free SRD (a subset of the PHB) and Open5e's third-party books.</p>
          <button type="button" className="btn-primary mt-2" disabled={enabling} onClick={enableFivetools}>{enabling ? "Turning on…" : "Turn on 5etools"}</button>
        </div>
      )}
      {ft?.enabled && !ft.loaded && !ft.error && (
        <div className="text-xs text-ink-400"><Spinner label="Downloading 5etools data… the official books appear here when it's done (the first time can take a minute or two)." /></div>
      )}
      {ft?.enabled && ft.error && (
        <p className="text-xs text-blood-500">
          5etools couldn't be loaded, so the official books are missing: {ft.error}. The server needs to reach raw.githubusercontent.com.{" "}
          <button type="button" className="underline" onClick={async () => { await api.retryFivetools(); refetch(); }}>Retry</button>
        </p>
      )}
      {(() => {
        if (!missing.length || ft?.loaded === false) return null;
        const modern = missing.filter((m) => data?.excluded2024?.includes(m));
        const other = missing.filter((m) => !modern.includes(m));
        return (
          <>
            {modern.length > 0 && (
              <p className="text-xs text-accent-400">
                Not loaded because this app uses 2014 rules: {modern.join(", ")}.
                {modern.includes("Player's Handbook (2024)") && !selected.has(PHB) && " Without a PHB, add Player's Handbook (2014) for the core classes and races."}
              </p>
            )}
            {other.length > 0 && <p className="text-xs text-accent-400">Selected but not currently available: {other.join(", ")}.</p>}
          </>
        );
      })()}
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
