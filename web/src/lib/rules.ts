import type { Ability, CasterType, Character, ClassEntry, ProfLevel } from "./types";

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const SKILLS: { key: string; name: string; ability: Ability }[] = [
  { key: "acrobatics", name: "Acrobatics", ability: "dex" },
  { key: "animal-handling", name: "Animal Handling", ability: "wis" },
  { key: "arcana", name: "Arcana", ability: "int" },
  { key: "athletics", name: "Athletics", ability: "str" },
  { key: "deception", name: "Deception", ability: "cha" },
  { key: "history", name: "History", ability: "int" },
  { key: "insight", name: "Insight", ability: "wis" },
  { key: "intimidation", name: "Intimidation", ability: "cha" },
  { key: "investigation", name: "Investigation", ability: "int" },
  { key: "medicine", name: "Medicine", ability: "wis" },
  { key: "nature", name: "Nature", ability: "int" },
  { key: "perception", name: "Perception", ability: "wis" },
  { key: "performance", name: "Performance", ability: "cha" },
  { key: "persuasion", name: "Persuasion", ability: "cha" },
  { key: "religion", name: "Religion", ability: "int" },
  { key: "sleight-of-hand", name: "Sleight of Hand", ability: "dex" },
  { key: "stealth", name: "Stealth", ability: "dex" },
  { key: "survival", name: "Survival", ability: "wis" },
];

export const ALIGNMENTS = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned",
];

export const CONDITIONS = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible",
  "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
];

/** XP needed to reach each level (index = level - 1). */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export const totalLevel = (c: Character) => c.classes.reduce((sum, k) => sum + k.level, 0);

export const profBonus = (c: Character) =>
  c.profBonusOverride ?? Math.ceil(Math.max(totalLevel(c), 1) / 4) + 1;

export const abilityMod = (c: Character, a: Ability) => mod(c.abilities[a]);

export const saveBonus = (c: Character, a: Ability) =>
  abilityMod(c, a) + (c.saveProficiencies.includes(a) ? profBonus(c) : 0);

export const skillBonus = (c: Character, skill: string) => {
  const s = SKILLS.find((x) => x.key === skill)!;
  const prof: ProfLevel = c.skills[skill] ?? 0;
  return abilityMod(c, s.ability) + Math.floor(prof * profBonus(c));
};

export const passivePerception = (c: Character) => 10 + skillBonus(c, "perception");
export const initiative = (c: Character) => abilityMod(c, "dex") + c.initiativeBonus;

export const classSummary = (classes: ClassEntry[] | null | undefined) =>
  classes?.length
    ? classes.map((k) => `${k.name}${k.subclass ? ` (${k.subclass.name})` : ""} ${k.level}`).join(" / ")
    : "No class yet";

export const xpForNextLevel = (c: Character) => XP_THRESHOLDS[Math.min(totalLevel(c), 19)];

// ---------------------------------------------------------------------------
// Spellcasting rules (SRD 5.1). Homebrew classes declare their own caster type.

export const CASTER_TYPE: Record<string, CasterType> = {
  bard: "full", cleric: "full", druid: "full", sorcerer: "full", wizard: "full",
  paladin: "half", ranger: "half", warlock: "pact",
};

/** How a class gains spells: picks them as "known", or "prepares" from a list each day. */
export const SPELL_MODEL: Record<string, "known" | "prepared" | "spellbook"> = {
  bard: "known", ranger: "known", sorcerer: "known", warlock: "known",
  cleric: "prepared", druid: "prepared", paladin: "prepared",
  wizard: "spellbook",
};

export const spellModel = (classKey: string) => SPELL_MODEL[classKey] ?? "known";

/** Number of spells a prepared caster (or wizard) can have prepared. */
export function maxPrepared(c: Character, k: ClassEntry): number | null {
  const model = spellModel(k.key);
  if (model === "known" || !k.spellcastingAbility) return null;
  const level = k.key === "paladin" ? Math.floor(k.level / 2) : k.level;
  return Math.max(1, abilityMod(c, k.spellcastingAbility) + level);
}

export const spellSaveDC = (c: Character, a: Ability) => 8 + profBonus(c) + abilityMod(c, a);
export const spellAttack = (c: Character, a: Ability) => profBonus(c) + abilityMod(c, a);

/** PHB multiclass spellcaster table (index = caster level - 1). */
const MULTICLASS_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function casterType(k: ClassEntry): CasterType {
  return k.casterType ?? CASTER_TYPE[k.key] ?? (k.spellcastingAbility ? "full" : "none");
}

/**
 * Spell slots for a multiclassed character (pact magic tracked separately).
 * Single-class characters use the class's own table from the API instead.
 */
export function multiclassSlots(classes: ClassEntry[]): number[] {
  const casterLevel = classes.reduce((sum, k) => {
    const t = casterType(k);
    if (t === "full") return sum + k.level;
    if (t === "half") return sum + Math.floor(k.level / 2);
    if (t === "third") return sum + Math.floor(k.level / 3);
    return sum;
  }, 0);
  const row = casterLevel > 0 ? MULTICLASS_SLOTS[Math.min(casterLevel, 20) - 1] : [];
  return Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
}

/** Warlock pact slots by warlock level: [count, slot level]. */
export function pactSlots(warlockLevel: number): { max: number; level: number } {
  if (warlockLevel <= 0) return { max: 0, level: 0 };
  const max = warlockLevel === 1 ? 1 : warlockLevel <= 10 ? 2 : warlockLevel <= 16 ? 3 : 4;
  const level = Math.min(5, Math.ceil(warlockLevel / 2));
  return { max, level };
}

export const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
export const spellLevelLabel = (n: number) => (n === 0 ? "Cantrips" : `${ordinal(n)} level`);
