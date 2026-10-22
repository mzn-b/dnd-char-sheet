export const CONTENT_TYPES = [
  "spell",
  "feat",
  "item",
  "race",
  "background",
  "feature",
  "subclass",
  "class",
  "monster",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentSource = "srd" | "open5e" | "5etools" | "homebrew";
export const CONTENT_SOURCES: ContentSource[] = ["srd", "open5e", "5etools", "homebrew"];

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];

/** Values a search result can be filtered or sorted by. */
export type Facets = Record<string, string | number | boolean | string[]>;

/** Lightweight entry used in search results / pickers. */
export interface ContentSummary {
  source: ContentSource;
  key: string;
  type: ContentType;
  name: string;
  /** Spell level (0 = cantrip). */
  level?: number;
  /** Classes that can use this (spells, subclasses). Lowercase class names. */
  classes?: string[];
  /** Short label for where it came from, e.g. "SRD 5.1" or "Xanathar's Guide to Everything". */
  sourceLabel?: string;
  /** Filterable values (school, casting time, ability increases, cost, AC…), see facets.ts. */
  facets?: Facets;
  /** Monsters: creature type ("beast") and special movement ("fly", "swim"…), for Wild Shape filters. */
  creatureType?: string;
  movement?: string[];
  /** Monsters: challenge rating as printed ("1/4"); level holds the numeric value. */
  cr?: string;
}

/** Full entry, normalized across all sources so the UI renders one shape. */
export interface ContentDetail extends ContentSummary {
  description: string;
  prerequisite?: string;
  /** Display facts, e.g. { "Casting Time": "1 action", "Range": "60 feet" }. */
  meta: Record<string, string>;
  /** Monster stat block. */
  monster?: MonsterData;
  /** Spell-specific fields used by the sheet. */
  spell?: { school?: string; ritual?: boolean; concentration?: boolean; dice?: SpellDice };
  /** Fixed, machine-applicable effects, e.g. +2 Dex from a race. */
  effects?: Effect[];
  /** Decisions the player makes when gaining this (Fighting Style, Expertise, Half-Elf +1/+1…). */
  choices?: Choice[];
  /** Structured item data so the sheet can compute AC, attacks and encumbrance. */
  item?: ItemData;
  /** Background personality tables (Personality Trait / Ideal / Bond / Flaw). */
  suggestions?: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
  /** Background starting equipment. */
  startingEquipment?: EquipmentChoice[];
  /** Spells granted automatically (racial magic, domain/oath/circle spells…). */
  grantedSpells?: GrantedSpell[];
}

/** What to roll for a spell, so players rolling physical dice can see it at a glance. */
export interface SpellDice {
  kind: "damage" | "heal";
  /** Dice at the spell's own level, e.g. "8d6". */
  base?: string;
  types?: string[];
  /** Added for each slot level above the spell's level, e.g. "1d6". */
  perSlot?: string;
  /** Explicit dice by slot level (SRD tables). */
  bySlot?: Record<string, string>;
  /** Cantrip dice by character level. */
  byCharacterLevel?: Record<string, string>;
  /** Healing that adds the spellcasting modifier. */
  addModifier?: boolean;
  /** Upcasting stops here (Hail of Thorns: 6d10). */
  max?: string;
  save?: string;
  attack?: "melee" | "ranged";
}

/** Spells a subclass adds to the class's spell list (warlock patrons, Divine Soul…). */
export interface ExpandedSpell {
  spellLevel: number;
  spell: { source: ContentSource; key: string; name: string };
}

export interface ItemData {
  weight?: number;
  armor?: { base: number; type: "light" | "medium" | "heavy" | "shield"; stealthDisadvantage?: boolean; strength?: number };
  weapon?: {
    damage: string;
    damageType: string;
    versatile?: string;
    properties: string[];
    ranged: boolean;
    finesse: boolean;
    range?: string;
    category?: string;
  };
  attunement?: boolean;
  rarity?: string;
  charges?: number;
  /** Numeric effects applied automatically while the item is equipped (and attuned, if required). */
  bonuses?: ItemBonuses;
}

export interface ItemBonuses {
  ac?: number;
  /** Magic weapon bonus to attack and damage rolls with this weapon. */
  weaponAttack?: number;
  weaponDamage?: number;
  save?: number;
  spellAttack?: number;
  spellDc?: number;
  /** Sets an ability score (Belt of Giant Strength); only applies if higher than yours. */
  abilitySet?: Partial<Record<Ability, number>>;
  abilityBonus?: Partial<Record<Ability, number>>;
  speed?: number;
  /** Bonus to all ability checks (Luckstone). */
  check?: number;
}

/**
 * A spell gained automatically. `level` is the character level (races) or class level
 * (subclasses) at which it's gained.
 */
export interface GrantedSpell {
  level: number;
  spell: { source: ContentSource; key: string; name: string };
  mode: "known" | "prepared" | "innate";
  uses?: string;
}

/** Spells to choose from a filtered list (Nature Domain's druid cantrip, Additional Magical Secrets). */
export interface SpellPick {
  /** Class level it's gained at. */
  level: number;
  count: number;
  label: string;
  mode: GrantedSpell["mode"];
  uses?: string;
  options: { source: ContentSource; key: string; name: string }[];
}

/** One of several alternative spell sets (Circle of the Land terrain, Divine Soul affinity, Genie kind). */
export interface SpellVariant {
  name: string;
  grantedSpells: GrantedSpell[];
  spellPicks: SpellPick[];
  expandedSpells: ExpandedSpell[];
}

export type Effect =
  | { kind: "ability"; ability: Ability; amount: number }
  | { kind: "speed"; amount: number }
  | { kind: "skill"; skill: string }
  | { kind: "save"; ability: Ability }
  | { kind: "proficiency"; value: string };

/**
 * A choice inside a feature, feat, race or background. Selections are stored on the
 * character as sub-features of the parent so their text and values stay accessible.
 *  - feature:   pick option(s) that are themselves features (Fighting Style, Metamagic, Invocations)
 *  - expertise: double proficiency in skill(s) you're proficient in
 *  - skill:     gain proficiency in skill(s)
 *  - ability:   increase ability score(s) by `amount`
 *  - save:      gain saving-throw proficiency
 *  - text:      pick a label (Favored Enemy type, Natural Explorer terrain)
 */
export interface Choice {
  id: string;
  label: string;
  kind: "feature" | "expertise" | "skill" | "ability" | "save" | "text";
  count: number;
  options: ChoiceOption[];
  /** For "ability" choices: how much each pick adds. */
  amount?: number;
  /** The same option may be picked up to this many times (e.g. +2 to one ability as two +1 picks). */
  maxPerOption?: number;
}

export interface ChoiceOption {
  key: string;
  name: string;
  /** For feature options whose text is fetched on demand. */
  source?: ContentSource;
  type?: ContentType;
  /** Inline text, when the option isn't a separately fetchable entry. */
  description?: string;
  prerequisite?: string;
}

/** Class progression, normalized across SRD / 5etools / homebrew for the level-up wizard. */
export interface ClassRules {
  source: ContentSource;
  index: string;
  name: string;
  sourceLabel?: string;
  hitDie: number;
  savingThrows: Ability[];
  spellcastingAbility: Ability | null;
  casterType: "full" | "half" | "third" | "pact" | "artificer" | "none";
  spellModel: "known" | "prepared" | "spellbook" | null;
  /** Prepared casters prepare (ability mod + level / divisor) spells. */
  preparedDivisor?: number;
  subclassLevel: number;
  subclassTitle: string;
  subclasses: { source: ContentSource; key: string; name: string; sourceLabel?: string }[];
  proficiencies: string[];
  skillChoices: { count: number; from: string[] } | null;
  multiclass: {
    requirements: { any: boolean; scores: Partial<Record<Ability, number>> } | null;
    proficiencies: string[];
    skillChoices: { count: number; from: string[] } | null;
  };
  startingEquipment: EquipmentChoice[];
  levels: LevelRules[];
}

export interface EquipmentChoice {
  label: string;
  options: { label: string; items: { name: string; qty: number }[] }[];
}

export interface FeatureRef {
  source: ContentSource;
  key: string;
  name: string;
  /** Optional class feature (Tasha's), offered only when the table uses them. */
  optional?: boolean;
  /** The feature an optional one replaces ("Natural Explorer" for Deft Explorer). */
  replaces?: string;
}

export interface LevelRules {
  level: number;
  profBonus: number;
  abilityScoreBonuses: number;
  features: FeatureRef[];
  spellcasting: { cantripsKnown: number; spellsKnown: number | null; slots: number[] } | null;
  /** Options gained by count rather than by a feature (Invocations known, Maneuvers…). */
  progressions: Progression[];
  classSpecific?: Record<string, unknown>;
}

export interface Progression {
  /** Name of the feature the picks belong to, e.g. "Eldritch Invocations". */
  name: string;
  total: number;
  gained: number;
  options: ChoiceOption[];
}

export const SKILL_KEYS = [
  "acrobatics", "animal-handling", "arcana", "athletics", "deception", "history", "insight", "intimidation",
  "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion",
  "sleight-of-hand", "stealth", "survival",
];

export const toSkillKey = (s: string) => s.toLowerCase().replace(/^skill-/, "").replace(/\s+/g, "-");

export const skillName = (key: string) =>
  key.split("-").map((w) => (w === "of" ? w : w[0].toUpperCase() + w.slice(1))).join(" ");

export const expertiseChoice = (id: string, count = 2): Choice => ({
  id,
  label: `Choose ${count} skill proficiencies to gain expertise`,
  kind: "expertise",
  count,
  options: [...SKILL_KEYS.map((k) => ({ key: k, name: skillName(k) })), { key: "thieves-tools", name: "Thieves' Tools" }],
});

/** Slots for a single-classed caster, by caster type and class level (PHB tables). */
const FULL_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function singleClassSlots(type: ClassRules["casterType"], level: number): number[] {
  const effective =
    type === "full" ? level
    : type === "half" ? (level < 2 ? 0 : Math.ceil(level / 2))
    : type === "artificer" ? Math.ceil(level / 2)
    : type === "third" ? (level < 3 ? 0 : Math.ceil(level / 3))
    : 0;
  if (type === "pact") {
    const count = level === 1 ? 1 : level <= 10 ? 2 : level <= 16 ? 3 : 4;
    const slotLevel = Math.min(5, Math.ceil(level / 2));
    return Array.from({ length: 9 }, (_, i) => (i + 1 === slotLevel ? count : 0));
  }
  const row = effective > 0 ? FULL_SLOTS[effective - 1] : [];
  return Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
}

export interface MonsterEntry {
  name: string;
  text: string;
}

/** A stat block normalized across 5etools, the SRD API and Open5e. */
export interface MonsterData {
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acNote?: string;
  hp: number;
  hpFormula?: string;
  speed: Record<string, number>;
  speedNote?: string;
  abilities: Record<Ability, number>;
  saves: Partial<Record<Ability, number>>;
  skills: Record<string, number>;
  senses: string;
  languages: string;
  cr: string;
  vulnerabilities?: string;
  resistances?: string;
  immunities?: string;
  conditionImmunities?: string;
  traits: MonsterEntry[];
  actions: MonsterEntry[];
  bonusActions: MonsterEntry[];
  reactions: MonsterEntry[];
  legendary: MonsterEntry[];
}
