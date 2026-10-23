import type { Character, Item, ItemBonuses } from "./types";

/**
 * Artificer infusions (Tasha's Cauldron of Everything): which items each can go into, and what it does
 * to the item. Ones not listed here (homebrew, Unearthed Arcana) fit any item and add nothing automatic.
 */
interface InfusionRule {
  match: RegExp;
  /** What it can be put into, for the menu. */
  target: string;
  fits: (i: Item) => boolean;
  attunement?: boolean;
  charges?: number;
  bonuses?: (artificerLevel: number) => ItemBonuses;
}

const props = (i: Item) => (i.data?.weapon?.properties ?? []).join(" ").toLowerCase();
const isWeapon = (i: Item) => !!i.data?.weapon;
const isArmor = (i: Item) => !!i.data?.armor && i.data.armor.type !== "shield";
const isShield = (i: Item) => i.data?.armor?.type === "shield";
const named = (re: RegExp) => (i: Item) => re.test(i.name);
const plus = (lvl: number) => (lvl >= 10 ? 2 : 1);

export const INFUSIONS: InfusionRule[] = [
  { match: /^enhanced weapon$/i, target: "a simple or martial weapon", fits: isWeapon, bonuses: (l) => ({ weaponAttack: plus(l), weaponDamage: plus(l) }) },
  { match: /^enhanced defense$/i, target: "armor or a shield", fits: (i) => isArmor(i) || isShield(i), bonuses: (l) => ({ ac: plus(l) }) },
  { match: /^enhanced arcane focus$/i, target: "a rod, staff or wand", fits: named(/\b(rod|staff|wand)\b/i), attunement: true, bonuses: (l) => ({ spellAttack: plus(l) }) },
  { match: /^repeating shot$/i, target: "a weapon with the ammunition property", fits: (i) => isWeapon(i) && /ammunition/.test(props(i)), attunement: true, bonuses: () => ({ weaponAttack: 1, weaponDamage: 1 }) },
  { match: /^returning weapon$/i, target: "a weapon with the thrown property", fits: (i) => isWeapon(i) && /thrown/.test(props(i)), bonuses: () => ({ weaponAttack: 1, weaponDamage: 1 }) },
  { match: /^radiant weapon$/i, target: "a simple or martial weapon", fits: isWeapon, attunement: true, charges: 4, bonuses: () => ({ weaponAttack: 1, weaponDamage: 1 }) },
  { match: /^repulsion shield$/i, target: "a shield", fits: isShield, attunement: true, charges: 4, bonuses: () => ({ ac: 1 }) },
  { match: /^resistant armor$/i, target: "a suit of armor", fits: isArmor, attunement: true },
  { match: /^mind sharpener$/i, target: "a suit of armor or robes", fits: (i) => isArmor(i) || /\brobes?\b/i.test(i.name), attunement: true, charges: 4 },
  { match: /^armor of magical strength$/i, target: "a suit of armor", fits: isArmor, attunement: true, charges: 6 },
  { match: /^arcane propulsion armor$/i, target: "a suit of armor", fits: isArmor, attunement: true },
  { match: /^spell-refueling ring$/i, target: "a ring", fits: named(/\bring\b/i), attunement: true },
  { match: /^helm of awareness$/i, target: "a helmet", fits: named(/\b(helm|helmet)\b/i), attunement: true },
  { match: /^boots of the winding path$/i, target: "a pair of boots", fits: named(/\bboots?\b/i), attunement: true },
  { match: /^homunculus servant$/i, target: "a gem or crystal", fits: named(/\b(gem|crystal|jewel)\b/i) },
];

export const infusionRule = (name: string) => INFUSIONS.find((r) => r.match.test(name));

export const artificerLevel = (c: Character) => c.classes.find((k) => k.name.toLowerCase() === "artificer")?.level ?? 0;

/** Infused items at once: 2 from 2nd level, 3 at 6th, 4 at 10th, 5 at 14th, 6 at 18th (Artificer table). */
export const maxInfusedItems = (c: Character) => {
  const l = artificerLevel(c);
  return l < 2 ? 0 : 2 + [6, 10, 14, 18].filter((x) => l >= x).length;
};

/** Infusions the character knows (picked at level-up under "Infusions"). */
export const knownInfusions = (c: Character) =>
  c.features.filter((f) => /^(artificer )?infusions?$/i.test(f.name)).flatMap((f) => f.subfeatures ?? []);

export const infusedCount = (c: Character) => c.equipment.filter((i) => i.infusion).length;

/** The automatic bonuses an item's infusion gives it. */
export function infusionBonuses(c: Character, i: Item): ItemBonuses | undefined {
  return i.infusion ? infusionRule(i.infusion.name)?.bonuses?.(artificerLevel(c)) : undefined;
}

/** Put an infusion into an item: attunement and charges come with it, and go again when it's removed. */
export function infuse(i: Item, name: string) {
  uninfuse(i);
  const rule = infusionRule(name);
  i.infusion = { name, addedAttunement: !!rule?.attunement && !i.attunement, addedCharges: !!rule?.charges && !i.charges };
  if (rule?.attunement) i.attunement = true;
  if (rule?.charges && !i.charges) i.charges = { max: rule.charges, used: 0 };
}

export function uninfuse(i: Item) {
  if (!i.infusion) return;
  if (i.infusion.addedAttunement) i.attunement = i.attuned = undefined;
  if (i.infusion.addedCharges) i.charges = undefined;
  i.infusion = undefined;
}
