import type { CombatState } from "./combat";

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export type ContentType = "spell" | "feat" | "item" | "race" | "background" | "feature" | "subclass" | "class" | "monster";
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
  /** Filterable values (school, casting time, ability increases, cost, AC, CR…). */
  facets?: Record<string, string | number | boolean | string[]>;
  /** Monsters: printed CR, creature type and special movement (fly, swim…). */
  cr?: string;
  creatureType?: string;
  movement?: string[];
}

export interface ContentDetail extends ContentSummary {
  description: string;
  prerequisite?: string;
  meta: Record<string, string>;
  spell?: { school?: string; ritual?: boolean; concentration?: boolean; dice?: SpellDice };
  effects?: Effect[];
  choices?: Choice[];
  item?: ItemData;
  suggestions?: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
  startingEquipment?: EquipmentChoice[];
  grantedSpells?: GrantedSpell[];
  monster?: MonsterData;
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
  | { kind: "expertise"; skill: string }
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
  /** Expertise choices that also grant the proficiency (Knowledge Domain's Blessings of Knowledge). */
  grantsProficiency?: boolean;
  /** The same option may be picked up to this many times (+2 to one ability = two +1 picks). */
  maxPerOption?: number;
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
  bonuses?: ItemBonuses;
}

/** Numeric bonuses a magic item grants (applied automatically while equipped/attuned). */
export interface ItemBonuses {
  ac?: number;
  weaponAttack?: number;
  weaponDamage?: number;
  save?: number;
  spellAttack?: number;
  spellDc?: number;
  abilitySet?: Partial<Record<Ability, number>>;
  abilityBonus?: Partial<Record<Ability, number>>;
  speed?: number;
  check?: number;
}

/** A user-defined bonus (Bless-like permanent boons, DM rewards…). */
export interface CustomModifier {
  id: string;
  label: string;
  target: string;
  value: number;
}

/** What to roll for a spell (damage or healing), with scaling. */
export interface SpellDice {
  kind: "damage" | "heal";
  base?: string;
  types?: string[];
  perSlot?: string;
  bySlot?: Record<string, string>;
  byCharacterLevel?: Record<string, string>;
  addModifier?: boolean;
  /** Upcasting stops here (Hail of Thorns: 6d10). */
  max?: string;
  save?: string;
  attack?: "melee" | "ranged";
}

/** A spell a subclass adds to its class's list (warlock patrons). */
export interface ExpandedSpell {
  spellLevel: number;
  spell: ContentRef;
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
  /** The subclass, with its chosen spell set where it has alternatives (Land's terrain, Divine Soul's affinity). */
  subclass?: ContentRef & { variant?: string };
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
  /** The inventory weapon this attack uses (for magic weapon bonuses). */
  itemId?: string;
  ranged?: boolean;
  twoHanded?: boolean;
  /** What making this attack costs; default the Attack action. */
  actionType?: "action" | "bonus" | "reaction";
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
  /** Spells the picked option grants (Armor of Shadows: Mage Armor at will). */
  grantedSpells?: GrantedSpell[];
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
  uses?: { max: number; used: number; reset: "short" | "long"; formula?: number | "prof" | Ability };
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
  /** Times cast since the last rest. */
  castCount?: number;
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
  hp: { max: number; current: number; temp?: number };
  speed: string;
  notes: string;
  /** What it is to the character: a Wild Shape form, familiar, steed, summon… */
  role?: CreatureRole;
  ref?: ContentRef;
  /** Stat block captured when added, so it works offline and can be edited. */
  monster?: MonsterData;
}

export type CreatureRole = "wildshape" | "familiar" | "steed" | "companion" | "summon" | "other";

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

export interface LevelRecord {
  classKey: string;
  className: string;
  level: number;
  hpGained: number;
  summary: string[];
  at: string;
  /** The build just before this level, so it can be undone exactly (levels gained since this existed). */
  snapshot?: BuildSnapshot;
}

/** The parts of a character a level-up changes, saved just before it so it can be undone exactly. */
export interface BuildSnapshot {
  classes: Character["classes"];
  abilities: Character["abilities"];
  saveProficiencies: Character["saveProficiencies"];
  skills: Character["skills"];
  proficienciesAndLanguages: string;
  features: Character["features"];
  speed: number;
  hpMax: number;
  spells: Character["spellcasting"]["spells"];
  slotMax: number[];
  pact: { max: number; level: number };
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
  /** Round tracker, action economy and active effects while in combat. */
  combat?: CombatState;
  /** The Wild Shape form currently assumed (a companion with role "wildshape"). */
  wildShape?: { companionId: string } | null;
  /** Extra bonuses typed in by the player. */
  customModifiers?: CustomModifier[];
  /** Ids of automatic modifiers the player switched off. */
  disabledModifiers?: string[];
  /** Optional rules for this character. */
  options?: RuleOptions;
}

/** Optional rules (PHB/DMG/Tasha's variants) a table may or may not use. */
export interface RuleOptions {
  /** Tasha's "Customizing Your Origin": move racial ability increases freely. */
  customOrigin?: boolean;
  /** Tasha's optional class features offered at level-up (default on). */
  optionalClassFeatures?: boolean;
  /** Feats available instead of Ability Score Improvements (default on). */
  feats?: boolean;
  /** "off", PHB "standard" (carrying capacity only) or the PHB "variant" (speed penalties). */
  encumbrance?: "off" | "standard" | "variant";
  /** Enforce multiclass ability score prerequisites (default on). */
  strictMulticlass?: boolean;
  /** How HP is gained at level-up: player's choice, always average, or always rolled. */
  hpMethod?: "choose" | "average" | "roll";
  /** Books (source labels) character options may come from; empty or missing = all enabled books. */
  books?: string[];
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
  features: (ContentRef & { optional?: boolean; replaces?: string })[];
  spellcasting: SpellProgression | null;
  progressions: Progression[];
  classSpecific?: Record<string, unknown>;
}

/** Spells to choose from a filtered list (Nature Domain's druid cantrip, Additional Magical Secrets). */
export interface SpellPick {
  /** Class level it's gained at. */
  level: number;
  count: number;
  label: string;
  mode: GrantedSpell["mode"];
  uses?: string;
  options: ContentRef[];
}

/** One of several alternative spell sets (Circle of the Land terrain, Divine Soul affinity, Genie kind). */
export interface SpellVariant {
  name: string;
  grantedSpells: GrantedSpell[];
  spellPicks: SpellPick[];
  expandedSpells: ExpandedSpell[];
}

export interface SubclassRules {
  grantedSpells?: GrantedSpell[];
  spellPicks?: SpellPick[];
  expandedSpells?: ExpandedSpell[];
  spellVariants?: SpellVariant[];
  spellcastingAbility: Ability | null;
  casterType: CasterType | null;
  spellModel: SpellModel | null;
  levels: { level: number; features: (ContentRef & { optional?: boolean; replaces?: string })[]; progressions: Progression[]; spellcasting: SpellProgression | null }[];
}
