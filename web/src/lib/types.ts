export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export type ContentType = "spell" | "feat" | "item" | "race" | "background" | "feature" | "subclass" | "class";
export type ContentSource = "srd" | "open5e" | "5etools" | "homebrew";

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
  choices?: Choice[];
  item?: ItemData;
  suggestions?: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
  startingEquipment?: EquipmentChoice[];
  grantedSpells?: GrantedSpell[];
  // Homebrew-only extras (class/subclass definitions)
  hitDie?: number;
  spellcastingAbility?: Ability | null;
  subclassLevel?: number;
  casterType?: CasterType;
}

export type Effect =
  | { kind: "ability"; ability: Ability; amount: number }
  | { kind: "speed"; amount: number }
  | { kind: "skill"; skill: string }
  | { kind: "save"; ability: Ability }
  | { kind: "proficiency"; value: string };

/**
 * A decision inside a feature, feat, race or background (Fighting Style, Expertise, +1 to two
 * abilities…). The picks become sub-features of the parent so their text stays on the sheet.
 */
export interface Choice {
  id: string;
  label: string;
  kind: "feature" | "expertise" | "skill" | "ability" | "save" | "text";
  count: number;
  options: ChoiceOption[];
  amount?: number;
}

export interface ChoiceOption {
  key: string;
  name: string;
  source?: ContentSource;
  type?: ContentType;
  description?: string;
  prerequisite?: string;
}

/** Selected option keys per choice id. */
export type Selections = Record<string, string[]>;

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
}

/** A spell gained automatically at a character level (races) or class level (subclasses). */
export interface GrantedSpell {
  level: number;
  spell: ContentRef;
  mode: "known" | "prepared" | "innate";
  uses?: string;
}

export type CasterType = "full" | "half" | "third" | "pact" | "artificer" | "none";
export type SpellModel = "known" | "prepared" | "spellbook";

/** Proficiency in a skill: none, half (Jack of All Trades), proficient, expertise. */
export type ProfLevel = 0 | 0.5 | 1 | 2;

export interface ClassEntry extends ContentRef {
  level: number;
  hitDie: number;
  subclass?: ContentRef;
  spellcastingAbility?: Ability | null;
  casterType?: CasterType;
  spellModel?: SpellModel | null;
  /** Prepared casters prepare (ability mod + level / divisor) spells. */
  preparedDivisor?: number;
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
  /** Requires attunement / currently attuned. */
  attunement?: boolean;
  attuned?: boolean;
  charges?: { max: number; used: number };
  /** Rules data (armor, weapon stats) captured when the item was added. */
  data?: ItemData;
}

/** A choice made inside a feature (a Fighting Style, an Invocation, an expertise skill…). */
export interface SubFeature {
  id: string;
  choiceId: string;
  /** Option key within the choice. */
  key: string;
  name: string;
  description: string;
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
  /** The choices this feature offers, kept so picks can be changed later. */
  choices?: Choice[];
  subfeatures?: SubFeature[];
  /** Fixed effects granted (kept so a race or background can be swapped cleanly). */
  effects?: Effect[];
  /** Spells this feature grants as the character levels (racial magic). */
  grantedSpells?: GrantedSpell[];
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
  /** Set for spells added automatically by a race or subclass, e.g. "race" or "subclass:life". */
  grantedBy?: string;
  /** Limited innate casting, e.g. "1/long rest". */
  uses?: string;
  usesSpent?: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  text: string;
}

export interface Companion {
  id: string;
  name: string;
  kind: string;
  ac: number;
  hp: { max: number; current: number };
  speed: string;
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
  /** Level-ups queued by the character creator, applied one by one with the wizard. */
  pendingLevelUps?: ContentRef[];

  /** "auto" computes AC from equipped armor; "manual" uses armorClass as typed. */
  acMode?: "auto" | "manual";
  /** Extra AC from magic items, spells, Defense fighting style etc. */
  acBonus?: number;
  /** Spent uses of class resources (Rage, Ki…), keyed by resource id. */
  resourcesUsed?: Record<string, number>;
  /** The spell currently being concentrated on. */
  concentration?: { name: string; spellId?: string } | null;
  senses?: string;
  journal?: JournalEntry[];
  companions?: Companion[];
  progression?: "xp" | "milestone";
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
  sourceLabel?: string;
  hitDie: number;
  savingThrows: Ability[];
  spellcastingAbility: Ability | null;
  casterType: CasterType;
  spellModel: SpellModel | null;
  preparedDivisor?: number;
  subclassLevel: number;
  subclassTitle: string;
  subclasses: ContentRef[];
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

export interface SpellProgression {
  cantripsKnown: number;
  spellsKnown: number | null;
  slots: number[];
}

/** Picks gained by count rather than by a feature (Invocations known, Maneuvers…). */
export interface Progression {
  name: string;
  total: number;
  gained: number;
  options: ChoiceOption[];
}

export interface LevelRules {
  level: number;
  profBonus?: number;
  abilityScoreBonuses: number;
  features: ContentRef[];
  spellcasting: SpellProgression | null;
  progressions: Progression[];
  classSpecific?: Record<string, unknown>;
}

export interface SubclassRules {
  grantedSpells?: GrantedSpell[];
  spellcastingAbility: Ability | null;
  casterType: CasterType | null;
  spellModel: SpellModel | null;
  levels: { level: number; features: ContentRef[]; progressions: Progression[]; spellcasting: SpellProgression | null }[];
}
