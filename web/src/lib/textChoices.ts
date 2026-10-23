import { SKILLS } from "./rules";
import type { Ability, Choice, Effect } from "./types";

/**
 * Choices hidden in a feature's prose that the rules data doesn't structure, e.g. Deft Explorer's
 * Canny ("Choose one of your skill proficiencies. Your proficiency bonus is doubled…") or Otherworldly
 * Glamour ("proficiency in one of the following skills of your choice: Deception, Performance, or
 * Persuasion"). They become real choices, so the pick is applied to the sheet.
 */
/** 2014 class skill lists, for "skills available to barbarians at 1st level". */
const CLASS_SKILLS: Record<string, string[]> = {
  barbarian: ["animal-handling", "athletics", "intimidation", "nature", "perception", "survival"],
  fighter: ["acrobatics", "animal-handling", "athletics", "history", "insight", "intimidation", "perception", "survival"],
  monk: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"],
  ranger: ["animal-handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
  rogue: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight-of-hand", "stealth"],
};
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
  // "proficiency in one of the following skills: …", Knowledge Domain's "proficient in your choice of two of
  // the following skills: … Your proficiency bonus is doubled…" (proficiency and expertise).
  const listed = text.match(/(?:proficiency in|proficient in your choice of) (one|two) of the following skills(?: of your choice)?:\s*([^.]+)\.\s*(Your proficiency bonus is doubled)?/i);
  // Order/Peace Domain: "proficiency in the Insight, Performance, or Persuasion skill (your choice)".
  const either = text.match(/proficiency in the ((?:[A-Z][a-z]+(?: [A-Z][a-z]+)?,? (?:or )?)+)skill \(your choice\)/);
  // Primal Knowledge: "one skill of your choice from the list of skills available to barbarians at 1st level".
  const classList = text.match(/(?:gain|have) proficiency (?:in|with) (one|two|three) (?:additional )?skills? of your choice from the list of skills available to (\w+?)s? at 1st level/i);
  if (listed) {
    const keys = SKILLS.filter((s) => new RegExp(`\\b${s.name}\\b`, "i").test(listed[2])).map((s) => s.key);
    const n = listed[1].toLowerCase();
    if (keys.length && listed[3]) out.push({ id: "text-skill", label: `Proficiency and expertise: choose ${n}`, kind: "expertise", grantsProficiency: true, count: COUNT[n], options: skillOptions(keys) });
    else if (keys.length) out.push({ id: "text-skill", label: `Skill proficiency: choose ${n}`, kind: "skill", count: COUNT[n], options: skillOptions(keys) });
  } else if (either) {
    const keys = SKILLS.filter((s) => new RegExp(`\\b${s.name}\\b`).test(either[1])).map((s) => s.key);
    if (keys.length > 1) out.push({ id: "text-skill", label: "Skill proficiency: choose one", kind: "skill", count: 1, options: skillOptions(keys) });
  } else if (classList && CLASS_SKILLS[classList[2].toLowerCase()]) {
    const n = classList[1].toLowerCase();
    out.push({ id: "text-skill", label: `Skill proficiency: choose ${n} from the ${classList[2]} list`, kind: "skill", count: COUNT[n], options: skillOptions(CLASS_SKILLS[classList[2].toLowerCase()]) });
  } else {
    // College of Lore: "proficiency with three skills of your choice".
    const any = text.match(/(?:gain|have) proficiency (?:in|with) (one|two|three) (?:additional )?skills? of your choice/i);
    if (any) out.push({ id: "text-skill", label: `Skill proficiency: choose ${any[1].toLowerCase()}`, kind: "skill", count: COUNT[any[1].toLowerCase()], options: skillOptions() });
  }
  // Elemental Adept: "choose one of the following damage types: acid, cold, fire, lightning, or thunder".
  const damage = text.match(/choose one of the following damage types:\s*([^.]+)/i);
  if (damage) {
    const types = damage[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((t) => t.trim()).filter(Boolean);
    out.push({ id: "text-damage", label: "Damage type", kind: "text", count: 1, options: types.map((t) => ({ key: t.toLowerCase(), name: t[0].toUpperCase() + t.slice(1) })) });
  }
  // Iron Mind (Gloom Stalker), Slippery Mind…: "proficiency in Wisdom saving throws. If you already have
  // this proficiency, you instead gain proficiency in Intelligence or Charisma saving throws".
  const save = text.match(/gain proficiency in (\w+) saving throws\. If you already have this proficiency, you instead gain proficiency in (\w+) or (\w+) saving throws/i);
  if (save) {
    const options = [save[1], save[2], save[3]].map((n) => ({ key: n.slice(0, 3).toLowerCase(), name: n }));
    out.push({ id: "text-save", label: `Saving throw proficiency: ${save[1]} (or ${save[2]}/${save[3]} if you already have it)`, kind: "save", count: 1, options });
  }
  // Artificer specialists: "proficiency with smith's tools. If you already have this proficiency, you gain
  // proficiency with one other type of artisan's tools of your choice."
  const tool = text.match(/proficiency with ([^.]+?)\. If you already have this proficiency, you gain proficiency with one other type of artisan's tools of your choice/i);
  if (tool) {
    out.push({
      id: "text-tool", label: `Tools: you already have ${tool[1]}, so choose another type of artisan's tools`, kind: "proficiency", prefix: "Tools", count: 1,
      ifProficient: tool[1], options: ARTISANS_TOOLS.filter((t) => t.toLowerCase() !== tool[1].toLowerCase()).map((t) => ({ key: t.toLowerCase(), name: t })),
    });
  }
  return out;
}

/** Whether a character has a tool proficiency (in its proficiency lines). */
export const hasToolProficiency = (proficiencies: string, tool: string) =>
  proficiencies.toLowerCase().split(/\n|[,;:]/).some((x) => x.trim() === tool.toLowerCase());

const ARTISANS_TOOLS = [
  "Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools", "Cartographer's tools", "Cobbler's tools",
  "Cook's utensils", "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools",
  "Smith's tools", "Tinker's tools", "Weaver's tools", "Woodcarver's tools",
];

/** A feature's choices plus any found in its text, without duplicating a kind the data already offers. */
export function withTextChoices(choices: Choice[] | undefined, description: string): Choice[] {
  const have = choices ?? [];
  const extra = textChoices(description).filter((t) => !have.some((c) => c.kind === t.kind));
  return [...have, ...extra];
}

const ABILITY_WORDS: Record<string, Ability> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const skillKey = (name: string) => SKILLS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())?.key;

/**
 * Fixed proficiencies a class or subclass feature states in prose: "you gain proficiency with heavy
 * armor" (Life Domain), "with medium armor, shields, and martial weapons" (Valor), "proficiency in the
 * Performance skill" (Drunken Master), "in Wisdom saving throws" (Slippery Mind), "in all saving throws"
 * (Diamond Soul), "in the Nature and Survival skills… proficiency bonus is doubled" (Survivalist).
 * Picks ("of your choice", "either", "one of") are choices, not effects.
 */
export function textEffects(description: string): Effect[] {
  const out: Effect[] = [];
  for (const sentence of plain(description).split(/(?<=[.!?])\s+/)) {
    if (/if you already have this proficiency/i.test(sentence)) continue;
    const next = plain(description).split(sentence)[1] ?? "";
    // "If you already have this proficiency, you instead…" makes it a choice (Iron Mind).
    if (/^\s*If you already have this proficiency, you instead/i.test(next)) continue;
    const gear = sentence.match(/(?:gain|have) proficiency with ([^.]+?)(?:\s+if you don't|\s+while|\.|$)/i);
    if (gear && !/\bskills?\b|saving throws?|your choice|\beither\b|\bone of\b|\bchoose\b|one type of|\bor\b/i.test(gear[1])) {
      for (const raw of gear[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
        const item = raw.replace(/^(?:the|all)\s+/i, "").trim();
        if (!item) continue;
        if (/\b(light|medium|heavy) armor\b|^shields?$/i.test(item)) out.push({ kind: "proficiency", value: `Armor: ${item.toLowerCase().replace(/^shields?$/, "shields")}` });
        else if (/\b(simple|martial) weapons?\b/i.test(item)) out.push({ kind: "proficiency", value: `Weapons: ${item.toLowerCase().replace(/ weapons?$/, "")}` });
        else if (/tools|supplies|kit|utensils|instrument/i.test(item)) out.push({ kind: "proficiency", value: `Tools: ${item}` });
        else if (/^[a-z' -]+s?$/i.test(item) && item.split(" ").length <= 3) out.push({ kind: "proficiency", value: `Weapons: ${item.toLowerCase()}` });
      }
    }
    const skills = sentence.match(/proficiency in the ([A-Z][a-z]+(?: [A-Z][a-z]+)?)(?:,? and (?:the )?([A-Z][a-z]+(?: [A-Z][a-z]+)?))? skills?(?! \(your choice\))/);
    if (skills) {
      const keys = [skills[1], skills[2]].filter(Boolean).map((n) => skillKey(n!)).filter(Boolean) as string[];
      for (const k of keys) out.push({ kind: "skill", skill: k });
      if (/proficiency bonus is doubled/i.test(sentence + " " + next.split(/(?<=[.!?])\s+/)[0])) for (const k of keys) out.push({ kind: "expertise", skill: k });
    }
    if (/proficiency in all saving throws/i.test(sentence)) for (const a of Object.values(ABILITY_WORDS)) out.push({ kind: "save", ability: a });
    const save = sentence.match(/proficiency in (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throws/i);
    if (save) out.push({ kind: "save", ability: ABILITY_WORDS[save[1].toLowerCase()] });
  }
  return out;
}
