import type { RuleOptions } from "../lib/types";
import { Toggle } from "./ui";

/** Optional-rule switches shared by the character creator and the sheet. */
export function RuleOptionsEditor({ value, onChange }: { value: RuleOptions; onChange: (v: RuleOptions) => void }) {
  const set = (patch: Partial<RuleOptions>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 text-sm">
      <Toggle
        checked={!!value.customOrigin}
        onChange={(b) => set({ customOrigin: b })}
        label={<span><b>Customizing Your Origin</b> <span className="text-ink-400">(Tasha's) — move racial ability increases to any abilities</span></span>}
      />
      <Toggle
        checked={value.optionalClassFeatures !== false}
        onChange={(b) => set({ optionalClassFeatures: b })}
        label={<span><b>Optional class features</b> <span className="text-ink-400">(Tasha's) — Martial Versatility, Primal Awareness, Cantrip Versatility…</span></span>}
      />
      <Toggle
        checked={value.feats !== false}
        onChange={(b) => set({ feats: b })}
        label={<span><b>Feats</b> <span className="text-ink-400">— offered instead of Ability Score Improvements</span></span>}
      />
      <Toggle
        checked={value.strictMulticlass !== false}
        onChange={(b) => set({ strictMulticlass: b })}
        label={<span><b>Multiclass prerequisites</b> <span className="text-ink-400">— block multiclassing without the required scores</span></span>}
      />
      <label className="flex flex-wrap items-center gap-2">
        <b>Encumbrance</b>
        <select className="field-boxed w-auto" value={value.encumbrance ?? "standard"} onChange={(e) => set({ encumbrance: e.target.value as RuleOptions["encumbrance"] })}>
          <option value="standard">Carrying capacity (Str × 15)</option>
          <option value="variant">Variant: encumbered at Str × 5, heavily at Str × 10</option>
          <option value="off">Don't track</option>
        </select>
      </label>
      <div className="space-y-2 rounded-lg border border-accent-700/40 p-2">
        <div className="label text-accent-400">Homebrew (not in the rules as written)</div>
        <Toggle
          checked={!!value.toolArcaneFocus}
          onChange={(b) => set({ toolArcaneFocus: b })}
          label={<span><b>Tools as an Enhanced Arcane Focus</b> <span className="text-ink-400">— an artificer can infuse the thieves' tools or artisan's tools they cast through (RAW: rod, staff or wand only)</span></span>}
        />
      </div>
      <label className="flex flex-wrap items-center gap-2">
        <b>Hit points at level-up</b>
        <select className="field-boxed w-auto" value={value.hpMethod ?? "choose"} onChange={(e) => set({ hpMethod: e.target.value as RuleOptions["hpMethod"] })}>
          <option value="choose">Player chooses average or roll</option>
          <option value="average">Always take the average</option>
          <option value="roll">Always roll</option>
        </select>
      </label>
    </div>
  );
}
