import { abilityMod } from "./rules";
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
}

type Def = (k: ClassEntry, c: Character) => Omit<Resource, "id" | "source"> | null;

const at = <T,>(level: number, table: [number, T][]): T | undefined => table.filter(([l]) => level >= l).pop()?.[1];
const chaMod = (c: Character) => Math.max(1, abilityMod(c, "cha"));

const CLASS_RESOURCES: Record<string, Record<string, Def>> = {
  barbarian: {
    rage: (k) => ({ name: "Rage", max: k.level >= 20 ? 99 : at(k.level, [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]])!, reset: "long", die: `+${at(k.level, [[1, 2], [9, 3], [16, 4]])} damage` }),
  },
  bard: {
    inspiration: (k, c) => ({ name: "Bardic Inspiration", max: chaMod(c), reset: k.level >= 5 ? "short" : "long", die: `d${at(k.level, [[1, 6], [5, 8], [10, 10], [15, 12]])}` }),
  },
  cleric: {
    channel: (k) => (k.level >= 2 ? { name: "Channel Divinity", max: at(k.level, [[2, 1], [6, 2], [18, 3]])!, reset: "short" } : null),
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
    ki: (k) => (k.level >= 2 ? { name: "Ki Points", max: k.level, reset: "short", pool: k.level > 10 } : null),
  },
  paladin: {
    layonhands: (k) => ({ name: "Lay on Hands", max: 5 * k.level, reset: "long", pool: true }),
    divinesense: (_k, c) => ({ name: "Divine Sense", max: 1 + Math.max(0, abilityMod(c, "cha")), reset: "long" }),
    channel: (k) => (k.level >= 3 ? { name: "Channel Divinity", max: 1, reset: "short" } : null),
  },
  ranger: {},
  rogue: {
    strokeofluck: (k) => (k.level >= 20 ? { name: "Stroke of Luck", max: 1, reset: "short" } : null),
  },
  sorcerer: {
    sorcery: (k) => (k.level >= 2 ? { name: "Sorcery Points", max: k.level, reset: "long", pool: k.level > 10 } : null),
  },
  warlock: {
    arcanum6: (k) => (k.level >= 11 ? { name: "Mystic Arcanum (6th)", max: 1, reset: "long" } : null),
    arcanum7: (k) => (k.level >= 13 ? { name: "Mystic Arcanum (7th)", max: 1, reset: "long" } : null),
    arcanum8: (k) => (k.level >= 15 ? { name: "Mystic Arcanum (8th)", max: 1, reset: "long" } : null),
    arcanum9: (k) => (k.level >= 17 ? { name: "Mystic Arcanum (9th)", max: 1, reset: "long" } : null),
  },
  wizard: {
    arcanerecovery: (k) => ({ name: "Arcane Recovery", max: 1, reset: "long", die: `${Math.ceil(k.level / 2)} slot levels` }),
  },
  artificer: {
    flash: (k, c) => (k.level >= 7 ? { name: "Flash of Genius", max: Math.max(1, abilityMod(c, "int")), reset: "long" } : null),
  },
};

const SUBCLASS_RESOURCES: Record<string, Def> = {
  "battle master": (k) => ({ name: "Superiority Dice", max: at(k.level, [[3, 4], [7, 5], [15, 6]])!, reset: "short", die: `d${at(k.level, [[3, 8], [10, 10], [18, 12]])}` }),
  "circle of the land": (k) => (k.level >= 2 ? { name: "Natural Recovery", max: 1, reset: "long", die: `${Math.ceil(k.level / 2)} slot levels` } : null),
  "way of the open hand": (k) => (k.level >= 11 ? { name: "Tranquility", max: 1, reset: "long" } : null),
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
  d.resourcesUsed = used;
}
