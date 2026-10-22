import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { addEffect, startCombat, startTurn } from "../combat";
import { spendEconomy, featureKind } from "../economy";
import { durationFromText } from "../featureDuration";
import { scaledFeatureDice } from "../featureRolls";
import { featureSections } from "../featureSections";
import { armorClassBreakdown, critRange, speedBreakdown, takeDamage } from "../rules";
import { detectUses } from "../uses";
import { textChoices } from "../textChoices";
import type { Character } from "../types";

function ranger(level: number): Character {
  const c = newCharacter("Ranger");
  c.classes = [{ source: "5etools", key: "ranger", name: "Ranger", level, hitDie: 10 }];
  c.abilities = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 };
  c.hp = { max: 30, current: 30, temp: 0 };
  c.speed = 30;
  return c;
}

describe("2014 rules audit fixes", () => {
  it("scales ranger feature dice by level", () => {
    expect(scaledFeatureDice(ranger(1), "Favored Foe")).toBe("1d4");
    expect(scaledFeatureDice(ranger(6), "Favored Foe")).toBe("1d6");
    expect(scaledFeatureDice(ranger(14), "Favored Foe")).toBe("1d8");
    expect(scaledFeatureDice(ranger(11), "Dreadful Strikes")).toBe("1d6");
    expect(scaledFeatureDice(ranger(15), "Drake's Breath")).toBe("10d6");
  });

  it("ends 'until your next turn' effects at your next turn, even before your first", () => {
    const c = ranger(5);
    startCombat(c);
    addEffect(c, { id: "s", name: "Shield", source: "spell", startedRound: 1, rounds: null, untilNextTurn: true, reminders: [] });
    expect(startTurn(c)).toEqual(["Shield"]);
  });

  it("warns about a reaction spell after a bonus-action spell on your turn", () => {
    const c = ranger(5);
    startCombat(c);
    startTurn(c);
    spendEconomy(c, "bonus", "Cast Hunter's Mark", { spellLevel: 1 });
    expect(spendEconomy(c, "reaction", "Cast Absorb Elements", { spellLevel: 1 })).toMatch(/bonus-action spell/);
  });

  it("damage at 0 HP adds death save failures; massive damage kills", () => {
    const c = ranger(5);
    c.hp.current = 5;
    expect(takeDamage(c, 10)).toMatch(/drop to 0/);
    expect(takeDamage(c, 3)).toMatch(/death saving throw failure/);
    expect(c.deathSaves.failures).toBe(1);
    const d = ranger(5);
    d.hp.current = 5;
    expect(takeDamage(d, 40)).toMatch(/die instantly/);
    expect(d.deathSaves.failures).toBe(3);
  });

  it("Champion crit range", () => {
    const c = ranger(5);
    expect(critRange(c)).toBe(20);
    c.features.push({ id: "x", name: "Improved Critical", origin: "", kind: "class", description: "" });
    expect(critRange(c)).toBe(19);
  });

  it("Unarmored Defense only from the first class", () => {
    const c = newCharacter("Monk/Barb");
    c.abilities = { str: 10, dex: 14, con: 16, int: 10, wis: 12, cha: 8 };
    c.acMode = "auto";
    c.classes = [
      { source: "srd", key: "monk", name: "Monk", level: 2, hitDie: 8 },
      { source: "srd", key: "barbarian", name: "Barbarian", level: 1, hitDie: 12 },
    ];
    expect(armorClassBreakdown(c).total).toBe(13); // 10 + Dex 2 + Wis 1, not Con 3
  });

  it("dwarves keep their speed in heavy armor; exhaustion applies in any form", () => {
    const c = ranger(1);
    c.race = "Hill Dwarf";
    c.speed = 25;
    c.equipment.push({ id: "a", name: "Plate", qty: 1, weight: 65, equipped: true, notes: "", data: { armor: { type: "heavy", base: 18, strength: 15 } } } as never);
    expect(speedBreakdown(c).total).toBe(25);
    c.exhaustion = 2;
    expect(speedBreakdown(c).total).toBe(12);
  });

  it("doesn't misread rules text", () => {
    expect(durationFromText("While traveling for an hour or more in your favored terrain")).toBeUndefined();
    expect(detectUses("The beast's hit point maximum equals four times your ranger level. It regains hit points when you finish a long rest.")).toBeNull();
    expect(featureKind(ranger(3), { name: "Dread Ambusher", description: "If you take the Attack action on that turn, you can make one additional weapon attack" })).toBe("free");
    expect(featureKind(ranger(3), { name: "Gloom Stalker", description: "If you take the Attack action on that turn" })).toBeUndefined();
  });

  it("splits Deft Explorer Improvement's benefit", () => {
    const parts = featureSections({ name: "Deft Explorer Improvement", description: "You gain an additional benefit when you reach 6th level in this class.\n\n**Roving.** Your walking speed increases by 5." });
    expect(parts.map((p) => p.name)).toContain("Roving");
  });

  it("offers Iron Mind's saving throw", () => {
    const [choice] = textChoices("You gain proficiency in Wisdom saving throws. If you already have this proficiency, you instead gain proficiency in Intelligence or Charisma saving throws (your choice).");
    expect(choice.kind).toBe("save");
    expect(choice.options.map((o) => o.key)).toEqual(["wis", "int", "cha"]);
  });
});
