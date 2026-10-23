import type { Character, Choice, ChoiceOption, Effect, Selections } from "./types";

/**
 * Armor, weapon, tool and language proficiencies. The sheet keeps them as "Category: a, b" lines (one line
 * per source, so a source's own line can be taken back out); this module reads them as sets, lists the
 * values to choose from, and says whether a choice option is something the character already has.
 */

export const PROF_CATEGORIES = ["Armor", "Weapons", "Tools", "Languages"] as const;
export type ProfCategory = (typeof PROF_CATEGORIES)[number];

export const STANDARD_LANGUAGES = ["Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc"];
export const EXOTIC_LANGUAGES = ["Abyssal", "Celestial", "Deep Speech", "Draconic", "Infernal", "Primordial", "Sylvan", "Undercommon"];
export const SECRET_LANGUAGES = ["Druidic", "Thieves' Cant"];
export const ARTISANS_TOOLS = [
  "Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools", "Cartographer's tools", "Cobbler's tools",
  "Cook's utensils", "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools",
  "Smith's tools", "Tinker's tools", "Weaver's tools", "Woodcarver's tools",
];
export const GAMING_SETS = ["Dice set", "Dragonchess set", "Playing card set", "Three-Dragon Ante set"];
export const INSTRUMENTS = ["Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan flute", "Shawm", "Viol"];
export const OTHER_TOOLS = ["Disguise kit", "Forgery kit", "Herbalism kit", "Navigator's tools", "Poisoner's kit", "Thieves' tools", "Vehicles (land)", "Vehicles (water)"];
const SIMPLE_WEAPONS = ["Club", "Dagger", "Greatclub", "Handaxe", "Javelin", "Light hammer", "Mace", "Quarterstaff", "Sickle", "Spear", "Light crossbow", "Dart", "Shortbow", "Sling"];
const MARTIAL_WEAPONS = [
  "Battleaxe", "Flail", "Glaive", "Greataxe", "Greatsword", "Halberd", "Lance", "Longsword", "Maul", "Morningstar", "Pike", "Rapier", "Scimitar",
  "Shortsword", "Trident", "War pick", "Warhammer", "Whip", "Blowgun", "Hand crossbow", "Heavy crossbow", "Longbow", "Net",
];

/** Values offered when adding a proficiency by hand, in groups. */
export const PROF_REPOSITORY: Record<ProfCategory, { group: string; items: string[] }[]> = {
  Armor: [{ group: "Armor", items: ["Light armor", "Medium armor", "Heavy armor", "Shields"] }],
  Weapons: [
    { group: "Categories", items: ["Simple weapons", "Martial weapons", "Firearms"] },
    { group: "Simple weapons", items: SIMPLE_WEAPONS },
    { group: "Martial weapons", items: MARTIAL_WEAPONS },
  ],
  Tools: [
    { group: "Artisan's tools", items: ARTISANS_TOOLS },
    { group: "Gaming sets", items: GAMING_SETS },
    { group: "Musical instruments", items: INSTRUMENTS },
    { group: "Other tools", items: OTHER_TOOLS },
  ],
  Languages: [
    { group: "Standard", items: STANDARD_LANGUAGES },
    { group: "Exotic", items: EXOTIC_LANGUAGES },
    { group: "Secret", items: SECRET_LANGUAGES },
  ],
};

/** "Weapons" ← "weapon", "Tools" ← "tool"… for the line prefixes and the mixed-choice keys ("tool:dice set"). */
const CATEGORY_OF: Record<string, ProfCategory> = {
  armor: "Armor", armour: "Armor", weapons: "Weapons", weapon: "Weapons", tools: "Tools", tool: "Tools", languages: "Languages", language: "Languages",
};
export const categoryOf = (prefix: string): ProfCategory | undefined => CATEGORY_OF[prefix.trim().toLowerCase()];

/** Normalized for comparing: "Light Armor" = "light", "Simple weapons" = "simple", "shield" = "shields". */
export const profKey = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ").replace(/^(light|medium|heavy) armou?r$/, "$1").replace(/^(simple|martial) weapons?$/, "$1").replace(/^shield$/, "shields");

const splitItems = (text: string) => text.split(/,\s*|;\s*/).map((x) => x.trim()).filter(Boolean);

/** The sheet's proficiency lines read as categories (in order, deduplicated), plus lines without a category. */
export function parseProficiencies(text: string): { byCategory: Record<ProfCategory, string[]>; other: string[] } {
  const byCategory = Object.fromEntries(PROF_CATEGORIES.map((k) => [k, [] as string[]])) as Record<ProfCategory, string[]>;
  const other: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const at = line.indexOf(":");
    const cat = at > 0 ? categoryOf(line.slice(0, at)) : undefined;
    if (!cat) {
      other.push(line);
      continue;
    }
    for (const item of splitItems(line.slice(at + 1))) {
      if (!byCategory[cat].some((x) => profKey(x) === profKey(item))) byCategory[cat].push(item);
    }
  }
  return { byCategory, other };
}

/** Remove one item from whichever lines hold it (dropping lines left empty). */
export function removeProficiencyItem(text: string, category: ProfCategory, item: string): string {
  return text
    .split("\n")
    .flatMap((line) => {
      const at = line.indexOf(":");
      if (at <= 0 || categoryOf(line.slice(0, at)) !== category) return [line];
      const rest = splitItems(line.slice(at + 1)).filter((x) => profKey(x) !== profKey(item));
      return rest.length ? [`${line.slice(0, at)}: ${rest.join(", ")}`] : [];
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// What a character (or a character in the making) already has

export interface Owned {
  skills: Set<string>;
  items: Record<ProfCategory, Set<string>>;
}

export function ownedFrom(c?: Pick<Character, "proficienciesAndLanguages" | "skills">): Owned {
  const o: Owned = { skills: new Set(), items: Object.fromEntries(PROF_CATEGORIES.map((k) => [k, new Set<string>()])) as Owned["items"] };
  if (!c) return o;
  for (const [k, v] of Object.entries(c.skills ?? {})) if ((v ?? 0) >= 1) o.skills.add(k);
  const { byCategory } = parseProficiencies(c.proficienciesAndLanguages ?? "");
  for (const cat of PROF_CATEGORIES) for (const x of byCategory[cat]) o.items[cat].add(profKey(x));
  return o;
}

export function mergeOwned(...all: Owned[]): Owned {
  const o = ownedFrom();
  for (const x of all) {
    x.skills.forEach((s) => o.skills.add(s));
    for (const cat of PROF_CATEGORIES) x.items[cat].forEach((i) => o.items[cat].add(i));
  }
  return o;
}

/** Fixed grants of a race, background or feat (its effects). */
export function ownedFromEffects(effects: Effect[] | undefined): Owned {
  const o = ownedFrom();
  for (const e of effects ?? []) {
    if (e.kind === "skill" || e.kind === "expertise") o.skills.add(e.skill);
    if (e.kind === "proficiency") {
      const at = e.value.indexOf(":");
      const cat = at > 0 ? categoryOf(e.value.slice(0, at)) : undefined;
      if (cat) for (const x of splitItems(e.value.slice(at + 1))) o.items[cat].add(profKey(x));
    }
  }
  return o;
}

/** What an option gives: a skill key, or a category and item. */
function optionGrant(choice: Choice, option: ChoiceOption): { skill?: string; category?: ProfCategory; item?: string } | undefined {
  if (choice.kind === "skill" || (choice.kind === "expertise" && choice.grantsProficiency)) return { skill: option.key };
  if (choice.kind !== "proficiency") return undefined;
  if (choice.prefix === "mixed") {
    const [kind, ...rest] = option.key.split(":");
    if (kind === "skill") return { skill: rest.join(":") };
    const category = categoryOf(kind);
    return category ? { category, item: option.name } : undefined;
  }
  const category = categoryOf(choice.prefix ?? "");
  return category ? { category, item: option.name } : undefined;
}

/** Picks made in these choices, as owned things (so one choice doesn't offer what another already took). */
export function ownedFromSelections(choices: Choice[] | undefined, selections: Selections, except?: string): Owned {
  const o = ownedFrom();
  for (const ch of choices ?? []) {
    if (ch.id === except) continue;
    for (const key of selections[ch.id] ?? []) {
      const opt = ch.options.find((x) => x.key === key);
      const g = opt && optionGrant(ch, opt);
      if (g?.skill) o.skills.add(g.skill);
      if (g?.category && g.item) o.items[g.category].add(profKey(g.item));
    }
  }
  return o;
}

/** Whether picking this option would give something already had. */
export function alreadyOwned(owned: Owned | undefined, choice: Choice, option: ChoiceOption): boolean {
  if (!owned) return false;
  const g = optionGrant(choice, option);
  if (!g) return false;
  if (g.skill) return owned.skills.has(g.skill);
  return !!g.category && !!g.item && owned.items[g.category].has(profKey(g.item));
}
