import { ProficienciesPanel } from "./ProficienciesPanel";
import { ABILITY_NAMES, SKILLS, abilityCheckBonus, abilityScore, fmt, passiveScore, profBonus, saveBonus, skillBonus } from "../../lib/rules";
import { d20 } from "../../lib/dice";
import { abilityNotes } from "../../lib/abilityNotes";
import { RollButton } from "../dice";
import { ABILITIES, type Character, type ProfLevel } from "../../lib/types";
import { NumberField, Section, TextArea } from "../ui";
import type { Update } from "../../lib/useCharacter";

const PROF_CYCLE: ProfLevel[] = [0, 1, 2, 0.5];
const PROF_STYLE: Record<string, string> = {
  "0": "border-ink-600",
  "0.5": "border-accent-500 bg-gradient-to-r from-accent-500 from-50% to-transparent to-50%",
  "1": "border-accent-500 bg-accent-500",
  "2": "border-accent-400 bg-accent-400 ring-2 ring-accent-500/40 ring-offset-1 ring-offset-ink-900",
};
const PROF_LABEL: Record<string, string> = { "0": "Not proficient", "0.5": "Half proficiency", "1": "Proficient", "2": "Expertise" };

export function AbilitiesPanel({ c, update }: { c: Character; update: Update }) {
  const notes = abilityNotes(c);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((a) => (
          <div key={a} className="panel flex flex-col items-center p-2 text-center">
            <span className="label">{ABILITY_NAMES[a].slice(0, 3)}</span>
            <RollButton expression={d20(abilityCheckBonus(c, a))} label={`${ABILITY_NAMES[a]} check`} className="font-display text-3xl leading-tight text-ink-200">
              {fmt(abilityCheckBonus(c, a))}
            </RollButton>
            <NumberField
              className="field w-12 rounded-full border-ink-700 bg-ink-850 text-center text-sm"
              value={c.abilities[a]}
              min={1}
              max={30}
              aria-label={`${ABILITY_NAMES[a]} score`}
              onChange={(n) => update((d) => void (d.abilities[a] = n))}
            />
            {notes[a].length > 0 && (
              <ul className="mt-1 w-full space-y-0.5">
                {notes[a].map((n) => (
                  <li key={n.source + n.short} title={n.text} className="cursor-help rounded bg-arcane-500/10 px-1 text-[10px] leading-4 text-arcane-400">
                    {n.short}
                  </li>
                ))}
              </ul>
            )}
            {abilityScore(c, a) !== c.abilities[a] && (
              <span className="mt-0.5 text-[10px] text-emerald-400" title={c.wildShape && ["str", "dex", "con"].includes(a) ? "Beast form (Wild Shape)" : "Changed by an item"}>
                {c.wildShape && ["str", "dex", "con"].includes(a) ? "🐾 " : "→ "}{abilityScore(c, a)}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className={`panel flex items-center justify-between p-3 text-left transition ${c.inspiration ? "border-accent-500" : ""}`}
          onClick={() => update((d) => void (d.inspiration = !d.inspiration))}
        >
          <span className="label">Inspiration</span>
          <span className={`text-xl ${c.inspiration ? "text-accent-400" : "text-ink-600"}`}>★</span>
        </button>
        <div className="panel flex items-center justify-between p-3" title="Derived from total level; type to override">
          <span className="label">Proficiency</span>
          <NumberField
            className="field w-12 text-right font-display text-xl"
            value={profBonus(c)}
            onChange={(n) => update((d) => void (d.profBonusOverride = n))}
          />
        </div>
      </div>

      <Section title="Saving Throws">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {ABILITIES.map((a) => {
            const prof = c.saveProficiencies.includes(a);
            return (
              <li key={a} className="flex items-center gap-2 text-sm">
                <button
                  aria-label={`Toggle ${a} save proficiency`}
                  className={`h-3.5 w-3.5 rounded-full border ${prof ? PROF_STYLE["1"] : PROF_STYLE["0"]}`}
                  onClick={() => update((d) => void (d.saveProficiencies = prof ? d.saveProficiencies.filter((x) => x !== a) : [...d.saveProficiencies, a]))}
                />
                <RollButton expression={d20(saveBonus(c, a))} label={`${ABILITY_NAMES[a]} save`} kind="save" className="w-9 text-right font-semibold tabular-nums">
                  {fmt(saveBonus(c, a))}
                </RollButton>
                <span className="text-ink-400">{ABILITY_NAMES[a]}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Skills" action={<span className="text-[10px] text-ink-600">click ● to cycle prof / expertise / half</span>}>
        <ul className="space-y-0.5">
          {SKILLS.map((s) => {
            const p = c.skills[s.key] ?? 0;
            return (
              <li key={s.key} className="flex items-center gap-2 rounded px-1 text-sm hover:bg-ink-850">
                <button
                  title={PROF_LABEL[String(p)]}
                  className={`h-3.5 w-3.5 shrink-0 rounded-full border ${PROF_STYLE[String(p)]}`}
                  onClick={() => update((d) => void (d.skills[s.key] = PROF_CYCLE[(PROF_CYCLE.indexOf(p) + 1) % PROF_CYCLE.length]))}
                />
                <RollButton expression={d20(skillBonus(c, s.key))} label={s.name} className="w-9 text-right font-semibold tabular-nums">
                  {fmt(skillBonus(c, s.key))}
                </RollButton>
                <span className="flex-1">{s.name}</span>
                <span className="text-[10px] uppercase text-ink-600">{s.ability}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Passive Scores & Senses">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Perception", passiveScore(c, "perception")], ["Insight", passiveScore(c, "insight")], ["Investigation", passiveScore(c, "investigation")]].map(([label, n]) => (
            <div key={label} className="rounded-lg bg-ink-850 py-1.5">
              <div className="font-display text-xl">{n}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
            </div>
          ))}
        </div>
        <TextArea rows={2} className="field mt-2 resize-y text-sm" placeholder="Darkvision 60 ft, tremorsense…" value={c.senses ?? ""} onChange={(v) => update((d) => void (d.senses = v))} />
      </Section>

      <ProficienciesPanel c={c} update={update} />
    </div>
  );
}
