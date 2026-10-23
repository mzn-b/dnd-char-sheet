import { ABILITIES, type Ability, type Attack, type Character, type Item, type ItemBonuses } from "./types";
import { infusionBonuses } from "./infusions";

/** Numeric item bonuses added together (ability maps are merged). */
function sumBonuses(a: ItemBonuses | undefined, b: ItemBonuses | undefined): ItemBonuses {
  const out: ItemBonuses = { ...a };
  for (const [k, v] of Object.entries(b ?? {}) as [keyof ItemBonuses, ItemBonuses[keyof ItemBonuses]][]) {
    if (typeof v === "number") (out as Record<string, number>)[k] = ((out as Record<string, number | undefined>)[k] ?? 0) + v;
    else if (v) (out as Record<string, unknown>)[k] = { ...(out[k] as object), ...v };
  }
  return out;
}
import { featureParts } from "./featureSections";

/**
 * Automatic bonuses from equipped magic items, feats and class/race features, plus the
 * player's own custom modifiers. Each modifier has a stable id so it can be switched off.
 *
 * Targets: ac, ac:armored, initiative, speed, save, save:<ab>, check, skill:<key>,
 * passive:<skill>, attack, attack:melee, attack:ranged, damage, damage:melee, spellAttack,
 * spellDc, hp, ability:<ab>, abilitySet:<ab>, halfProf, halfProfPhysical, medArmorDex.
 * Item-linked weapon bonuses use weaponAttack/weaponDamage with itemId.
 */
export interface Modifier {
  id: string;
  target: string;
  value: number;
  source: string;
  /** For weapon bonuses: only attacks made with this item. */
  itemId?: string;
  /** Optional condition shown to the player. */
  note?: string;
  kind: "item" | "feature" | "custom";
}

export const MODIFIER_TARGETS: { value: string; label: string }[] = [
  { value: "ac", label: "Armor Class" },
  { value: "initiative", label: "Initiative" },
  { value: "speed", label: "Speed (ft)" },
  { value: "save", label: "All saving throws" },
  ...ABILITIES.map((a) => ({ value: `save:${a}`, label: `${a.toUpperCase()} saving throw` })),
  { value: "check", label: "All ability checks" },
  ...ABILITIES.map((a) => ({ value: `check:${a}`, label: `${a.toUpperCase()} checks (incl. skills)` })),
  { value: "attack", label: "Weapon attack rolls" },
  { value: "damage", label: "Weapon damage rolls" },
  { value: "spellAttack", label: "Spell attack bonus" },
  { value: "spellDc", label: "Spell save DC" },
  { value: "hp", label: "Hit point maximum" },
  ...ABILITIES.map((a) => ({ value: `ability:${a}`, label: `${a.toUpperCase()} score` })),
  { value: "passive:perception", label: "Passive Perception" },
  { value: "passive:investigation", label: "Passive Investigation" },
  { value: "passive:insight", label: "Passive Insight" },
];

export const targetLabel = (t: string) =>
  MODIFIER_TARGETS.find((x) => x.value === t)?.label ??
  ({ "ac:armored": "AC while wearing armor", "attack:ranged": "Ranged weapon attacks", "attack:melee": "Melee weapon attacks", "damage:melee": "Melee weapon damage", weaponAttack: "Attacks with this weapon", weaponDamage: "Damage with this weapon", halfProf: "Half proficiency on unproficient checks", halfProfPhysical: "Half proficiency (rounded up) on Str/Dex/Con checks", medArmorDex: "Medium armor Dex cap" } as Record<string, string>)[t] ??
  (t.startsWith("abilitySet:") ? `${t.slice(11).toUpperCase()} score becomes` : t.startsWith("skill:") ? `${t.slice(6)} checks` : t);

const classLevel = (c: Character, name: string) => c.classes.find((k) => k.name.toLowerCase() === name)?.level ?? 0;
const totalLevel = (c: Character) => c.classes.reduce((s, k) => s + k.level, 0);

/** Whether a magic item's bonuses are active: equipped (weapons when wielded) and attuned if required. */
export const itemActive = (i: Item) => (!i.attunement || !!i.attuned) && (i.equipped || !!i.data?.weapon);

function itemModifiers(c: Character): Modifier[] {
  const out: Modifier[] = [];
  for (const i of c.equipment) {
    // An infusion's bonuses stack with the item's own (an infused +1 weapon).
    const inf = infusionBonuses(c, i);
    const own = i.data?.bonuses;
    const b: ItemBonuses | undefined = own || inf ? sumBonuses(own, inf) : undefined;
    if (!b || !itemActive(i)) continue;
    const add = (target: string, value: number | undefined, extra: Partial<Modifier> = {}) => {
      if (value) out.push({ id: `item:${i.id}:${target}`, target, value, source: i.infusion ? `${i.name} (${i.infusion.name})` : i.name, kind: "item", ...extra });
    };
    // Bonuses that only matter while worn need the item equipped; weapon bonuses apply when attacking with it.
    if (i.equipped) {
      add("ac", b.ac);
      add("save", b.save);
      add("spellAttack", b.spellAttack);
      add("spellDc", b.spellDc);
      add("speed", b.speed);
      add("check", b.check);
      for (const a of ABILITIES) {
        add(`ability:${a}`, b.abilityBonus?.[a]);
        add(`abilitySet:${a}`, b.abilitySet?.[a]);
      }
    }
    add("weaponAttack", b.weaponAttack, { itemId: i.id });
    add("weaponDamage", b.weaponDamage, { itemId: i.id });
  }
  return out;
}

/** Feature names (feats, class/race features, chosen options) on the sheet, lower-cased. */
/** Names of features, chosen options and feature sections ("Otherworldly Glamour" inside "Fey Wanderer"). */
function featureNames(c: Character): Set<string> {
  return new Set(featureParts(c).map((p) => p.name.toLowerCase().trim()));
}

const has = (names: Set<string>, ...options: string[]) => options.some((o) => names.has(o));

function featureModifiers(c: Character, chaMod: number, wisMod: number): Modifier[] {
  const names = featureNames(c);
  const out: Modifier[] = [];
  const add = (id: string, source: string, target: string, value: number, note?: string) =>
    value && out.push({ id: `feature:${id}`, target, value, source, note, kind: "feature" });
  const level = totalLevel(c);
  const armor = c.equipment.find((i) => i.equipped && i.data?.armor && i.data.armor.type !== "shield");
  const shield = c.equipment.some((i) => i.equipped && i.data?.armor?.type === "shield");

  if (has(names, "tough")) add("tough", "Tough", "hp", 2 * level);
  if (has(names, "dwarven toughness")) add("dwarven-toughness", "Dwarven Toughness", "hp", level);
  const sorc = classLevel(c, "sorcerer");
  if (sorc && has(names, "draconic resilience")) add("draconic-resilience", "Draconic Resilience", "hp", sorc);
  if (has(names, "alert")) add("alert", "Alert", "initiative", 5);
  if (has(names, "mobile")) add("mobile", "Mobile", "speed", 10);
  if (has(names, "squat nimbleness")) add("squat-nimbleness", "Squat Nimbleness", "speed", 5);
  if (has(names, "observant")) {
    add("observant-perception", "Observant", "passive:perception", 5);
    add("observant-investigation", "Observant", "passive:investigation", 5);
  }
  const monk = classLevel(c, "monk");
  if (monk >= 2 && has(names, "unarmored movement") && !armor && !shield)
    add("unarmored-movement", "Unarmored Movement", "speed", monk >= 18 ? 30 : monk >= 14 ? 25 : monk >= 10 ? 20 : monk >= 6 ? 15 : 10);
  if (classLevel(c, "barbarian") >= 5 && has(names, "fast movement") && armor?.data?.armor?.type !== "heavy")
    add("fast-movement", "Fast Movement", "speed", 10);
  if (classLevel(c, "ranger") >= 6 && has(names, "roving")) add("roving", "Roving", "speed", 5);
  if (has(names, "archery")) add("archery", "Archery", "attack:ranged", 2);
  if (has(names, "defense", "defence")) add("defense", "Defense", "ac:armored", 1);
  // Dual Wielder: +1 AC while wielding a separate melee weapon in each hand (two equipped melee weapons).
  const meleeWeapons = c.equipment.filter((i) => i.equipped && i.data?.weapon && !i.data.weapon.ranged);
  if (has(names, "dual wielder") && meleeWeapons.length >= 2) add("dual-wielder", "Dual Wielder", "ac", 1, "a melee weapon in each hand");
  if (has(names, "dueling", "duelling")) add("dueling", "Dueling", "damage:melee", 2, "one-handed melee weapon, no other weapon");
  if (has(names, "medium armor master")) add("medium-armor-master", "Medium Armor Master", "medArmorDex", 1);
  if (classLevel(c, "bard") >= 2 && has(names, "jack of all trades")) add("jack", "Jack of All Trades", "halfProf", 1);
  if (classLevel(c, "fighter") >= 7 && has(names, "remarkable athlete")) add("remarkable-athlete", "Remarkable Athlete", "halfProfPhysical", 1);
  if (classLevel(c, "paladin") >= 6 && has(names, "aura of protection"))
    add("aura-of-protection", "Aura of Protection", "save", Math.max(1, chaMod), "while conscious");
  const intMod = Math.floor((c.abilities.int - 10) / 2);
  // Bladesong while active: +INT to AC (min +1) and +10 ft walking speed.
  if (c.combat?.effects.some((e) => e.name === "Bladesong")) {
    add("bladesong-ac", "Bladesong", "ac", Math.max(1, intMod));
    add("bladesong-speed", "Bladesong", "speed", 10);
  }
  // War Magic Tactical Wit, Chronurgy Temporal Awareness: +INT to initiative.
  if (classLevel(c, "wizard") >= 2 && has(names, "tactical wit", "temporal awareness")) add("int-initiative", names.has("tactical wit") ? "Tactical Wit" : "Temporal Awareness", "initiative", intMod);
  // Swashbuckler Rakish Audacity: +CHA to initiative. Watchers Aura of the Sentinel: +proficiency bonus.
  if (classLevel(c, "rogue") >= 3 && has(names, "rakish audacity")) add("rakish-audacity", "Rakish Audacity", "initiative", chaMod);
  if (classLevel(c, "paladin") >= 7 && has(names, "aura of the sentinel")) add("aura-of-the-sentinel", "Aura of the Sentinel", "initiative", Math.ceil(level / 4) + 1);
  // Speed: Scout Superior Mobility, Glory Aura of Alacrity, Armorer Infiltrator Powered Steps.
  if (classLevel(c, "rogue") >= 9 && has(names, "superior mobility")) add("superior-mobility", "Superior Mobility", "speed", 10);
  if (classLevel(c, "paladin") >= 7 && has(names, "aura of alacrity")) add("aura-of-alacrity", "Aura of Alacrity", "speed", 10);
  // Primal Champion (barbarian 20): STR and CON +4, maximum 24.
  if (classLevel(c, "barbarian") >= 20 && has(names, "primal champion")) {
    add("primal-champion-str", "Primal Champion", "ability:str", Math.max(0, Math.min(4, 24 - c.abilities.str)));
    add("primal-champion-con", "Primal Champion", "ability:con", Math.max(0, Math.min(4, 24 - c.abilities.con)));
  }
  // Soul of Artifice (artificer 20): +1 to all saves per attuned magic item.
  if (classLevel(c, "artificer") >= 20 && has(names, "soul of artifice")) add("soul-of-artifice", "Soul of Artifice", "save", c.equipment.filter((i) => i.attuned).length);
  // Gloom Stalker (Xanathar's): Wisdom modifier to initiative.
  if (classLevel(c, "ranger") >= 3 && has(names, "dread ambusher")) add("dread-ambusher", "Dread Ambusher", "initiative", wisMod);
  // Fey Wanderer (Tasha's): add your Wisdom modifier to Charisma checks (minimum +1).
  if (classLevel(c, "ranger") >= 3 && has(names, "otherworldly glamour")) add("otherworldly-glamour", "Otherworldly Glamour", "check:cha", Math.max(1, wisMod), "WIS");
  return out;
}

const cache = new WeakMap<Character, Modifier[]>();

/** Every modifier currently affecting the character, including switched-off ones. */
export function allModifiers(c: Character): Modifier[] {
  const hit = cache.get(c);
  if (hit) return hit;
  const custom: Modifier[] = (c.customModifiers ?? []).map((m) => ({ id: `custom:${m.id}`, target: m.target, value: m.value, source: m.label || "Custom", kind: "custom" }));
  const items = itemModifiers(c);
  // Aura of Protection depends on Charisma, which items can change: compute it from the item-adjusted score.
  const disabled = new Set(c.disabledModifiers ?? []);
  const chaMods = [...items, ...custom].filter((m) => !disabled.has(m.id));
  const cha = scoreFrom(c.abilities.cha, chaMods, "cha");
  const wis = scoreFrom(c.abilities.wis, chaMods, "wis");
  const all = [...items, ...featureModifiers(c, Math.floor((cha - 10) / 2), Math.floor((wis - 10) / 2)), ...custom];
  cache.set(c, all);
  return all;
}

/** Modifiers that are switched on. */
const activeCache = new WeakMap<Character, Modifier[]>();
export function activeModifiers(c: Character): Modifier[] {
  let hit = activeCache.get(c);
  if (!hit) {
    const disabled = new Set(c.disabledModifiers ?? []);
    hit = allModifiers(c).filter((m) => !disabled.has(m.id));
    activeCache.set(c, hit);
  }
  return hit;
}

export const modifiersFor = (c: Character, ...targets: string[]) => activeModifiers(c).filter((m) => targets.includes(m.target));
export const sumFor = (c: Character, ...targets: string[]) => modifiersFor(c, ...targets).reduce((s, m) => s + m.value, 0);
export const hasModifier = (c: Character, target: string) => modifiersFor(c, target).length > 0;

function scoreFrom(base: number, mods: Modifier[], a: Ability) {
  const bonus = mods.filter((m) => m.target === `ability:${a}`).reduce((s, m) => s + m.value, 0);
  const sets = mods.filter((m) => m.target === `abilitySet:${a}`).map((m) => m.value);
  return Math.max(base + bonus, ...sets);
}

/** Ability score after items such as a Belt of Giant Strength or Headband of Intellect. */
export const effectiveScore = (c: Character, a: Ability) => scoreFrom(c.abilities[a], activeModifiers(c), a);

/** Item-linked weapon bonus for an attack (matched by itemId, else by name). */
export function weaponItem(c: Character, a: Attack): Item | undefined {
  return (a.itemId && c.equipment.find((i) => i.id === a.itemId)) || c.equipment.find((i) => !!i.data?.weapon && i.name.toLowerCase() === a.name.toLowerCase().trim());
}

export function isRangedAttack(c: Character, a: Attack) {
  return a.ranged ?? weaponItem(c, a)?.data?.weapon?.ranged ?? false;
}

export function attackModifiers(c: Character, a: Attack) {
  const item = weaponItem(c, a);
  const ranged = isRangedAttack(c, a);
  const linked = (target: string) => (item ? activeModifiers(c).filter((m) => m.target === target && m.itemId === item.id) : []);
  const twoHanded = a.twoHanded ?? item?.data?.weapon?.properties.some((p) => /two-handed/i.test(p)) ?? false;
  return {
    attack: [...modifiersFor(c, "attack", ranged ? "attack:ranged" : "attack:melee"), ...linked("weaponAttack")],
    damage: [...modifiersFor(c, "damage"), ...(!ranged && !twoHanded ? modifiersFor(c, "damage:melee") : []), ...linked("weaponDamage")],
  };
}

export const describe = (mods: Modifier[]) => mods.map((m) => `${m.source} ${m.value >= 0 ? "+" : ""}${m.value}`).join(", ");
