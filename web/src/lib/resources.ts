import { abilityMod, profBonus } from "./rules";
import { featureParts } from "./featureSections";
import type { Character, ClassEntry } from "./types";

/**
 * Class resources (2014 PHB), derived from class/subclass levels and ability scores so the
 * maximum always stays correct. Only the spent amount is stored on the character.
 */
export interface Resource {
  id: string;
  name: string;
  max: number;
  /** Shown as a counter (e.g. Lay on Hands pool) instead of pips when large. */
  pool?: boolean;
  reset: "short" | "long";
  die?: string;
  source: string;
  /** Feature names this resource tracks besides its own ("Font of Magic" for Sorcery Points). */
  aliases?: string[];
}

type Def = (k: ClassEntry, c: Character) => Omit<Resource, "id" | "source"> | null;

const at = <T,>(level: number, table: [number, T][]): T | undefined => table.filter(([l]) => level >= l).pop()?.[1];
const chaMod = (c: Character) => Math.max(1, abilityMod(c, "cha"));
const hasPart = (c: Character, re: RegExp) => featureParts(c).some((p) => re.test(p.name));
/** Psi Warrior / Soulknife (Tasha's): 2 × proficiency bonus dice, d6 → d8 → d10 → d12. */
const psionicDice: Def = (k, c) =>
  k.level >= 3 ? { name: "Psionic Energy Dice", max: 2 * profBonus(c), reset: "long", die: `d${at(k.level, [[3, 6], [5, 8], [11, 10], [17, 12]])}`, aliases: ["Psionic Power"] } : null;

const CLASS_RESOURCES: Record<string, Record<string, Def>> = {
  barbarian: {
    rage: (k) => ({ name: "Rage", max: k.level >= 20 ? 99 : at(k.level, [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]])!, reset: "long", die: `+${at(k.level, [[1, 2], [9, 3], [16, 4]])} damage` }),
  },
  bard: {
    inspiration: (k, c) => ({ name: "Bardic Inspiration", max: chaMod(c), reset: k.level >= 5 ? "short" : "long", die: `d${at(k.level, [[1, 6], [5, 8], [10, 10], [15, 12]])}` }),
  },
  cleric: {
    channel: (k) => (k.level >= 2 ? { name: "Channel Divinity", max: at(k.level, [[2, 1], [6, 2], [18, 3]])!, reset: "short" } : null),
    // Tasha's optional feature: also spends a Channel Divinity use.
    harness: (k, c) => (k.level >= 2 && hasPart(c, /harness divine power/i) ? { name: "Harness Divine Power", max: at(k.level, [[2, 1], [6, 2], [18, 3]])!, reset: "long", die: `slot up to level ${Math.ceil(profBonus(c) / 2)}` } : null),
    intervention: (k) => (k.level >= 10 ? { name: "Divine Intervention", max: 1, reset: "long" } : null),
  },
  druid: {
    wildshape: (k) => (k.level >= 2 ? { name: "Wild Shape", max: k.level >= 20 ? 99 : 2, reset: "short" } : null),
  },
  fighter: {
    secondwind: () => ({ name: "Second Wind", max: 1, reset: "short", die: "1d10 + fighter level" }),
    actionsurge: (k) => (k.level >= 2 ? { name: "Action Surge", max: k.level >= 17 ? 2 : 1, reset: "short" } : null),
    indomitable: (k) => (k.level >= 9 ? { name: "Indomitable", max: at(k.level, [[9, 1], [13, 2], [17, 3]])!, reset: "long" } : null),
  },
  monk: {
    ki: (k) => (k.level >= 2 ? { name: "Ki Points", max: k.level, reset: "short", pool: k.level > 10, aliases: ["Ki"] } : null),
  },
  paladin: {
    layonhands: (k) => ({ name: "Lay on Hands", max: 5 * k.level, reset: "long", pool: true }),
    divinesense: (_k, c) => ({ name: "Divine Sense", max: 1 + Math.max(0, abilityMod(c, "cha")), reset: "long" }),
    channel: (k) => (k.level >= 3 ? { name: "Channel Divinity", max: 1, reset: "short" } : null),
    harness: (k, c) => (k.level >= 3 && hasPart(c, /harness divine power/i) ? { name: "Harness Divine Power", max: at(k.level, [[3, 1], [7, 2], [15, 3]])!, reset: "long", die: `slot up to level ${Math.ceil(profBonus(c) / 2)}` } : null),
  },
  ranger: {},
  rogue: {
    strokeofluck: (k) => (k.level >= 20 ? { name: "Stroke of Luck", max: 1, reset: "short" } : null),
  },
  sorcerer: {
    sorcery: (k) => (k.level >= 2 ? { name: "Sorcery Points", max: k.level, reset: "long", pool: k.level > 10, aliases: ["Font of Magic", "Flexible Casting"] } : null),
  },
  warlock: {
    arcanum6: (k) => (k.level >= 11 ? { name: "Mystic Arcanum (6th level)", max: 1, reset: "long" } : null),
    arcanum7: (k) => (k.level >= 13 ? { name: "Mystic Arcanum (7th level)", max: 1, reset: "long" } : null),
    arcanum8: (k) => (k.level >= 15 ? { name: "Mystic Arcanum (8th level)", max: 1, reset: "long" } : null),
    arcanum9: (k) => (k.level >= 17 ? { name: "Mystic Arcanum (9th level)", max: 1, reset: "long" } : null),
  },
  wizard: {
    arcanerecovery: (k) => ({ name: "Arcane Recovery", max: 1, reset: "long", die: `${Math.ceil(k.level / 2)} slot levels` }),
  },
  artificer: {
    flash: (k, c) => (k.level >= 7 ? { name: "Flash of Genius", max: Math.max(1, abilityMod(c, "int")), reset: "long" } : null),
    spellstoring: (k, c) => (k.level >= 11 ? { name: "Spell-Storing Item", max: Math.max(2, 2 * abilityMod(c, "int")), reset: "long" } : null),
  },
};

const SUBCLASS_RESOURCES: Record<string, Def> = {
  "battle master": (k) => ({ name: "Superiority Dice", max: at(k.level, [[3, 4], [7, 5], [15, 6]])!, reset: "short", die: `d${at(k.level, [[3, 8], [10, 10], [18, 12]])}` }),
  "circle of the land": (k) => (k.level >= 2 ? { name: "Natural Recovery", max: 1, reset: "long", die: `${Math.ceil(k.level / 2)} slot levels` } : null),
  // Tranquility's Sanctuary is tracked on the granted spell when the subclass data grants it.
  "way of the open hand": (k, c) => (k.level >= 11 && !c.spellcasting.spells.some((s) => /^sanctuary$/i.test(s.ref.name) && s.uses) ? { name: "Tranquility", max: 1, reset: "long" } : null),
  "psi warrior": psionicDice,
  soulknife: psionicDice,
  "the fiend": (k) => (k.level >= 6 ? { name: "Dark One's Own Luck", max: 1, reset: "short" } : null),
  "school of divination": (k) => (k.level >= 2 ? { name: "Portent", max: k.level >= 14 ? 3 : 2, reset: "long" } : null),
};

export function classResources(c: Character): Resource[] {
  const out: Resource[] = [];
  for (const k of c.classes) {
    const name = k.name.toLowerCase();
    for (const [id, def] of Object.entries(CLASS_RESOURCES[name] ?? {})) {
      const r = def(k, c);
      if (r) out.push({ ...r, id: `${name}:${id}`, source: `${k.name} ${k.level}` });
    }
    const sub = k.subclass?.name.toLowerCase();
    const subKey = sub && Object.keys(SUBCLASS_RESOURCES).find((s) => s === sub || s.endsWith(sub) || sub.includes(s));
    const subDef = subKey ? SUBCLASS_RESOURCES[subKey] : undefined;
    if (subDef) {
      const r = subDef(k, c);
      if (r) out.push({ ...r, id: `${name}:sub`, source: k.subclass!.name });
    }
  }
  return out;
}

export function resetResources(d: Character, rest: "short" | "long") {
  const used = { ...(d.resourcesUsed ?? {}) };
  for (const r of classResources(d)) if (rest === "long" || r.reset === "short") used[r.id] = 0;
  // Sorcerous Restoration (sorcerer 20): regain 4 sorcery points on a short rest.
  const sorc = d.classes.find((k) => k.name.toLowerCase() === "sorcerer");
  if (rest === "short" && sorc && sorc.level >= 20 && used["sorcerer:sorcery"]) used["sorcerer:sorcery"] = Math.max(0, used["sorcerer:sorcery"] - 4);
  d.resourcesUsed = used;
}
