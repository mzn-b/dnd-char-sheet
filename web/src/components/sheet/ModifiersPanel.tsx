import { useState } from "react";
import { uid } from "../../lib/defaults";
import { MODIFIER_TARGETS, allModifiers, targetLabel } from "../../lib/modifiers";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Section } from "../ui";

const KIND_LABEL = { item: "Item", feature: "Feature", custom: "Custom" } as const;

/** Every automatic bonus on the sheet, with switches, plus the player's own custom modifiers. */
export function ModifiersPanel({ c, update }: { c: Character; update: Update }) {
  const [adding, setAdding] = useState<{ label: string; target: string; value: number } | null>(null);
  const mods = allModifiers(c);
  const disabled = new Set(c.disabledModifiers ?? []);
  const toggle = (id: string) =>
    update((d) => {
      const list = new Set(d.disabledModifiers ?? []);
      if (list.has(id)) list.delete(id);
      else list.add(id);
      d.disabledModifiers = [...list];
    });

  return (
    <Section
      title="Modifiers"
      action={<button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setAdding({ label: "", target: "ac", value: 1 })}>+ Custom modifier</button>}
    >
      {mods.length === 0 && !adding && (
        <p className="text-sm text-ink-600">
          Bonuses from magic items (equipped / attuned), feats like Tough, Alert, Mobile and Observant, and features like Unarmored Movement or the Archery style appear here and are applied automatically.
        </p>
      )}
      <ul className="space-y-1">
        {mods.map((m) => {
          const off = disabled.has(m.id);
          return (
            <li key={m.id} className={`flex items-center gap-2 text-sm ${off ? "text-ink-600" : ""}`}>
              <input type="checkbox" className="accent-accent-500" checked={!off} onChange={() => toggle(m.id)} aria-label={`Apply ${m.source}`} />
              <span className="chip text-[10px]">{KIND_LABEL[m.kind]}</span>
              <span className={`flex-1 ${off ? "line-through" : ""}`}>
                <b className="font-medium">{m.source}</b>: {targetLabel(m.target)}
                {!["halfProf", "halfProfPhysical", "medArmorDex"].includes(m.target) && <> {m.target.startsWith("abilitySet:") ? m.value : `${m.value >= 0 ? "+" : ""}${m.value}`}</>}
                {m.note && <span className="text-xs text-ink-400"> ({m.note})</span>}
              </span>
              {m.kind === "custom" && (
                <button
                  className="btn-ghost px-1.5 py-0 text-xs hover:text-blood-500"
                  title="Remove"
                  onClick={() => update((d) => void (d.customModifiers = (d.customModifiers ?? []).filter((x) => `custom:${x.id}` !== m.id)))}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {adding && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            update((d) => void (d.customModifiers = [...(d.customModifiers ?? []), { id: uid(), label: adding.label.trim() || "Custom", target: adding.target, value: adding.value }]));
            setAdding(null);
          }}
        >
          <input className="field-boxed w-48" placeholder="Source (e.g. Blessing of Protection)" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} autoFocus />
          <select className="field-boxed w-auto" value={adding.target} onChange={(e) => setAdding({ ...adding, target: e.target.value })}>
            {MODIFIER_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <NumberField className="field-boxed w-16 text-center" value={adding.value} onChange={(n) => setAdding({ ...adding, value: n })} />
          <button type="button" className="btn ml-auto" onClick={() => setAdding(null)}>Cancel</button>
          <button className="btn-primary">Add</button>
        </form>
      )}
    </Section>
  );
}
