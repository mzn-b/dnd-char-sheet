import { uid } from "./defaults";
import { takeDamage } from "./rules";
import type { Character, Companion, ContentDetail, ContentSummary, CreatureRole } from "./types";

export const ROLE_LABEL: Record<CreatureRole, string> = {
  wildshape: "Wild Shape form", familiar: "Familiar", steed: "Steed", companion: "Companion", summon: "Summon", other: "Other",
};

export const crNumber = (cr: string | undefined) => {
  if (!cr) return 0;
  const [a, b] = cr.split("/").map(Number);
  return b ? a / b : a || 0;
};

const druidLevel = (c: Character) => c.classes.find((k) => k.name.toLowerCase() === "druid")?.level ?? 0;
const isMoon = (c: Character) => c.classes.some((k) => k.name.toLowerCase() === "druid" && /moon/i.test(k.subclass?.name ?? ""));

/** PHB Wild Shape limits by druid level (Circle of the Moon raises the CR). */
export function wildShapeLimits(c: Character): { maxCr: number; fly: boolean; swim: boolean; label: string } | null {
  const lvl = druidLevel(c);
  if (lvl < 2) return null;
  const maxCr = isMoon(c) ? (lvl >= 6 ? Math.floor(lvl / 3) : 1) : lvl >= 8 ? 1 : lvl >= 4 ? 0.5 : 0.25;
  const fly = lvl >= 8;
  const swim = lvl >= 4;
  const crLabel = maxCr === 0.25 ? "1/4" : maxCr === 0.5 ? "1/2" : String(maxCr);
  return { maxCr, fly, swim, label: `Beasts up to CR ${crLabel}${fly ? "" : swim ? ", no flying" : ", no flying or swimming"}` };
}

export const FAMILIARS = ["bat", "cat", "crab", "frog", "hawk", "lizard", "octopus", "owl", "poisonous snake", "quipper", "rat", "raven", "sea horse", "spider", "weasel"];
export const CHAIN_FAMILIARS = ["imp", "pseudodragon", "quasit", "sprite"];
export const STEEDS = ["warhorse", "pony", "camel", "elk", "mastiff"];
export const GREATER_STEEDS = ["griffon", "pegasus", "peryton", "dire wolf", "rhinoceros", "saber-toothed tiger"];

export type Preset = "all" | "wildshape" | "familiar" | "steed" | "beastmaster";

export const PRESETS: { id: Preset; label: string; role: CreatureRole }[] = [
  { id: "all", label: "All creatures", role: "other" },
  { id: "wildshape", label: "Wild Shape", role: "wildshape" },
  { id: "familiar", label: "Find Familiar", role: "familiar" },
  { id: "steed", label: "Find Steed", role: "steed" },
  { id: "beastmaster", label: "Beast companion", role: "companion" },
];

const named = (names: string[], m: ContentSummary) => names.includes(m.name.toLowerCase());

/** Whether a monster fits a preset for this character. */
export function fitsPreset(c: Character, preset: Preset, m: ContentSummary): boolean {
  const cr = m.level ?? crNumber(m.cr);
  switch (preset) {
    case "all":
      return true;
    case "wildshape": {
      const lim = wildShapeLimits(c) ?? { maxCr: 1, fly: true, swim: true };
      return m.creatureType === "beast" && cr <= lim.maxCr && (lim.fly || !m.movement?.includes("fly")) && (lim.swim || !m.movement?.includes("swim"));
    }
    case "familiar":
      return named(FAMILIARS, m) || named(CHAIN_FAMILIARS, m);
    case "steed":
      return named(STEEDS, m) || named(GREATER_STEEDS, m);
    case "beastmaster":
      return m.creatureType === "beast" && cr <= 0.25;
  }
}

const speedText = (speed: Record<string, number>) =>
  Object.entries(speed).map(([k, v]) => (k === "walk" ? `${v} ft` : `${k} ${v} ft`)).join(", ");

/** A tracked creature built from a stat block. */
export function creatureFromDetail(det: ContentDetail, role: CreatureRole): Companion {
  const m = det.monster!;
  return {
    id: uid(),
    name: det.name,
    kind: `${m.size} ${m.type}, CR ${m.cr}`,
    ac: m.ac,
    hp: { max: m.hp, current: m.hp, temp: 0 },
    speed: speedText(m.speed),
    notes: "",
    role,
    ref: { source: det.source, key: det.key, name: det.name },
    monster: m,
  };
}

/** Damage to a creature: temp HP first. Returns damage beyond 0 HP (carries over from Wild Shape). */
export function damageCreature(p: Companion, n: number): number {
  const absorbed = Math.min(p.hp.temp ?? 0, n);
  p.hp.temp = (p.hp.temp ?? 0) - absorbed;
  const rest = n - absorbed;
  const overflow = Math.max(0, rest - p.hp.current);
  p.hp.current = Math.max(0, p.hp.current - rest);
  return overflow;
}

/** Assume a Wild Shape form with fresh HP (spending the use is up to the caller, see wildShapeInto). */
export function startWildShape(d: Character, companionId: string) {
  const form = d.companions?.find((p) => p.id === companionId);
  if (!form) return;
  form.hp.current = form.hp.max;
  form.hp.temp = 0;
  d.wildShape = { companionId };
}

/** Back to your normal form (and end the Wild Shape combat effect). */
export function revertWildShape(d: Character) {
  d.wildShape = null;
  if (d.combat) d.combat.effects = d.combat.effects.filter((e) => e.name !== "Wild Shape");
}

/** Damage while wild shaped: the beast takes it; at 0 HP you revert and excess carries over. */
export function damageWildShape(d: Character, n: number): { reverted: boolean; carried: number } {
  const form = d.companions?.find((p) => p.id === d.wildShape?.companionId);
  if (!form) return { reverted: false, carried: 0 };
  const carried = damageCreature(form, n);
  if (form.hp.current > 0) return { reverted: false, carried: 0 };
  revertWildShape(d);
  if (carried) takeDamage(d, carried);
  return { reverted: true, carried };
}
