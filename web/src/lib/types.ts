export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export type ContentType = "spell" | "feat" | "item" | "race" | "background" | "feature" | "subclass" | "class";
export type ContentSource = "srd" | "open5e" | "homebrew";

/** A pointer to a piece of content in the rules API or homebrew store. */
export interface ContentRef {
  source: ContentSource;
  key: string;
  name: string;
}

export interface ContentSummary extends ContentRef {
  type: ContentType;
  level?: number;
  classes?: string[];
  sourceLabel?: string;
}

export interface ContentDetail extends ContentSummary {
  description: string;
  prerequisite?: string;
  meta: Record<string, string>;
  spell?: { school?: string; ritual?: boolean; concentration?: boolean };
  effects?: Effect[];
  // Homebrew-only extras (class/subclass definitions)
  hitDie?: number;
  spellcastingAbility?: Ability | null;
  subclassLevel?: number;
  casterType?: CasterType;
}

export type Effect =
  | { kind: "ability"; ability: Ability; amount: number }
  | { kind: "speed"; amount: number }
  | { kind: "hp-per-level"; amount: number }
  | { kind: "ac"; amount: number }
  | { kind: "proficiency"; value: string };

export type CasterType = "full" | "half" | "third" | "pact" | "none";

/** Proficiency in a skill: none, half (Jack of All Trades), proficient, expertise. */
export type ProfLevel = 0 | 0.5 | 1 | 2;

export interface ClassEntry extends ContentRef {
  level: number;
  hitDie: number;
  subclass?: ContentRef;
  spellcastingAbility?: Ability | null;
  /** Only set for homebrew classes; SRD classes are looked up in rules.ts. */
  casterType?: CasterType;
}

export interface Attack {
  id: string;
  name: string;
  ability: Ability | "none";
  proficient: boolean;
  bonus: number;
  damage: string;
  damageType: string;
  notes: string;
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  weight: number;
  equipped: boolean;
  notes: string;
  ref?: ContentRef & { type: ContentType };
}

export interface Feature {
  id: string;
  name: string;
  /** Where it came from, e.g. "Wizard 2", "Race", "Feat", "Background". */
  origin: string;
  kind: "class" | "subclass" | "race" | "background" | "feat" | "other";
  description: string;
  ref?: ContentRef & { type: ContentType };
  /** Optional limited-use tracking, e.g. Rage 3/long rest. */
  uses?: { max: number; used: number; reset: "short" | "long" };
}

export interface SpellEntry {
  id: string;
  ref: ContentRef;
  level: number;
  /** Which class this spell is cast through (affects DC/attack bonus); undefined = other source. */
  classKey?: string;
  prepared: boolean;
  /** Domain/oath spells etc. that don't count against the prepared limit. */
  alwaysPrepared: boolean;
  notes: string;
}

export interface LevelRecord {
  classKey: string;
  className: string;
  level: number;
  hpGained: number;
  summary: string[];
  at: string;
}

export interface Character {
  id?: string;
  updatedAt?: string;

  // Page 1 header
  name: string;
  playerName: string;
  classes: ClassEntry[];
  race: string;
  raceRef?: ContentRef;
  background: string;
  backgroundRef?: ContentRef;
  alignment: string;
  xp: number;

  // Abilities & proficiencies
  abilities: Record<Ability, number>;
  saveProficiencies: Ability[];
  skills: Record<string, ProfLevel>;
  inspiration: boolean;
  profBonusOverride: number | null;
  proficienciesAndLanguages: string;

  // Combat
  armorClass: number;
  initiativeBonus: number;
  speed: number;
  hp: { max: number; current: number; temp: number };
  hitDiceUsed: Record<string, number>;
  deathSaves: { successes: number; failures: number };
  conditions: string[];
  exhaustion: number;
  attacks: Attack[];

  // Equipment
  equipment: Item[];
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number };

  // Personality
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  features: Feature[];

  // Page 2
  details: {
    age: string;
    height: string;
    weight: string;
    eyes: string;
    skin: string;
    hair: string;
    appearance: string;
    backstory: string;
    allies: string;
    factionName: string;
    additionalFeatures: string;
    treasure: string;
  };
  portraitUrl: string;

  // Page 3
  spellcasting: {
    slots: { max: number; used: number }[];
    pactSlots: { max: number; used: number; level: number };
    spells: SpellEntry[];
  };

  notes: string;
  levelHistory: LevelRecord[];
}

export interface CharacterSummary {
  id: string;
  name: string;
  updated_at: string;
  classes: ClassEntry[] | null;
  race: string | null;
  portraitUrl: string | null;
}

/** Class progression as served by /api/rules/classes/:source/:key */
export interface ClassRules {
  source: ContentSource;
  index: string;
  name: string;
  hitDie: number;
  savingThrows: Ability[];
  spellcastingAbility: Ability | null;
  casterType?: CasterType;
  subclassLevel: number;
  subclasses: ContentRef[];
  levels: LevelRules[];
}

export interface LevelRules {
  level: number;
  profBonus?: number;
  abilityScoreBonuses: number;
  features: ContentRef[];
  spellcasting: { cantripsKnown: number; spellsKnown: number | null; slots: number[] } | null;
  classSpecific?: Record<string, unknown>;
}
