import type { Ability, CasterType, Character, ClassEntry, Companion, ProfLevel, SpellModel } from "./types";
import { effectiveScore, hasModifier, modifiersFor, sumFor, type Modifier } from "./modifiers";

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

/** Ability score including items (Belt of Giant Strength…). The stored score is the base. */
export const abilityScore = (c: Character, a: Ability) => {
  // Wild Shape: the beast's Strength, Dexterity and Constitution replace yours (PHB).
  const beast = wildShapeForm(c)?.monster;
  if (beast && (a === "str" || a === "dex" || a === "con")) return beast.abilities[a];
  return effectiveScore(c, a);
};
export const abilityMod = (c: Character, a: Ability) => mod(abilityScore(c, a));

/** The Wild Shape form currently assumed, if any. */
export function wildShapeForm(c: Character): Companion | undefined {
  const id = c.wildShape?.companionId;
  return id ? c.companions?.find((p) => p.id === id) : undefined;
}

/** Druids keep their own spellcasting in beast form only from 18th level (Beast Spells). */
export const canCastInWildShape = (c: Character) =>
  (c.classes.find((k) => k.name.toLowerCase() === "druid")?.level ?? 0) >= 18 || c.features.some((f) => /^beast spells$/i.test(f.name));
/** Modifier from the stored score only (for level-up maths that shouldn't count items). */
export const baseAbilityMod = (c: Character, a: Ability) => mod(c.abilities[a]);

export const saveBonus = (c: Character, a: Ability) => {
  const own = abilityMod(c, a) + (c.saveProficiencies.includes(a) ? profBonus(c) : 0) + sumFor(c, "save", `save:${a}`);
  // In Wild Shape you use the better of your proficiency and the beast's.
  const beast = wildShapeForm(c)?.monster?.saves[a];
  return beast != null ? Math.max(own, beast) : own;
};

/** Half proficiency on an unproficient check: Jack of All Trades (round down) or Remarkable Athlete (round up). */
export function unproficientBonus(c: Character, a: Ability): number {
  const pb = profBonus(c);
  if (["str", "dex", "con"].includes(a) && hasModifier(c, "halfProfPhysical")) return Math.ceil(pb / 2);
  if (hasModifier(c, "halfProf")) return Math.floor(pb / 2);
  return 0;
}

export const skillBonus = (c: Character, skill: string) => {
  const s = SKILLS.find((x) => x.key === skill)!;
  const prof: ProfLevel = c.skills[skill] ?? 0;
  const profPart = prof ? Math.floor(prof * profBonus(c)) : unproficientBonus(c, s.ability);
  const own = abilityMod(c, s.ability) + profPart + sumFor(c, "check", `check:${s.ability}`, `skill:${skill}`);
  const skills = wildShapeForm(c)?.monster?.skills;
  const beast = skills?.[skill] ?? skills?.[skill.replace(/-/g, " ")];
  return beast != null ? Math.max(own, beast) : own;
};

/** Raw ability check (no skill): ability mod + Jack of All Trades + check bonuses. */
export const abilityCheckBonus = (c: Character, a: Ability) => abilityMod(c, a) + unproficientBonus(c, a) + sumFor(c, "check", `check:${a}`);

export const passiveScore = (c: Character, skill: string) => 10 + skillBonus(c, skill) + sumFor(c, `passive:${skill}`);
export const passivePerception = (c: Character) => passiveScore(c, "perception");
export const initiative = (c: Character) =>
  abilityMod(c, "dex") + c.initiativeBonus + unproficientBonus(c, "dex") + sumFor(c, "initiative", "check", "check:dex");

/** Hit point maximum: the stored base plus Tough & co., item Constitution changes and exhaustion 4+. */
export function hpMax(c: Character): number {
  // Items that change Constitution change HP; Wild Shape doesn't (the beast has its own HP).
  const conDiff = mod(effectiveScore(c, "con")) - baseAbilityMod(c, "con");
  const max = c.hp.max + sumFor(c, "hp") + conDiff * totalLevel(c);
  return c.exhaustion >= 4 ? Math.floor(max / 2) : max;
}

export const hpMaxParts = (c: Character): Modifier[] => {
  const conDiff = mod(effectiveScore(c, "con")) - baseAbilityMod(c, "con");
  return [
    ...modifiersFor(c, "hp"),
    ...(conDiff ? [{ id: "con", target: "hp", value: conDiff * totalLevel(c), source: "Constitution change", kind: "item" as const }] : []),
  ];
};

/** PHB carrying capacity and the variant encumbrance thresholds. */
export function carrying(c: Character) {
  const str = abilityScore(c, "str");
  const weight = c.equipment.reduce((s, i) => s + i.weight * i.qty, 0) + Object.values(c.currency).reduce((s, n) => s + n, 0) / 50;
  const capacity = str * 15;
  const mode = c.options?.encumbrance ?? "standard";
  const level = mode !== "variant" ? (weight > capacity ? 3 : 0) : weight > str * 10 ? 2 : weight > str * 5 ? 1 : 0;
  return { weight, capacity, mode, encumbered: level, light: str * 5, heavy: str * 10 };
}

/** Walking speed after items, features, heavy armor, encumbrance and exhaustion. */
export function speedBreakdown(c: Character): { total: number; parts: string[] } {
  const form = wildShapeForm(c);
  if (form) {
    const walk = form.monster?.speed.walk ?? (parseInt(form.speed, 10) || 0);
    const other = Object.entries(form.monster?.speed ?? {}).filter(([k, v]) => k !== "walk" && v).map(([k, v]) => `${k} ${v}`);
    return { total: walk, parts: [`${form.name} (Wild Shape) ${walk}`, ...other] };
  }
  let total = c.speed;
  const parts = [`Base ${c.speed}`];
  for (const m of modifiersFor(c, "speed")) {
    total += m.value;
    parts.push(`${m.source} ${fmt(m.value)}`);
  }
  if (armorClassBreakdown(c).tooHeavy) {
    total -= 10;
    parts.push("Armor too heavy −10");
  }
  const load = carrying(c);
  if (load.mode === "variant" && load.encumbered) {
    const pen = load.encumbered === 2 ? 20 : 10;
    total -= pen;
    parts.push(`${load.encumbered === 2 ? "Heavily encumbered" : "Encumbered"} −${pen}`);
  } else if (load.mode === "standard" && load.encumbered) {
    parts.push("Over carrying capacity");
  }
  if (c.exhaustion >= 5) {
    total = 0;
    parts.push("Exhaustion 5: speed 0");
  } else if (c.exhaustion >= 2) {
    total = Math.floor(total / 2);
    parts.push("Exhaustion 2: halved");
  }
  if (c.conditions.some((x) => x === "Grappled" || x === "Restrained")) {
    total = 0;
    parts.push("Grappled/Restrained: speed 0");
  }
  return { total: Math.max(0, total), parts };
}
export const speed = (c: Character) => speedBreakdown(c).total;

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

/** Fallback for characters saved before the class carried its own spell model. */
const SPELL_MODEL: Record<string, SpellModel> = {
  bard: "known", ranger: "known", sorcerer: "known", warlock: "known",
  cleric: "prepared", druid: "prepared", paladin: "prepared", artificer: "prepared",
  wizard: "spellbook",
};

/** How a class gains spells: picks them as "known", "prepares" from its list, or keeps a spellbook. */
export const spellModel = (k: Pick<ClassEntry, "key" | "name" | "spellModel"> | undefined): SpellModel =>
  k?.spellModel ?? SPELL_MODEL[k?.key ?? ""] ?? SPELL_MODEL[(k?.name ?? "").toLowerCase()] ?? "known";

/** Number of spells a prepared caster (or wizard) can have prepared. */
export function maxPrepared(c: Character, k: ClassEntry): number | null {
  if (spellModel(k) === "known" || !k.spellcastingAbility) return null;
  const divisor = k.preparedDivisor ?? (k.name.toLowerCase() === "paladin" ? 2 : 1);
  return Math.max(1, abilityMod(c, k.spellcastingAbility) + Math.floor(k.level / divisor));
}

export const spellSaveDC = (c: Character, a: Ability) => 8 + profBonus(c) + abilityMod(c, a) + sumFor(c, "spellDc");
export const spellAttack = (c: Character, a: Ability) => profBonus(c) + abilityMod(c, a) + sumFor(c, "spellAttack");

/** PHB multiclass spellcaster table (index = caster level - 1). */
const MULTICLASS_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function casterType(k: ClassEntry): CasterType {
  return k.casterType ?? CASTER_TYPE[k.key] ?? CASTER_TYPE[k.name.toLowerCase()] ?? (k.spellcastingAbility ? "full" : "none");
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
    if (t === "artificer") return sum + Math.ceil(k.level / 2);
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

export const skillName = (key: string) => SKILLS.find((s) => s.key === key)?.name ?? key;

/** Standard array, point-buy costs and the multiclass rule helpers used by the creator and wizard. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

/** Whether ability scores meet a class's multiclass prerequisite ("13 Str or 13 Dex", "13 Str and 13 Cha"). */
export function meetsRequirements(
  scores: Record<Ability, number>,
  req: { any: boolean; scores: Partial<Record<Ability, number>> } | null | undefined,
): boolean {
  if (!req) return true;
  const checks = Object.entries(req.scores).map(([a, min]) => scores[a as Ability] >= (min ?? 0));
  return req.any ? checks.some(Boolean) : checks.every(Boolean);
}

export const requirementText = (req: { any: boolean; scores: Partial<Record<Ability, number>> } | null | undefined) =>
  req ? Object.entries(req.scores).map(([a, n]) => `${a.toUpperCase()} ${n}`).join(req.any ? " or " : " and ") : "none";

// ---------------------------------------------------------------------------
// Armor class

export interface AcBreakdown {
  total: number;
  parts: string[];
  stealthDisadvantage: boolean;
  /** Worn armor whose Strength requirement isn't met (speed −10 ft). */
  tooHeavy: boolean;
}

/** AC from equipped armor and shield, Unarmored Defense, the Defense style and misc bonuses. */
export function armorClassBreakdown(c: Character): AcBreakdown {
  const form = wildShapeForm(c);
  if (form) {
    const note = form.monster?.acNote ? ` (${form.monster.acNote})` : "";
    return { total: form.ac, parts: [`${form.name} (Wild Shape) ${form.ac}${note}`], stealthDisadvantage: false, tooHeavy: false };
  }
  const dex = abilityMod(c, "dex");
  const equipped = c.equipment.filter((i) => i.equipped && i.data?.armor);
  const armor = equipped.find((i) => i.data!.armor!.type !== "shield");
  const shield = equipped.find((i) => i.data!.armor!.type === "shield");
  const classNames = c.classes.map((k) => k.name.toLowerCase());
  const parts: string[] = [];
  let total: number;
  if (armor) {
    const a = armor.data!.armor!;
    const dexPart = a.type === "light" ? dex : a.type === "medium" ? Math.min(dex, hasModifier(c, "medArmorDex") && dex >= 3 ? 3 : 2) : 0;
    total = a.base + dexPart;
    parts.push(`${armor.name} ${a.base}`, ...(a.type !== "heavy" ? [`Dex ${fmt(dexPart)}`] : []));
  } else {
    const options: [number, string[]][] = [[10 + dex, ["Base 10", `Dex ${fmt(dex)}`]]];
    if (classNames.includes("barbarian")) options.push([10 + dex + abilityMod(c, "con"), ["Unarmored Defense 10", `Dex ${fmt(dex)}`, `Con ${fmt(abilityMod(c, "con"))}`]]);
    if (classNames.includes("monk") && !shield) options.push([10 + dex + abilityMod(c, "wis"), ["Unarmored Defense 10", `Dex ${fmt(dex)}`, `Wis ${fmt(abilityMod(c, "wis"))}`]]);
    if (c.classes.some((k) => /draconic/i.test(k.subclass?.name ?? ""))) options.push([13 + dex, ["Draconic Resilience 13", `Dex ${fmt(dex)}`]]);
    const best = options.sort((a, b) => b[0] - a[0])[0];
    total = best[0];
    parts.push(...best[1]);
  }
  if (shield) {
    total += shield.data!.armor!.base;
    parts.push(`${shield.name} +${shield.data!.armor!.base}`);
  }
  for (const m of modifiersFor(c, "ac", ...(armor ? ["ac:armored"] : []))) {
    total += m.value;
    parts.push(`${m.source} ${fmt(m.value)}`);
  }
  if (c.acBonus) {
    total += c.acBonus;
    parts.push(`Bonus ${fmt(c.acBonus)}`);
  }
  return {
    total,
    parts,
    stealthDisadvantage: !!armor?.data?.armor?.stealthDisadvantage,
    tooHeavy: !!armor?.data?.armor?.strength && abilityScore(c, "str") < armor.data!.armor!.strength!,
  };
}

export const armorClass = (c: Character) => (c.acMode === "auto" || wildShapeForm(c) ? armorClassBreakdown(c).total : c.armorClass);

/** Attunement slots in use (max 3). */
export const attunedCount = (c: Character) => c.equipment.filter((i) => i.attuned).length;

export const CONDITION_TEXT: Record<string, string> = {
  Blinded: "Can't see; automatically fails checks that require sight. Attacks against you have advantage; your attacks have disadvantage.",
  Charmed: "Can't attack the charmer or target them with harmful abilities. The charmer has advantage on social checks with you.",
  Deafened: "Can't hear; automatically fails checks that require hearing.",
  Frightened: "Disadvantage on ability checks and attacks while the source is in sight. Can't willingly move closer to it.",
  Grappled: "Speed is 0. Ends if the grappler is incapacitated or you're moved out of reach.",
  Incapacitated: "Can't take actions or reactions.",
  Invisible: "Can't be seen without magic. Attacks against you have disadvantage; your attacks have advantage.",
  Paralyzed: "Incapacitated; can't move or speak. Fail Str and Dex saves. Attacks against you have advantage; hits within 5 ft are critical.",
  Petrified: "Turned to stone: incapacitated, unaware, resistant to all damage, immune to poison and disease. Fail Str and Dex saves.",
  Poisoned: "Disadvantage on attack rolls and ability checks.",
  Prone: "Can only crawl. Disadvantage on attacks. Attacks within 5 ft have advantage against you; ranged attacks have disadvantage.",
  Restrained: "Speed 0. Attacks against you have advantage; your attacks have disadvantage. Disadvantage on Dex saves.",
  Stunned: "Incapacitated; can't move; can speak only falteringly. Fail Str and Dex saves. Attacks against you have advantage.",
  Unconscious: "Incapacitated, prone, drops what it's holding. Fail Str and Dex saves. Attacks have advantage; hits within 5 ft are critical.",
};

export const EXHAUSTION_TEXT = [
  "",
  "Disadvantage on ability checks",
  "Speed halved",
  "Disadvantage on attack rolls and saving throws",
  "Hit point maximum halved",
  "Speed reduced to 0",
  "Death",
];

/** Standard actions anyone can take in combat (PHB ch. 9). */
export const STANDARD_ACTIONS: [string, string][] = [
  ["Attack", "Make one melee or ranged attack (more with Extra Attack)."],
  ["Cast a Spell", "Cast a spell with a casting time of 1 action."],
  ["Dash", "Gain extra movement equal to your speed this turn."],
  ["Disengage", "Your movement doesn't provoke opportunity attacks this turn."],
  ["Dodge", "Attacks against you have disadvantage; you have advantage on Dex saves until your next turn."],
  ["Help", "Give an ally advantage on their next ability check or attack against a creature within 5 ft of you."],
  ["Hide", "Make a Dexterity (Stealth) check to hide."],
  ["Ready", "Prepare an action to trigger with your reaction before your next turn."],
  ["Search", "Make a Wisdom (Perception) or Intelligence (Investigation) check."],
  ["Use an Object", "Interact with a second object or use an object that needs an action."],
  ["Grapple / Shove", "Replace one attack: Athletics vs. the target's Athletics or Acrobatics."],
  ["Opportunity Attack (reaction)", "Make one melee attack when a hostile creature leaves your reach."],
  ["Two-Weapon Fighting (bonus)", "Attack with a light weapon in your other hand; no ability modifier to damage unless negative."],
];
