import { ABILITY_NAMES, SKILLS, abilityMod, fmt, passivePerception, profBonus, saveBonus, skillBonus } from "../../lib/rules";
import { d20 } from "../../lib/dice";
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {ABILITIES.map((a) => (
          <div key={a} className="panel flex flex-col items-center p-2 text-center">
            <span className="label">{ABILITY_NAMES[a].slice(0, 3)}</span>
            <RollButton expression={d20(abilityMod(c, a))} label={`${ABILITY_NAMES[a]} check`} className="font-display text-3xl leading-tight text-ink-200">
              {fmt(abilityMod(c, a))}
            </RollButton>
            <NumberField
              className="field w-12 rounded-full border-ink-700 bg-ink-850 text-center text-sm"
              value={c.abilities[a]}
              min={1}
              max={30}
              aria-label={`${ABILITY_NAMES[a]} score`}
              onChange={(n) => update((d) => void (d.abilities[a] = n))}
            />
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
          {[["Perception", passivePerception(c)], ["Insight", 10 + skillBonus(c, "insight")], ["Investigation", 10 + skillBonus(c, "investigation")]].map(([label, n]) => (
            <div key={label} className="rounded-lg bg-ink-850 py-1.5">
              <div className="font-display text-xl">{n}</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
            </div>
          ))}
        </div>
        <TextArea rows={2} className="field mt-2 resize-y text-sm" placeholder="Darkvision 60 ft, tremorsense…" value={c.senses ?? ""} onChange={(v) => update((d) => void (d.senses = v))} />
      </Section>

      <Section title="Other Proficiencies & Languages">
        <TextArea
          rows={5}
          placeholder="Armor, weapons, tools, languages…"
          value={c.proficienciesAndLanguages}
          onChange={(v) => update((d) => void (d.proficienciesAndLanguages = v))}
        />
      </Section>
    </div>
  );
}
