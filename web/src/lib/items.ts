import { api } from "./api";
import { uid } from "./defaults";
import { blankAttackFields } from "./attacks";
import { abilityScore } from "./rules";
import type { Attack, Character, ContentDetail, Item } from "./types";

/** Inventory entry from rules content, keeping its armor/weapon data for AC and attacks. */
export function itemFromDetail(det: ContentDetail, qty = 1): Item {
  return {
    id: uid(),
    name: det.name,
    qty,
    weight: det.item?.weight ?? (parseFloat(det.meta.Weight ?? "0") || 0),
    equipped: false,
    notes: "",
    ref: { source: det.source, key: det.key, name: det.name, type: "item" },
    data: det.item,
    attunement: det.item?.attunement || undefined,
    charges: det.item?.charges ? { max: det.item.charges, used: 0 } : undefined,
  };
}

/**
 * Turn a free-text item name (from starting equipment) into a real item when an exact
 * match exists, so armor and weapons work right away.
 */
export async function resolveItem(name: string, qty: number): Promise<Item> {
  const clean = name.replace(/\s*\(\d+\)$/, "").trim();
  try {
    const results = await api.search("item", { q: clean });
    const match = results.find((r) => r.name.toLowerCase() === clean.toLowerCase()) ?? results.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (match) return itemFromDetail(await api.detail("item", match.source, match.key), qty);
  } catch {
    /* fall through to a plain entry */
  }
  return { id: uid(), name, qty, weight: 0, equipped: false, notes: "" };
}

/**
 * Whether the proficiency text covers a weapon: "Simple weapons", "Martial weapons", or the weapon
 * by name ("longswords", "hand crossbows"), ignoring a magic "+1" and plurals.
 */
export function weaponProficient(proficiencies: string, category: string, itemName: string): boolean {
  const cat = category.toLowerCase();
  const singular = (w: string) => w.replace(/(?<=\w)(?:es|s)$/, "");
  // "Weapons: simple, martial" / "Simple weapons, hand crossbows" → ["simple", "martial", "hand crossbow"…]
  const words = proficiencies
    .toLowerCase()
    .split("\n")
    .flatMap((line) => line.replace(/^[\w ]+:\s*/, "").split(/[,;]|\band\b/))
    .map((x) => singular(x.replace(/\bweapons?\b/, "").trim()));
  if (/simple/.test(cat) && words.includes("simple")) return true;
  if (/martial/.test(cat) && words.includes("martial")) return true;
  const base = singular(itemName.toLowerCase().replace(/[+−-]\d+\s*/g, "").replace(/,.*$/, "").replace(/\(.*?\)/g, "").trim());
  return !!base && words.some((x) => x && (x === base || base.endsWith(` ${x}`) || base.startsWith(`${x} `)));
}

/** Build an attack from a weapon: finesse/ranged pick Dex, versatile damage noted. */
export async function attackFromItem(c: Character, item: Item, assumeProficient = false): Promise<Attack> {
  let w = item.data?.weapon;
  if (!w && item.ref) w = (await api.detail("item", item.ref.source, item.ref.key).catch(() => null))?.item?.weapon;
  const useDex = !!w && (w.ranged || (w.finesse && abilityScore(c, "dex") > abilityScore(c, "str")));
  const proficient = assumeProficient || !w?.category || weaponProficient(c.proficienciesAndLanguages, w.category, item.name);
  return {
    ...blankAttackFields(),
    name: item.name,
    itemId: item.id,
    ranged: !!w?.ranged,
    twoHanded: !!w?.properties.some((p) => /two-handed/i.test(p)),
    ability: useDex ? "dex" : "str",
    proficient,
    damage: w?.damage ?? "",
    damageType: w?.damageType ?? "",
    notes: [w?.properties.join(", "), w?.versatile && `two-handed ${w.versatile}`, w?.range && `range ${w.range}`].filter(Boolean).join("; "),
  };
}


