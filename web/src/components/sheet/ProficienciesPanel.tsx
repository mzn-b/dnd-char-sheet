import { useState } from "react";
import { PROF_CATEGORIES, PROF_REPOSITORY, parseProficiencies, profKey, removeProficiencyItem, type ProfCategory } from "../../lib/proficiencies";
import { addProficiencyLine } from "../../lib/apply";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { Section, TextArea } from "../ui";

/**
 * Armor, weapon, tool and language proficiencies as chips per category, each with an Add picker (from the
 * usual values, or typed in). Anything that isn't "Category: …" stays editable as free text below.
 */
export function ProficienciesPanel({ c, update }: { c: Character; update: Update }) {
  const { byCategory, other } = parseProficiencies(c.proficienciesAndLanguages);
  const [adding, setAdding] = useState<ProfCategory | null>(null);
  const add = (cat: ProfCategory, item: string) => update((d) => addProficiencyLine(d, `${cat}: ${item.trim()}`));
  const remove = (cat: ProfCategory, item: string) => update((d) => void (d.proficienciesAndLanguages = removeProficiencyItem(d.proficienciesAndLanguages, cat, item)));
  const setOther = (text: string) =>
    update((d) => {
      const kept = d.proficienciesAndLanguages.split("\n").filter((l) => !parseProficiencies(l).other.length);
      d.proficienciesAndLanguages = [...kept, ...text.split("\n")].filter((l) => l.trim()).join("\n");
    });

  return (
    <Section title="Other Proficiencies & Languages">
      <div className="space-y-3">
        {PROF_CATEGORIES.map((cat) => (
          <div key={cat}>
            <div className="mb-1 flex items-center justify-between">
              <span className="label">{cat}</span>
              <button className="btn-ghost px-2 py-0 text-xs" onClick={() => setAdding(adding === cat ? null : cat)} aria-expanded={adding === cat}>
                {adding === cat ? "Done" : "+ Add"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {byCategory[cat].length === 0 && <span className="text-xs text-ink-600">—</span>}
              {byCategory[cat].map((item) => (
                <span key={item} className="chip gap-1">
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                  <button className="text-ink-600 hover:text-blood-500" title={`Remove ${item}`} onClick={() => remove(cat, item)}>✕</button>
                </span>
              ))}
            </div>
            {adding === cat && <AddProficiency category={cat} have={byCategory[cat]} onAdd={(item) => add(cat, item)} />}
          </div>
        ))}
        <div>
          <span className="label">Other notes</span>
          <TextArea rows={2} className="field-boxed mt-1 resize-y text-sm" placeholder="Anything else (vehicles, special training…)" value={other.join("\n")} onChange={setOther} />
        </div>
      </div>
    </Section>
  );
}

/** The usual values for a category (ones already had are left out), a filter, and a custom entry. */
function AddProficiency({ category, have, onAdd }: { category: ProfCategory; have: string[]; onAdd: (item: string) => void }) {
  const [q, setQ] = useState("");
  const owned = new Set(have.map(profKey));
  const term = q.trim().toLowerCase();
  const groups = PROF_REPOSITORY[category]
    .map((g) => ({ ...g, items: g.items.filter((x) => !owned.has(profKey(x)) && (!term || x.toLowerCase().includes(term))) }))
    .filter((g) => g.items.length);
  const custom = q.trim() && !owned.has(profKey(q)) && !PROF_REPOSITORY[category].some((g) => g.items.some((x) => profKey(x) === profKey(q)));
  return (
    <div className="mt-2 rounded-lg border border-ink-800 bg-ink-850/50 p-2">
      <form
        className="mb-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom) {
            onAdd(q);
            setQ("");
          }
        }}
      >
        <input className="field-boxed py-1 text-sm" placeholder={`Filter or type a custom ${category.toLowerCase().replace(/s$/, "")}…`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {custom && <button className="btn px-2 text-xs">Add “{q.trim()}”</button>}
      </form>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.group}>
            {PROF_REPOSITORY[category].length > 1 && <div className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-600">{g.group}</div>}
            <div className="flex flex-wrap gap-1">
              {g.items.map((x) => (
                <button key={x} className="chip hover:border-accent-600 hover:text-accent-400" onClick={() => onAdd(x)}>+ {x}</button>
              ))}
            </div>
          </div>
        ))}
        {!groups.length && !custom && <p className="text-xs text-ink-600">Nothing left to add{term ? " for that search" : ""}.</p>}
      </div>
    </div>
  );
}
