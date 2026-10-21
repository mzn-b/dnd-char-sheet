/**
 * Starting equipment like "two simple melee weapons" or "any musical instrument": the PHB items
 * each one allows, so the player picks real items (matched to rules data when added).
 */
const SIMPLE_MELEE = ["Club", "Dagger", "Greatclub", "Handaxe", "Javelin", "Light Hammer", "Mace", "Quarterstaff", "Sickle", "Spear"];
const SIMPLE_RANGED = ["Light Crossbow", "Dart", "Shortbow", "Sling"];
const MARTIAL_MELEE = [
  "Battleaxe", "Flail", "Glaive", "Greataxe", "Greatsword", "Halberd", "Lance", "Longsword", "Maul", "Morningstar",
  "Pike", "Rapier", "Scimitar", "Shortsword", "Trident", "War Pick", "Warhammer", "Whip",
];
const MARTIAL_RANGED = ["Blowgun", "Hand Crossbow", "Heavy Crossbow", "Longbow", "Net"];
const INSTRUMENTS = ["Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan Flute", "Shawm", "Viol"];
const ARTISAN_TOOLS = [
  "Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools",
  "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools",
  "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools",
];
const GAMING_SETS = ["Dice Set", "Dragonchess Set", "Playing Card Set", "Three-Dragon Ante Set"];

const GENERIC: { re: RegExp; options: string[] }[] = [
  { re: /simple melee weapon/i, options: SIMPLE_MELEE },
  { re: /simple ranged weapon/i, options: SIMPLE_RANGED },
  { re: /simple weapon/i, options: [...SIMPLE_MELEE, ...SIMPLE_RANGED] },
  { re: /martial melee weapon/i, options: MARTIAL_MELEE },
  { re: /martial ranged weapon/i, options: MARTIAL_RANGED },
  { re: /martial weapon/i, options: [...MARTIAL_MELEE, ...MARTIAL_RANGED] },
  { re: /musical instrument/i, options: INSTRUMENTS },
  { re: /artisan'?s tools/i, options: ARTISAN_TOOLS },
  { re: /gaming set/i, options: GAMING_SETS },
];

/** The items a generic entry ("Any simple melee weapon") can be, or undefined for a specific item. */
export function genericOptions(name: string): string[] | undefined {
  if (!/\b(any|simple|martial|musical instrument|artisan|gaming set)\b/i.test(name)) return undefined;
  if (!/^(any|two|a|an|one)\b|weapons?$|instrument$|tools$|set$/i.test(name.trim())) return undefined;
  return GENERIC.find((g) => g.re.test(name))?.options;
}
