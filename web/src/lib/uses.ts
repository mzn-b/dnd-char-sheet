import { abilityMod, profBonus } from "./rules";
import { classResources } from "./resources";
import type { Ability, Character, Feature } from "./types";

export type UsesFormula = number | "prof" | Ability;

export interface DetectedUses {
  formula: UsesFormula;
  reset: "short" | "long";
}

const COUNT: Record<string, number> = { once: 1, twice: 2, "three times": 3, "two times": 2, "four times": 4, one: 1, two: 2, three: 3, four: 4, five: 5 };
const ABILITY: Record<string, Ability> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

/**
 * Read how often a feature can be used from its text. Returns null when it isn't limited
 * (or the limit can't be recognised).
 */
export function detectUses(text: string): DetectedUses | null {
  const t = text.replace(/\*/g, "").replace(/\s+/g, " ");
  const it = "(?:this(?: feature| ability)?|it|them|that feature)";
  const rest = "((?:short or long|long|short) )?rest";
  // The limit sentence decides the rest type; a trigger like "When you finish a short rest, …" doesn't.
  const restMatch =
    t.match(new RegExp(`(?:can't|cannot) use ${it} again until you finish a ${rest}`, "i")) ??
    t.match(new RegExp(`must finish a ${rest} before you can (?:use|cast) ${it} again`, "i")) ??
    t.match(new RegExp(`to use ${it} again, you must finish a ${rest}`, "i")) ??
    t.match(new RegExp(`regain (?:all )?(?:of )?(?:your )?(?:expended )?(?:uses|use|it|them)[^.]*?when you finish a ${rest}`, "i")) ??
    t.match(new RegExp(`(?:until|before|when|must) (?:you )?finish (?:a|your next) ${rest}`, "i"));
  if (!restMatch) return null;
  // "until you finish a rest" (either kind) resets on a short rest.
  const restWord = (restMatch[1] ?? "short").trim().toLowerCase();
  const reset: "short" | "long" = restWord.startsWith("short") ? "short" : "long";

  if (/number of times equal to your proficiency bonus/i.test(t)) return { formula: "prof", reset };
  const abilityTimes = t.match(/number of times equal to your (strength|dexterity|constitution|intelligence|wisdom|charisma) modifier/i);
  if (abilityTimes) return { formula: ABILITY[abilityTimes[1].toLowerCase()], reset };
  // Luck points; not class pools tracked as resources ("you have 2 sorcery points").
  const points = t.match(/you have (\d+|one|two|three|four|five) (?:luck points|uses)/i);
  if (points) return { formula: Number(points[1]) || COUNT[points[1].toLowerCase()] || 1, reset };
  // Multipliers ("four times your ranger level", "twice your proficiency bonus") and "once you have…"
  // aren't use counts.
  const times = t.match(/\b(once|twice|(?:three|two|four) times)\b(?! your| the| its| that| per turn| on each| you(?:'ve| have)| each turn)/i);
  if (times) return { formula: COUNT[times[1].toLowerCase()], reset };
  if (new RegExp(`once you use ${it}|(?:can't|cannot) use ${it} again|before you can (?:use|cast) ${it} again|to use ${it} again`, "i").test(t)) return { formula: 1, reset };
  return null;
}

export function usesMax(c: Character, formula: UsesFormula | undefined, fallback: number): number {
  if (formula == null) return fallback;
  if (typeof formula === "number") return formula;
  if (formula === "prof") return profBonus(c);
  return Math.max(1, abilityMod(c, formula));
}

export const formulaLabel = (f: UsesFormula | undefined) =>
  f == null || typeof f === "number" ? "" : f === "prof" ? "proficiency bonus" : `${f.toUpperCase()} modifier`;

/** Features already tracked as class resources (Rage, Channel Divinity…) aren't tracked twice. */
export function coveredByResources(c: Character, name: string) {
  const n = name.toLowerCase();
  return classResources(c).some((r) =>
    [r.name, ...(r.aliases ?? [])].map((a) => a.toLowerCase()).some((a) => n === a || n.startsWith(`${a} `) || n.startsWith(`${a}:`) || n.startsWith(`${a} (`) || a.startsWith(n)),
  );
}

/** Add use tracking to a feature when its text says it's limited. Returns true if it changed. */
export function applyDetectedUses(c: Character, f: Feature): boolean {
  if (f.uses || coveredByResources(c, f.name)) return false;
  // Tracked on the spell it grants.
  if (/^mystic arcanum/i.test(f.name)) return false;
  // Racial spellcasting is tracked on the granted spells themselves.
  if (f.kind === "race" && f.grantedSpells?.length) return false;
  const d = detectUses(f.description);
  if (!d) return false;
  f.uses = { max: usesMax(c, d.formula, 1), used: 0, reset: d.reset, formula: d.formula };
  return true;
}
