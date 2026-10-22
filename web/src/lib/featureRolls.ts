import { extractRolls, type RollInfo } from "./rollText";
import type { Character, Feature } from "./types";

const classLevel = (c: Character, name: string) => c.classes.find((k) => k.name.toLowerCase() === name)?.level ?? 0;
const tier = (level: number, table: [number, string][]) => table.filter(([l]) => level >= l).pop()?.[1];

/** Dice that grow with class level: feature name → classes whose level counts, [level, dice]. */
const PSIONIC: [number, string][] = [[3, "1d6"], [5, "1d8"], [11, "1d10"], [17, "1d12"]];
const CLASS_DICE: Record<string, { classes: string[]; table: [number, string][] }> = {
  "favored foe": { classes: ["ranger"], table: [[1, "1d4"], [6, "1d6"], [14, "1d8"]] },
  "dreadful strikes": { classes: ["ranger"], table: [[3, "1d4"], [11, "1d6"]] },
  "gathered swarm": { classes: ["ranger"], table: [[3, "1d6"], [11, "1d8"]] },
  "planar warrior": { classes: ["ranger"], table: [[3, "1d8"], [11, "2d8"]] },
  "drake's breath": { classes: ["ranger"], table: [[7, "8d6"], [15, "10d6"]] },
  "divine strike": { classes: ["cleric"], table: [[8, "1d8"], [14, "2d8"]] },
  "halo of spores": { classes: ["druid"], table: [[2, "1d4"], [6, "1d6"], [10, "1d8"], [14, "1d10"]] },
  "starry form": { classes: ["druid"], table: [[2, "1d8"], [10, "2d8"]] },
  "psychic blades": { classes: ["bard"], table: [[3, "2d6"], [5, "3d6"], [10, "5d6"], [15, "8d6"]] },
  "giant's might": { classes: ["fighter"], table: [[3, "1d6"], [10, "1d8"], [18, "1d10"]] },
  "spirit shield": { classes: ["barbarian"], table: [[6, "2d6"], [10, "3d6"], [14, "4d6"]] },
  "arcane jolt": { classes: ["artificer"], table: [[9, "2d6"], [15, "4d6"]] },
  // Psi Warrior / Soulknife powers roll the Psionic Energy die.
  "protective field": { classes: ["fighter"], table: PSIONIC },
  "psionic strike": { classes: ["fighter"], table: PSIONIC },
  "psi-bolstered knack": { classes: ["rogue"], table: PSIONIC },
  "psychic whispers": { classes: ["rogue"], table: PSIONIC },
};

/** Current dice of a feature whose dice scale with class level (Favored Foe 1d4 → 1d6 → 1d8), if any. */
export function scaledFeatureDice(c: Character, name: string): string | undefined {
  const def = CLASS_DICE[name.toLowerCase().replace(/’/g, "'")];
  const level = def ? Math.max(0, ...def.classes.map((k) => classLevel(c, k))) : 0;
  return def && level ? tier(level, def.table) : undefined;
}

/**
 * Rolls for a feature. Text extraction finds the dice; features whose dice grow through a class
 * table (Sneak Attack, Martial Arts, Bardic Inspiration, Rage) get their current value from the table.
 */
export function featureRolls(c: Character, f: Pick<Feature, "name" | "description">): RollInfo[] {
  const name = f.name.toLowerCase();
  const rolls = extractRolls(f.description);
  const rogue = classLevel(c, "rogue");
  const monk = classLevel(c, "monk");
  const bard = classLevel(c, "bard");
  const barbarian = classLevel(c, "barbarian");
  if (name === "sneak attack" && rogue) {
    const r = rolls.find((x) => x.kind === "damage") ?? { kind: "damage", context: "", dice: "" } as RollInfo;
    return [{ ...r, dice: `${Math.ceil(rogue / 2)}d6`, condition: "once per turn, with advantage or an ally within 5 ft of the target (finesse or ranged weapon)" }];
  }
  if (name === "martial arts" && monk) {
    return [{ dice: `1${tier(monk, [[1, "d4"], [5, "d6"], [11, "d8"], [17, "d10"]])} + Dex`, kind: "damage", context: "", condition: "unarmed strike or monk weapon", timing: "on a hit" }];
  }
  if (name === "bardic inspiration" && bard) {
    return [{ dice: `1${tier(bard, [[1, "d6"], [5, "d8"], [10, "d10"], [15, "d12"]])}`, kind: "die", context: "", condition: "added by an ally to one ability check, attack roll or saving throw" }];
  }
  if (name === "song of rest" && bard >= 2) {
    return [{ dice: `1${tier(bard, [[2, "d6"], [9, "d8"], [13, "d10"], [17, "d12"]])}`, kind: "healing", context: "", condition: "extra healing at the end of a short rest for anyone who spent hit dice" }];
  }
  if (name === "rage" && barbarian) {
    return [{ dice: `+${tier(barbarian, [[1, "2"], [9, "3"], [16, "4"]])}`, kind: "bonus", type: "damage rolls", context: "", condition: "melee weapon attacks using Strength, while raging" }];
  }
  const scaled = scaledFeatureDice(c, f.name);
  if (scaled) {
    // Only the first damage roll scales; ignore table dice (d4/d6 option tables).
    const i = rolls.findIndex((x) => x.kind === "damage");
    if (i >= 0) rolls[i] = { ...rolls[i], dice: rolls[i].dice.replace(/\d+d\d+/, scaled) };
  }
  // "1d10 + fighter level" → "1d10 + 3"
  return rolls.map((r) => ({
    ...r,
    dice: r.dice.replace(/([+−]) (\w+) level$/, (m, sign, cls) => {
      const lvl = cls === "your" ? c.classes.reduce((s, k) => s + k.level, 0) : classLevel(c, cls.toLowerCase());
      return lvl ? `${sign} ${lvl}` : m;
    }),
  }));
}
