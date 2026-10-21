import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PRESETS, ROLE_LABEL, creatureFromDetail, crNumber, fitsPreset, wildShapeLimits, type Preset } from "../lib/extras";
import type { Character, Companion, ContentSummary } from "../lib/types";
import { StatBlock } from "./StatBlock";
import { Modal, Spinner } from "./ui";

const MAX_SHOWN = 200;
/** Official stat blocks first when names tie. */
const SOURCE_RANK: Record<ContentSummary["source"], number> = { "5etools": 0, srd: 1, homebrew: 2, open5e: 3 };

/** Bestiary browser with rule-based presets; adds the chosen creature with the preset's role. */
export function MonsterPicker({
  c, onClose, onAdd, preset: initialPreset, title = "Add a creature", lockPreset, addLabel,
}: {
  c: Character;
  onClose: () => void;
  onAdd: (p: Companion) => void;
  preset?: Preset;
  title?: string;
  /** Hide the other presets (used when a feature or spell decides what's allowed). */
  lockPreset?: boolean;
  addLabel?: string;
}) {
  const limits = wildShapeLimits(c);
  const [preset, setPreset] = useState<Preset>(initialPreset ?? (limits ? "wildshape" : "all"));
  const [q, setQ] = useState("");
  const [maxCr, setMaxCr] = useState<string>("");
  const [focused, setFocused] = useState<ContentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const all = useQuery({ queryKey: ["search", "monster"], queryFn: () => api.search("monster"), staleTime: 5 * 60_000 });
  const detail = useQuery({
    queryKey: ["detail", "monster", focused?.source, focused?.key],
    queryFn: () => api.detail("monster", focused!.source, focused!.key),
    enabled: !!focused,
    staleTime: Infinity,
  });
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cap = maxCr === "" ? Infinity : crNumber(maxCr);
    const rank = (m: ContentSummary) => { const n = m.name.toLowerCase(); return n === needle ? 0 : n.startsWith(needle) ? 1 : 2; };
    return (all.data ?? [])
      .filter((m) => (!needle || m.name.toLowerCase().includes(needle)) && (m.level ?? 0) <= cap && fitsPreset(c, preset, m))
      .sort((a, b) => (needle ? rank(a) - rank(b) : 0) || SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  }, [all.data, q, maxCr, preset, c]);
  const role = PRESETS.find((p) => p.id === preset)!.role;

  const add = async (m: ContentSummary) => {
    setBusy(true);
    try {
      const det = detail.data?.key === m.key && detail.data.source === m.source ? detail.data : await api.detail("monster", m.source, m.key);
      onAdd(creatureFromDetail(det, role === "other" ? "summon" : role));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <div className={`flex flex-wrap gap-1 ${lockPreset ? "hidden" : ""}`}>
          {PRESETS.map((p) => (
            <button key={p.id} className={`rounded-lg px-3 py-1 text-sm ${preset === p.id ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`} onClick={() => setPreset(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === "wildshape" && <p className="text-xs text-ink-400">{limits ? limits.label : "Not a druid yet: showing beasts up to CR 1."}</p>}
        {preset === "familiar" && <p className="text-xs text-ink-400">Find Familiar forms, plus imp, pseudodragon, quasit and sprite for Pact of the Chain.</p>}
        {preset === "steed" && <p className="text-xs text-ink-400">Find Steed (warhorse, pony, camel, elk, mastiff) and Find Greater Steed forms.</p>}
        {preset === "beastmaster" && <p className="text-xs text-ink-400">Ranger's Companion: a beast of CR 1/4 or lower, Medium or smaller.</p>}
        <div className="flex gap-2">
          <input className="field-boxed flex-1" placeholder="Search creatures…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <select className="field-boxed w-auto" value={maxCr} onChange={(e) => setMaxCr(e.target.value)} aria-label="Maximum challenge rating">
            <option value="">Any CR</option>
            {["0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "8", "10", "15", "20"].map((cr) => <option key={cr} value={cr}>CR ≤ {cr}</option>)}
          </select>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1.3fr]">
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-ink-800">
            {all.isLoading && <Spinner label="Loading the bestiary…" />}
            <ul>
              {matches.slice(0, MAX_SHOWN).map((m) => (
                <li key={`${m.source}:${m.key}`}>
                  <button
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-ink-850 ${focused?.key === m.key && focused.source === m.source ? "bg-ink-850 text-accent-400" : ""}`}
                    onClick={() => setFocused(m)}
                  >
                    <span className="flex-1">{m.name}</span>
                    <span className="text-xs text-ink-400">CR {m.cr}</span>
                    <span className="max-w-32 truncate text-[10px] text-ink-600">{m.sourceLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
            {matches.length > MAX_SHOWN && <p className="p-2 text-center text-xs text-ink-600">{matches.length - MAX_SHOWN} more — refine your search</p>}
            {all.data && matches.length === 0 && <p className="p-3 text-sm text-ink-600">No matching creatures.</p>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {!focused && <p className="text-sm text-ink-600">Pick a creature to see its stat block.</p>}
            {focused && detail.isLoading && <Spinner />}
            {focused && detail.data?.monster && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-xl">{detail.data.name}</h3>
                  <button className="btn-primary ml-auto" disabled={busy} onClick={() => add(focused)}>{addLabel ?? `Add as ${ROLE_LABEL[role === "other" ? "summon" : role]}`}</button>
                </div>
                <StatBlock m={detail.data.monster} name={detail.data.name} />
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
