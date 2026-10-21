import { extractRolls, type RollInfo } from "./rollText";
import type { Character, Feature } from "./types";

const classLevel = (c: Character, name: string) => c.classes.find((k) => k.name.toLowerCase() === name)?.level ?? 0;
const tier = (level: number, table: [number, string][]) => table.filter(([l]) => level >= l).pop()?.[1];

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
  if (name === "rage" && barbarian) {
    return [{ dice: `+${tier(barbarian, [[1, "2"], [9, "3"], [16, "4"]])}`, kind: "bonus", type: "damage rolls", context: "", condition: "melee weapon attacks using Strength, while raging" }];
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
