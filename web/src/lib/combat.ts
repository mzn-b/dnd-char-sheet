import { uid } from "./defaults";
import { describeRoll, extractRolls, resolveRoll } from "./rollText";
import { classResources } from "./resources";
import { CONDITION_TEXT, abilityMod, totalLevel } from "./rules";
import type { Character, ContentDetail, SpellEntry } from "./types";
import { featureParts } from "./featureSections";
import { scaledFeatureDice } from "./featureRolls";

export type ReminderWhen = "turnStart" | "attack" | "hit" | "damaged" | "turnEnd" | "always";

export const REMINDER_LABELS: Record<ReminderWhen, string> = {
  turnStart: "Start of your turn",
  attack: "When you attack or save",
  hit: "When you hit",
  damaged: "When you're hit or take damage",
  turnEnd: "End of your turn",
  always: "While active",
};

export interface Reminder {
  when: ReminderWhen;
  text: string;
  source: string;
}

export interface ActiveEffect {
  id: string;
  name: string;
  source: "spell" | "feature" | "action" | "custom";
  startedRound: number;
  /** Rounds it lasts (10 = 1 minute); null = until you end it. */
  rounds: number | null;
  /** Ends at the start of your next turn (Shield, Dodge…). */
  untilNextTurn?: boolean;
  concentration?: boolean;
  reminders: Omit<Reminder, "source">[];
  /** Added to in-app rolls while active, e.g. Bless: attack +1d4. */
  rollBonus?: { attack?: string; save?: string };
}

export interface CombatState {
  active: boolean;
  round: number;
  myTurn: boolean;
  turnsTaken: number;
  initiative?: number;
  economy: {
    action: boolean;
    bonus: boolean;
    reaction: boolean;
    movement: number;
    /** Attacks made with this turn's Attack action (Extra Attack allows more). */
    attacks?: number;
    /** A bonus-action spell was cast this turn. */
    bonusSpell?: boolean;
    /** Level of the spell cast with the action this turn. */
    actionSpellLevel?: number;
    /** A spell was cast as a reaction during your own turn. */
    reactionSpellOnTurn?: boolean;
  };
  effects: ActiveEffect[];
  log: { round: number; text: string }[];
}

const freshEconomy = () => ({ action: false, bonus: false, reaction: false, movement: 0 });

// ---------------------------------------------------------------------------
// Known effects: what to remind you of while they're active.

interface EffectDef {
  match: RegExp;
  /** Display name when activated from the combat panel. */
  label?: string;
  /** Activatable by anyone (standard actions like Dodge). */
  always?: boolean;
  rounds?: number | null;
  untilNextTurn?: boolean;
  reminders: Omit<Reminder, "source">[];
  rollBonus?: ActiveEffect["rollBonus"];
  /** Class resource spent when activated from the combat panel. */
  resource?: string;
  /** Show an "Activate" button when the character has a feature with this name. */
  activatedBy?: RegExp;
}

const rageDamage = (c: Character) => {
  const lvl = c.classes.find((k) => k.name.toLowerCase() === "barbarian")?.level ?? 1;
  return lvl >= 16 ? 4 : lvl >= 9 ? 3 : 2;
};

export const EFFECTS: EffectDef[] = [
  {
    match: /^rage$/i, label: "Rage", rounds: 10, resource: "barbarian:rage", activatedBy: /^rage$/i,
    reminders: [
      { when: "hit", text: "Rage: add the rage damage bonus to Strength melee weapon damage" },
      { when: "always", text: "Rage: resistance to bludgeoning, piercing and slashing damage; advantage on Strength checks and saves; no spellcasting or concentration" },
      { when: "turnEnd", text: "Rage ends unless you attacked a hostile creature or took damage since your last turn" },
    ],
  },
  {
    match: /^reckless attack$/i, label: "Reckless Attack", untilNextTurn: true, activatedBy: /^reckless attack$/i,
    reminders: [
      { when: "attack", text: "Reckless Attack: advantage on Strength melee attacks this turn" },
      { when: "damaged", text: "Reckless Attack: attacks against you have advantage until your next turn" },
    ],
  },
  { match: /^bless$/i, reminders: [{ when: "attack", text: "Bless: add 1d4 to attack rolls and saving throws" }], rollBonus: { attack: "1d4", save: "1d4" } },
  { match: /^bane$/i, reminders: [{ when: "always", text: "Bane: affected enemies subtract 1d4 from attacks and saves" }] },
  { match: /^hex$/i, reminders: [{ when: "hit", text: "Hex: +1d6 necrotic damage to the cursed target" }, { when: "turnStart", text: "Hex: if the target dropped to 0 HP, move the curse with a bonus action" }] },
  { match: /^hunter'?s mark$/i, reminders: [{ when: "hit", text: "Hunter's Mark: +1d6 damage to the marked target with weapon attacks" }, { when: "turnStart", text: "Hunter's Mark: if the target dropped to 0 HP, move the mark with a bonus action" }] },
  { match: /^divine favor$/i, reminders: [{ when: "hit", text: "Divine Favor: +1d4 radiant damage with weapon attacks" }] },
  { match: /^haste$/i, reminders: [{ when: "always", text: "Haste: +2 AC, advantage on Dex saves, speed doubled" }, { when: "turnStart", text: "Haste: one extra action (one weapon attack, Dash, Disengage, Hide or Use an Object)" }, { when: "turnEnd", text: "Haste: if it ends, you can't move or act until after your next turn" }] },
  { match: /^shield$/i, untilNextTurn: true, reminders: [{ when: "always", text: "Shield: +5 AC (including against the triggering attack); no damage from Magic Missile" }] },
  { match: /^shield of faith$/i, reminders: [{ when: "always", text: "Shield of Faith: +2 AC" }] },
  { match: /^spiritual weapon$/i, reminders: [{ when: "turnStart", text: "Spiritual Weapon: bonus action to move it 20 ft and attack (melee spell attack, 1d8 + mod force)" }] },
  { match: /^spirit guardians$/i, reminders: [{ when: "always", text: "Spirit Guardians: enemies within 15 ft have half speed; Wis save for 3d8 when they enter or start their turn there" }] },
  { match: /^moonbeam$/i, reminders: [{ when: "turnStart", text: "Moonbeam: action to move the beam up to 60 ft" }] },
  { match: /^flaming sphere$/i, reminders: [{ when: "turnStart", text: "Flaming Sphere: bonus action to move it 30 ft (ram for Dex save, 2d6 fire)" }] },
  { match: /^heat metal$/i, reminders: [{ when: "turnStart", text: "Heat Metal: bonus action to deal 2d8 fire again" }] },
  { match: /^witch bolt$/i, reminders: [{ when: "turnStart", text: "Witch Bolt: action to deal 1d12 lightning automatically (doing anything else with your action ends it)" }] },
  { match: /^vampiric touch$/i, reminders: [{ when: "turnStart", text: "Vampiric Touch: action to make the touch attack again" }] },
  { match: /^call lightning$/i, reminders: [{ when: "turnStart", text: "Call Lightning: action to call another bolt (3d10 lightning, Dex save)" }] },
  { match: /^heroism$/i, reminders: [{ when: "turnStart", text: "Heroism: gain temporary HP equal to your spellcasting modifier; immune to frightened" }] },
  { match: /^faerie fire$/i, reminders: [{ when: "attack", text: "Faerie Fire: attacks against outlined creatures have advantage" }] },
  { match: /^blur$/i, reminders: [{ when: "always", text: "Blur: attackers have disadvantage against you (unless they don't rely on sight)" }] },
  { match: /^mirror image$/i, rounds: 10, reminders: [{ when: "damaged", text: "Mirror Image: roll d20 to see if a duplicate is hit instead" }] },
  { match: /^protection from evil and good$/i, reminders: [{ when: "always", text: "Protection from Evil and Good: aberrations, celestials, elementals, fey, fiends and undead have disadvantage to attack the target" }] },
  { match: /^(greater )?invisibility$/i, reminders: [{ when: "attack", text: "Invisible: advantage on your attacks; attacks against you have disadvantage" }] },
  { match: /^enlarge\/reduce$/i, reminders: [{ when: "hit", text: "Enlarged: +1d4 weapon damage (reduced: −1d4)" }] },
  { match: /^armor of agathys$/i, reminders: [{ when: "damaged", text: "Armor of Agathys: melee attacker takes cold damage while you have the temp HP" }] },
  // Ranger and smite-style spells: the effect waits for your next hit.
  { match: /^hail of thorns$/i, reminders: [{ when: "hit", text: "Hail of Thorns: on your next ranged weapon hit, creatures within 5 ft of the target make a Dex save (1d10 piercing, +1d10 per slot above 1st, max 6d10; half on a success)" }] },
  { match: /^ensnaring strike$/i, reminders: [{ when: "hit", text: "Ensnaring Strike: on your next weapon hit, the target makes a Str save or is restrained (1d6 piercing at the start of each of its turns)" }] },
  { match: /^searing smite$/i, reminders: [{ when: "hit", text: "Searing Smite: on your next melee weapon hit, +1d6 fire and the target ignites (Con save at the start of each of its turns or 1d6 fire)" }] },
  { match: /^zephyr strike$/i, reminders: [{ when: "attack", text: "Zephyr Strike: no opportunity attacks; once, advantage on a weapon attack that deals +1d8 force on a hit and gives +30 ft speed this turn" }] },
  { match: /^lightning arrow$/i, reminders: [{ when: "hit", text: "Lightning Arrow: the next ranged weapon attack deals 4d8 lightning (half on a miss) instead of its damage; creatures within 10 ft make a Dex save for 2d8 lightning. +1d8 to both per slot above 3rd" }] },
  { match: /^flame arrows$/i, reminders: [{ when: "hit", text: "Flame Arrows: ammunition from the quiver deals +1d6 fire on a hit (12 pieces)" }] },
  { match: /^elemental weapon$/i, reminders: [{ when: "attack", text: "Elemental Weapon: +1 to attack rolls with the weapon (+2 with a 5th–6th-level slot, +3 with 7th+)" }, { when: "hit", text: "Elemental Weapon: +1d4 damage of the chosen type (2d4 with a 5th–6th-level slot, 3d4 with 7th+)" }] },
  { match: /^guardian of nature$/i, reminders: [{ when: "attack", text: "Guardian of Nature — Primal Beast: advantage on Str melee attacks, +1d6 force on a melee weapon hit, +10 ft speed, darkvision 120 ft. Great Tree: advantage on Dex/Wis attacks, Con saves; 10 temp HP" }] },
  { match: /^branding smite$/i, reminders: [{ when: "hit", text: "Branding Smite: on your next weapon hit, +2d6 radiant (+1d6 per slot above 2nd) and the target sheds light, can't be invisible" }] },
  { match: /^(thunderous|wrathful|blinding|staggering|banishing) smite$/i, reminders: [{ when: "hit", text: "Smite: the extra damage and effect apply to your next melee weapon hit" }] },
  { match: /^absorb elements$/i, untilNextTurn: true, reminders: [{ when: "damaged", text: "Absorb Elements: resistance to the triggering damage type until the start of your next turn" }, { when: "hit", text: "Absorb Elements: your first melee hit on your next turn deals +1d6 of the absorbed type (+1d6 per slot above 1st)" }] },
  { match: /^(dodge)$/i, label: "Dodge", always: true, untilNextTurn: true, reminders: [{ when: "always", text: "Dodging: attacks against you have disadvantage, advantage on Dex saves" }] },
  { match: /^wild shape$/i, label: "Wild Shape", rounds: null, resource: "druid:wildshape", activatedBy: /^wild shape$/i, reminders: [{ when: "always", text: "Wild Shape: use the beast's stats; revert at 0 HP (excess damage carries over)" }] },
  { match: /^bladesong$/i, label: "Bladesong", rounds: 10, activatedBy: /^bladesong$/i, reminders: [{ when: "always", text: "Bladesong: +INT to AC (applied), +10 ft speed (applied), advantage on Acrobatics, +INT to concentration saves; ends in medium/heavy armor, with a shield or a two-handed attack" }] },
  {
    match: /^hexblade'?s curse$/i, label: "Hexblade's Curse", rounds: 10, activatedBy: /^hexblade'?s curse$/i,
    reminders: [
      { when: "hit", text: "Hexblade's Curse: +proficiency bonus damage against the cursed target; crit on 19–20 against it" },
      { when: "always", text: "Hexblade's Curse: if the cursed target dies, regain HP equal to your warlock level + CHA modifier (min 1)" },
    ],
  },
  { match: /^patient defense$/i, label: "Patient Defense", untilNextTurn: true, resource: "monk:ki", activatedBy: /^patient defense$/i, reminders: [{ when: "always", text: "Patient Defense: Dodging until your next turn" }] },
  { match: /^action surge$/i, label: "Action Surge", untilNextTurn: true, resource: "fighter:actionsurge", activatedBy: /^action surge$/i, reminders: [{ when: "always", text: "Action Surge: take one additional action this turn" }] },
  { match: /^sacred weapon$/i, label: "Sacred Weapon", rounds: 10, activatedBy: /sacred weapon/i, resource: "paladin:channel", reminders: [{ when: "attack", text: "Sacred Weapon: add your Charisma modifier to attack rolls with the weapon" }] },
];

const picks = (c: Character, feature: RegExp) =>
  c.features.find((f) => feature.test(f.name))?.subfeatures?.map((s) => s.name).join(", ") || "none chosen";
const superiorityDie = (c: Character) => {
  const lvl = c.classes.find((k) => k.name === "Fighter")?.level ?? 3;
  return lvl >= 18 ? "d12" : lvl >= 10 ? "d10" : "d8";
};

/** Things you can always do or should remember, based on features, feats and spells you have. */
const PASSIVES: { match: RegExp; when: ReminderWhen; text: (c: Character) => string }[] = [
  { match: /^maneuvers$/i, when: "hit", text: (c) => `Maneuvers (spend a superiority die, ${superiorityDie(c)}): ${picks(c, /^maneuvers$/i)}` },
  { match: /^metamagic/i, when: "turnStart", text: (c) => `Metamagic (sorcery points): ${picks(c, /^metamagic/i)}` },
  { match: /^agonizing blast$/i, when: "hit", text: (c) => `Agonizing Blast: add +${Math.max(0, abilityMod(c, "cha"))} (Cha) to each Eldritch Blast beam's damage` },
  { match: /^repelling blast$/i, when: "hit", text: () => "Repelling Blast: push the target 10 ft with each Eldritch Blast beam" },
  { match: /^sneak attack$/i, when: "hit", text: (c) => `Sneak Attack: +${Math.ceil((c.classes.find((k) => k.name === "Rogue")?.level ?? 1) / 2)}d6 once per turn (advantage, or an ally next to the target; finesse/ranged weapon)` },
  { match: /^divine smite$/i, when: "hit", text: () => "Divine Smite: on a melee hit, spend a slot for 2d8 radiant (+1d8 per slot above 1st, max 5d8; +1d8 vs undead/fiends)" },
  { match: /^great weapon master$/i, when: "attack", text: () => "Great Weapon Master: −5 to hit / +10 damage with a heavy weapon; bonus-action attack after a crit or a kill" },
  { match: /^sharpshooter$/i, when: "attack", text: () => "Sharpshooter: −5 to hit / +10 damage; no disadvantage at long range; ignore half and three-quarters cover" },
  { match: /^extra attack/i, when: "turnStart", text: (c) => `Extra Attack: the Attack action makes ${(c.classes.find((k) => k.name === "Fighter")?.level ?? 0) >= 20 ? 4 : (c.classes.find((k) => k.name === "Fighter")?.level ?? 0) >= 11 ? 3 : 2} attacks` },
  { match: /^cunning action$/i, when: "turnStart", text: () => "Cunning Action: bonus action to Dash, Disengage or Hide" },
  { match: /^martial arts$/i, when: "turnStart", text: () => "Martial Arts: bonus-action unarmed strike after taking the Attack action" },
  { match: /^flurry of blows$/i, when: "turnStart", text: () => "Ki: Flurry of Blows (2 unarmed strikes), Patient Defense (Dodge) or Step of the Wind (Dash/Disengage) as a bonus action" },
  { match: /^stunning strike$/i, when: "hit", text: () => "Stunning Strike: spend 1 ki on a melee hit, target makes a Con save or is stunned" },
  { match: /^uncanny dodge$/i, when: "damaged", text: () => "Uncanny Dodge: reaction to halve an attack's damage" },
  { match: /^lucky$/i, when: "attack", text: () => "Lucky: spend a luck point to roll another d20" },
  { match: /^polearm master$/i, when: "turnStart", text: () => "Polearm Master: bonus-action butt-end attack (1d4); opportunity attack when enemies enter your reach" },
  { match: /^sentinel$/i, when: "always", text: () => "Sentinel: opportunity attacks reduce speed to 0; react when an enemy attacks an ally next to you" },
  { match: /^war caster$/i, when: "damaged", text: () => "War Caster: advantage on concentration saves" },
  { match: /^crossbow expert$/i, when: "turnStart", text: () => "Crossbow Expert: bonus-action hand crossbow attack after attacking with a one-handed weapon" },
  { match: /^second wind$/i, when: "turnStart", text: (c) => `Second Wind: bonus action to heal 1d10 + ${c.classes.find((k) => k.name === "Fighter")?.level ?? 1}` },
  { match: /^bardic inspiration$/i, when: "turnStart", text: () => "Bardic Inspiration: bonus action to give an ally an inspiration die" },
  { match: /^channel divinity/i, when: "turnStart", text: () => "Channel Divinity available" },
  { match: /^relentless rage$/i, when: "damaged", text: () => "Relentless Rage: if you drop to 0 HP while raging, Con save (DC 10, +5 each use) to stay at 1 HP" },
  { match: /^evasion$/i, when: "damaged", text: () => "Evasion: Dex save for half damage → none on success, half on failure" },
  { match: /^savage attacks?$/i, when: "hit", text: () => "Savage Attacks: on a melee crit, roll one weapon damage die an extra time" },
  { match: /^relentless endurance$/i, when: "damaged", text: () => "Relentless Endurance: drop to 1 HP instead of 0 (once per long rest)" },
  { match: /^hellish resistance$/i, when: "damaged", text: () => "Resistance to fire damage" },
  { match: /^great weapon fighting$/i, when: "hit", text: () => "Great Weapon Fighting: reroll 1s and 2s on two-handed weapon damage" },
  { match: /^dueling$/i, when: "hit", text: () => "Dueling: +2 damage with a one-handed melee weapon and no other weapon" },
  { match: /^archery$/i, when: "attack", text: () => "Archery: +2 to ranged weapon attack rolls" },
  { match: /^dreadful strikes$/i, when: "hit", text: (c) => `Dreadful Strikes: +${scaledFeatureDice(c, "Dreadful Strikes") ?? "1d4"} psychic damage on a weapon hit (once per turn per creature)` },
  { match: /^colossus slayer$/i, when: "hit", text: () => "Colossus Slayer: +1d8 damage once per turn if the target is below its hit point maximum" },
  { match: /^dread ambusher$/i, when: "turnStart", text: () => "Dread Ambusher (first turn): +10 ft speed, and one extra weapon attack this turn that deals +1d8 on a hit" },
  { match: /^planar warrior$/i, when: "turnStart", text: (c) => `Planar Warrior: bonus action to mark a creature; your next weapon hit on it this turn deals +${scaledFeatureDice(c, "Planar Warrior") ?? "1d8"} force` },
  { match: /^favored foe$/i, when: "hit", text: (c) => `Favored Foe: mark the creature on a hit (concentration); +${scaledFeatureDice(c, "Favored Foe") ?? "1d4"} damage once per turn while marked` },
  { match: /^gathered swarm$/i, when: "hit", text: (c) => `Gathered Swarm: once per turn after you hit, the swarm deals +${scaledFeatureDice(c, "Gathered Swarm") ?? "1d6"} piercing, pushes 15 ft (Str save), or moves you 5 ft` },
];

/** Trigger phrases in rules text, for features and spells without a hand-written reminder. */
const TRIGGERS: { when: ReminderWhen; re: RegExp }[] = [
  { when: "hit", re: /\b(?:when|whenever|once (?:on each of your turns|per turn) when|the (?:first|next) time)\b[^.]{0,60}?\byou hit\b|\bhits? (?:a|the) (?:creature|target)[^.]{0,30} with (?:a|an) (?:weapon|melee|ranged)[^.]{0,20}attack\b/i },
  { when: "damaged", re: /\bwhen (?:you take damage|a creature hits you|an attacker[^.]{0,30}hits you|you are hit)\b/i },
  { when: "turnStart", re: /\bat the start of (?:each of )?your turns?\b/i },
  { when: "turnEnd", re: /\bat the end of (?:each of )?your turns?\b/i },
];

/** The first sentence of a text that matches a trigger, shortened for a reminder. */
function triggerSentence(text: string, re: RegExp): string | undefined {
  const plain = text.replace(/\*\*?|_/g, "").replace(/\s+/g, " ");
  const sentence = plain.split(/(?<=[.!?])\s+/).find((x) => re.test(x));
  if (!sentence) return undefined;
  return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
}

/** Spells that add damage when you hit: the smites, Hunter's Mark, Hex, Hail of Thorns… */
const ON_HIT_SPELL = /\b(?:the next time you hit|the first time you hit|whenever you hit|you hit (?:the|a) (?:creature|target)[^.]{0,40}with (?:a|an) (?:weapon|melee weapon|ranged weapon) attack|when you hit (?:it|a creature|the target)|the next time you make a ranged weapon attack|(?:is )?hit by a ranged weapon attack|extra \d+d\d+ \w+ damage on a hit)\b/i;

/** Has a feature, chosen option, feature section or named paragraph ("**Sacred Weapon.**" inside Channel Divinity). */
function hasFeature(c: Character, re: RegExp) {
  return featureParts(c).some((p) => re.test(p.name)) || c.features.some((f) => [...(f.description ?? "").matchAll(/\*\*([^*\n]{2,60}?)\.\*\*/g)].some((m) => re.test(m[1].trim())));
}

/** Rounds for a spell duration: "Concentration, up to 1 minute" → 10. Null for instantaneous. */
export function durationRounds(duration?: string): number | null | undefined {
  if (!duration) return undefined;
  const d = duration.toLowerCase();
  if (/instantaneous/.test(d)) return undefined;
  const m = d.match(/(\d+)\s*(round|minute|hour|day)/);
  if (!m) return /until dispelled|special/.test(d) ? null : undefined;
  const n = Number(m[1]);
  return m[2] === "round" ? n : m[2] === "minute" ? n * 10 : m[2] === "hour" ? n * 600 : n * 14400;
}

/**
 * Reminders for an effect without a catalog entry, read from its text: repeated actions
 * ("on each of your turns", "as a bonus action") and on-hit extras ("whenever you hit").
 */
function genericReminders(name: string, text: string, characterLevel: number): Omit<Reminder, "source">[] {
  const out: Omit<Reminder, "source">[] = [];
  for (const sentence of text.replace(/\*\*/g, "").split(/(?<=[.!?])\s+/)) {
    if (/on each of your (?:subsequent )?turns|as a bonus action on your turn|until the spell ends, you can use|you can use (?:a bonus action|an action) on each/i.test(sentence)) {
      out.push({ when: "turnStart", text: `${name}: ${sentence.trim().slice(0, 160)}` });
    }
  }
  for (const r of extractRolls(text)) {
    if (r.timing === "whenever you hit") out.push({ when: "hit", text: `${name}: ${describeRoll(r, resolveRoll(r, { characterLevel }))}` });
  }
  return out.slice(0, 3);
}

/** Effect for a spell that was just cast, or undefined when nothing lasts. */
export function effectForSpell(c: Character, spell: SpellEntry, detail?: ContentDetail): ActiveEffect | undefined {
  const def = EFFECTS.find((e) => e.match.test(spell.ref.name));
  const rounds = def?.rounds !== undefined ? def.rounds : durationRounds(detail?.meta.Duration);
  const concentration = !!detail?.spell?.concentration;
  if (rounds === undefined && !def?.untilNextTurn && !concentration) return undefined;
  const reminders = def?.reminders ?? genericReminders(spell.ref.name, detail?.description ?? "", totalLevel(c));
  return {
    id: uid(),
    name: spell.ref.name,
    source: "spell",
    startedRound: c.combat?.round ?? 0,
    rounds: def?.untilNextTurn ? null : rounds ?? null,
    untilNextTurn: def?.untilNextTurn,
    concentration,
    reminders: reminders.length ? reminders : [{ when: "always", text: `${spell.ref.name} is active` }],
    rollBonus: def?.rollBonus,
  };
}

/** Features you can switch on from the combat panel (Rage, Wild Shape, Reckless Attack…). */
export function activatableEffects(c: Character) {
  const resources = classResources(c);
  return EFFECTS.filter((e) => e.label && (e.always || (e.activatedBy && hasFeature(c, e.activatedBy)))).map((e) => {
    const res = e.resource ? resources.find((r) => r.id === e.resource) : undefined;
    const left = res ? res.max - (c.resourcesUsed?.[res.id] ?? 0) : undefined;
    return { def: e, name: e.label!, resource: res, left };
  });
}

export type { EffectDef };

export function activateEffect(d: Character, def: EffectDef, name: string) {
  if (!d.combat) return;
  if (def.resource) d.resourcesUsed = { ...d.resourcesUsed, [def.resource]: (d.resourcesUsed?.[def.resource] ?? 0) + 1 };
  addEffect(d, {
    id: uid(), name, source: "feature", startedRound: d.combat.round,
    rounds: def.untilNextTurn ? null : def.rounds ?? null, untilNextTurn: def.untilNextTurn,
    reminders: def.reminders.map((r) => {
      if (name === "Rage" && r.when === "hit") return { ...r, text: `Rage: +${rageDamage(d)} damage on Strength melee weapon attacks` };
      // Persistent Rage (barbarian 15): it only ends if you fall unconscious or choose to end it.
      if (name === "Rage" && r.when === "turnEnd" && classLevel(d, "barbarian") >= 15) return { ...r, text: "Persistent Rage: your rage ends early only if you fall unconscious or choose to end it" };
      return r;
    }),
    rollBonus: def.rollBonus,
  });
  // Action Surge: one more action this turn.
  if (name === "Action Surge") {
    d.combat.economy.action = false;
    d.combat.economy.attacks = 0;
  }
}

const classLevel = (c: Character, name: string) => c.classes.find((k) => k.name.toLowerCase() === name)?.level ?? 0;

export function addEffect(d: Character, effect: ActiveEffect) {
  if (!d.combat) return;
  // Only one concentration effect at a time; recasting a spell refreshes it.
  d.combat.effects = d.combat.effects.filter((e) => e.name !== effect.name && !(effect.concentration && e.concentration));
  d.combat.effects.push(effect);
  d.combat.log.push({ round: d.combat.round, text: `${effect.name} started` });
}

export function endEffect(d: Character, id: string) {
  const e = d.combat?.effects.find((x) => x.id === id);
  if (!e || !d.combat) return;
  d.combat.effects = d.combat.effects.filter((x) => x.id !== id);
  if (e.concentration && d.concentration?.name === e.name) d.concentration = null;
  d.combat.log.push({ round: d.combat.round, text: `${e.name} ended` });
}

/** Rounds left, counting the current one; null for open-ended effects. */
export const roundsLeft = (c: Character, e: ActiveEffect) => (e.rounds == null ? null : e.startedRound + e.rounds - (c.combat?.round ?? 0));

// ---------------------------------------------------------------------------
// Turn flow

export function startCombat(d: Character, initiative?: number) {
  d.combat = { active: true, round: 1, myTurn: false, turnsTaken: 0, initiative, economy: freshEconomy(), effects: [], log: [{ round: 1, text: "Combat started" }] };
  // A concentration spell cast before combat carries over.
  if (d.concentration) {
    d.combat.effects.push({ id: uid(), name: d.concentration.name, source: "spell", startedRound: 1, rounds: null, concentration: true, reminders: [{ when: "always", text: `Concentrating on ${d.concentration.name}` }] });
  }
}

export function endCombat(d: Character) {
  d.combat = undefined;
}

/** Start your turn: next round (after your first turn), fresh action economy, expire effects. */
export function startTurn(d: Character): string[] {
  const s = d.combat;
  if (!s) return [];
  if (s.turnsTaken > 0) s.round += 1;
  s.turnsTaken += 1;
  s.myTurn = true;
  s.economy = freshEconomy();
  const ended: string[] = [];
  for (const e of [...s.effects]) {
    // Anything lasting "until your next turn" was started before this turn (even before your first one).
    const expired = e.untilNextTurn || (e.rounds != null && s.round >= e.startedRound + e.rounds);
    if (expired) {
      endEffect(d, e.id);
      ended.push(e.name);
    }
  }
  s.log.push({ round: s.round, text: "Your turn" });
  return ended;
}

export function endTurn(d: Character) {
  if (!d.combat) return;
  d.combat.myTurn = false;
  d.combat.log.push({ round: d.combat.round, text: "Turn ended" });
}

// ---------------------------------------------------------------------------
// Reminders

/**
 * All reminders right now: active effects, features you have, reaction spells you know,
 * conditions and concentration.
 */
export function reminders(c: Character, spellDetails: Record<string, ContentDetail | undefined> = {}): Reminder[] {
  const out: Reminder[] = [];
  for (const e of c.combat?.effects ?? []) for (const r of e.reminders) out.push({ ...r, source: e.name });
  const handled = new Set<string>();
  // Features, chosen options and the feature sections inside them (Dreadful Strikes inside "Fey Wanderer").
  const parts = featureParts(c);
  const activeNames = new Set((c.combat?.effects ?? []).map((e) => e.name.toLowerCase()));
  for (const p of PASSIVES) {
    const part = parts.find((x) => p.match.test(x.name));
    // An active effect of the same name (Favored Foe in use) brings its own reminder.
    if (part && activeNames.has(part.name.toLowerCase())) handled.add(part.name.toLowerCase());
    else if (part) {
      out.push({ when: p.when, text: p.text(c), source: part.name });
      handled.add(part.name.toLowerCase());
    }
  }
  // Every other one whose text names a trigger ("when you hit…", "at the start of your turn…").
  const effectNames = new Set((c.combat?.effects ?? []).map((e) => e.name.toLowerCase()));
  for (const part of parts) {
    const name = part.name.toLowerCase();
    if (handled.has(name) || effectNames.has(name) || EFFECTS.some((e) => e.match.test(part.name))) continue;
    for (const t of TRIGGERS) {
      const sentence = triggerSentence(part.text, t.re);
      if (sentence) {
        // Dice that grow with level (Divine Strike 1d8 → 2d8) show their current value.
        const scaled = scaledFeatureDice(c, part.name);
        out.push({ when: t.when, text: `${part.name}: ${scaled ? sentence.replace(/\b\d+d\d+\b/, scaled) : sentence}`, source: part.name });
        handled.add(name);
        break;
      }
    }
  }
  // Spells you can cast that add damage on a hit: remind before attacking (once cast, their effect reminds on hit).
  for (const s of c.spellcasting.spells) {
    const d = spellDetails[s.id];
    if (!d || effectNames.has(s.ref.name.toLowerCase())) continue;
    if (!(s.level === 0 || s.prepared || s.alwaysPrepared || s.uses || !s.classKey)) {
      const cls = c.classes.find((k) => k.key === s.classKey);
      if (cls?.spellModel && cls.spellModel !== "known") continue; // unprepared
    }
    const text = d.description ?? "";
    // Reaction spells (Absorb Elements) are cast in response to something else, not before an attack.
    if (!ON_HIT_SPELL.test(text) || /reaction/i.test(d.meta["Casting Time"] ?? "")) continue;
    const roll = extractRolls(text).find((r) => r.kind === "damage");
    const dice = roll ? resolveRoll(roll, { spellLevel: s.level, slotLevel: s.level, characterLevel: totalLevel(c) }) : undefined;
    const ct = d.meta["Casting Time"] ?? "";
    const cost = /bonus/i.test(ct) ? "bonus action" : /reaction/i.test(ct) ? "reaction" : "action";
    out.push({
      when: "attack",
      text: `${s.ref.name} available (${cost}${s.level ? `, ${s.level === 1 ? "1st" : s.level === 2 ? "2nd" : s.level === 3 ? "3rd" : `${s.level}th`}-level slot` : ""})${dice ? `: +${dice}${roll?.type ? ` ${roll.type}` : ""} on a hit` : ""}`,
      source: s.ref.name,
    });
  }
  // Reaction spells: remind when they could trigger.
  for (const s of c.spellcasting.spells) {
    const ct = spellDetails[s.id]?.meta["Casting Time"] ?? "";
    if (!/reaction/i.test(ct)) continue;
    const trigger = ct.replace(/^1 reaction,?\s*(which you take )?/i, "");
    out.push({ when: /damage|hit/i.test(trigger) ? "damaged" : "always", text: `${s.ref.name} (reaction${trigger ? `: ${trigger}` : ""})`, source: s.ref.name });
  }
  for (const cond of c.conditions) out.push({ when: "always", text: `${cond}: ${CONDITION_TEXT[cond] ?? ""}`, source: cond });
  if (c.concentration) {
    out.push({ when: "damaged", text: `Concentration on ${c.concentration.name}: Con save, DC 10 or half the damage (whichever is higher)`, source: "Concentration" });
  }
  if (c.hp.current <= 0) out.push({ when: "turnStart", text: "You're at 0 HP: make a death saving throw", source: "Dying" });
  return out;
}

/** In-app roll bonuses from active effects ("+1d4" from Bless), with their names. */
export function activeRollBonus(c: Character, kind: "attack" | "save"): { dice: string; names: string[] } | null {
  const effects = (c.combat?.effects ?? []).filter((e) => e.rollBonus?.[kind]);
  if (!effects.length) return null;
  return { dice: effects.map((e) => e.rollBonus![kind]!).join("+"), names: effects.map((e) => e.name) };
}
