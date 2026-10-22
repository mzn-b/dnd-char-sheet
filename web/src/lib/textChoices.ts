import { SKILLS } from "./rules";
import type { Choice } from "./types";

/**
 * Choices hidden in a feature's prose that the rules data doesn't structure, e.g. Deft Explorer's
 * Canny ("Choose one of your skill proficiencies. Your proficiency bonus is doubled…") or Otherworldly
 * Glamour ("proficiency in one of the following skills of your choice: Deception, Performance, or
 * Persuasion"). They become real choices, so the pick is applied to the sheet.
 */
const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
const plain = (text: string) => text.replace(/\*\*?|_/g, "").replace(/\s+/g, " ");
const skillOptions = (keys?: string[]) => SKILLS.filter((s) => !keys || keys.includes(s.key)).map((s) => ({ key: s.key, name: s.name }));

export function textChoices(description: string): Choice[] {
  const text = plain(description);
  const out: Choice[] = [];
  const expertise = text.match(/choose (one|two|three|four) of your skill proficiencies[^.]*\.\s*your proficiency bonus is doubled/i);
  if (expertise) {
    const n = COUNT[expertise[1].toLowerCase()];
    out.push({ id: "text-expertise", label: `Expertise: choose ${expertise[1].toLowerCase()} of your skill proficiencies (proficiency bonus doubled)`, kind: "expertise", count: n, options: skillOptions() });
  }
  const listed = text.match(/proficiency in (one|two) of the following skills(?: of your choice)?:\s*([^.]+)/i);
  if (listed) {
    const keys = SKILLS.filter((s) => new RegExp(`\\b${s.name}\\b`, "i").test(listed[2])).map((s) => s.key);
    if (keys.length) out.push({ id: "text-skill", label: `Skill proficiency: choose ${listed[1].toLowerCase()}`, kind: "skill", count: COUNT[listed[1].toLowerCase()], options: skillOptions(keys) });
  } else {
    const any = text.match(/(?:gain|have) proficiency in (one|two|three) (?:additional )?skills? of your choice/i);
    if (any) out.push({ id: "text-skill", label: `Skill proficiency: choose ${any[1].toLowerCase()}`, kind: "skill", count: COUNT[any[1].toLowerCase()], options: skillOptions() });
  }
  // Iron Mind (Gloom Stalker), Slippery Mind…: "proficiency in Wisdom saving throws. If you already have
  // this proficiency, you instead gain proficiency in Intelligence or Charisma saving throws".
  const save = text.match(/gain proficiency in (\w+) saving throws\. If you already have this proficiency, you instead gain proficiency in (\w+) or (\w+) saving throws/i);
  if (save) {
    const options = [save[1], save[2], save[3]].map((n) => ({ key: n.slice(0, 3).toLowerCase(), name: n }));
    out.push({ id: "text-save", label: `Saving throw proficiency: ${save[1]} (or ${save[2]}/${save[3]} if you already have it)`, kind: "save", count: 1, options });
  }
  return out;
}

/** A feature's choices plus any found in its text, without duplicating a kind the data already offers. */
export function withTextChoices(choices: Choice[] | undefined, description: string): Choice[] {
  const have = choices ?? [];
  const extra = textChoices(description).filter((t) => !have.some((c) => c.kind === t.kind));
  return [...have, ...extra];
}
