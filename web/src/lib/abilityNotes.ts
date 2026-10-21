import { activeModifiers } from "./modifiers";
import { ABILITIES, type Ability, type Character } from "./types";

/** A short reminder shown on an ability: what changes or replaces it for this build. */
export interface AbilityNote {
  short: string;
  text: string;
  source: string;
}

const NAMES: Record<string, Ability> = {
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
};
const AB = (a: Ability) => a.toUpperCase();
const ABILITY_WORD = "(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)";
const INSTEAD = new RegExp(`use (?:your )?${ABILITY_WORD}(?: modifier)?,? instead of (?:your )?${ABILITY_WORD}(?: modifier)?(?:,? or ${ABILITY_WORD})?`, "i");
const CHECK_BONUS = new RegExp(`whenever you make an? ${ABILITY_WORD} check[^.]*bonus[^.]*equal to your ${ABILITY_WORD} modifier`, "i");

const plain = (s: string) => s.replace(/\*\*?|_/g, "").replace(/\s+/g, " ");
const sentenceWith = (text: string, re: RegExp) => plain(text).split(/(?<=[.!?])\s+/).find((x) => re.test(x));

/** Notes per ability: check bonuses from features, "use X instead of Y" features, spellcasting ability. */
export function abilityNotes(c: Character): Record<Ability, AbilityNote[]> {
  const notes = Object.fromEntries(ABILITIES.map((a) => [a, [] as AbilityNote[]])) as Record<Ability, AbilityNote[]>;
  const add = (a: Ability, n: AbilityNote) => {
    if (!notes[a].some((x) => x.source === n.source && x.short === n.short)) notes[a].push(n);
  };

  // Check bonuses that are already applied (Otherworldly Glamour…).
  for (const m of activeModifiers(c)) {
    const target = m.target.match(/^check:(\w+)$/)?.[1] as Ability | undefined;
    if (target) add(target, { short: `+${m.note ?? m.value} checks`, text: `${m.source}: +${m.value} to ${AB(target)} checks${m.note ? ` (your ${m.note} modifier)` : ""}, already included`, source: m.source });
  }

  for (const f of c.features) {
    for (const item of [f, ...(f.subfeatures ?? [])]) {
      const text = item.description ?? "";
      const instead = sentenceWith(text, INSTEAD);
      if (instead) {
        const m = instead.match(INSTEAD)!;
        const use = NAMES[m[1].toLowerCase()];
        for (const old of [m[2], m[3]].filter(Boolean).map((x) => NAMES[x.toLowerCase()])) {
          add(old, { short: `${AB(use)} instead`, text: `${item.name}: ${instead}`, source: item.name });
        }
      }
      const bonus = sentenceWith(text, CHECK_BONUS);
      if (bonus) {
        const m = bonus.match(CHECK_BONUS)!;
        const target = NAMES[m[1].toLowerCase()];
        const from = NAMES[m[2].toLowerCase()];
        add(target, { short: `+${AB(from)} checks`, text: `${item.name}: ${bonus}`, source: item.name });
      }
    }
  }

  // The ability each class casts with (spell attacks and save DCs use it).
  for (const k of c.classes) {
    if (k.spellcastingAbility) add(k.spellcastingAbility, { short: "spellcasting", text: `${k.name} spellcasting ability: spell attacks and save DCs use ${AB(k.spellcastingAbility)}`, source: `${k.name} spellcasting` });
  }
  return notes;
}
