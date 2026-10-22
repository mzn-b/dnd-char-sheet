import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { eldritchBlastBeams, spellDamageBonuses } from "../spellBonuses";
import type { Character, SpellEntry } from "../types";

const warlock = (invocations: string[]): Character => {
  const c = newCharacter("Test");
  c.abilities.cha = 16;
  c.classes = [{ key: "Warlock|PHB", name: "Warlock", level: 5, hitDie: 8, source: "5etools" }] as Character["classes"];
  c.features = [{
    id: "inv", name: "Eldritch Invocations", origin: "Warlock 2", kind: "class", description: "",
    subfeatures: invocations.map((name, i) => ({ id: `s${i}`, choiceId: "inv", key: name, name, description: "" })),
  }];
  return c;
};
const spell = (name: string, level = 0): SpellEntry => ({ id: name, ref: { source: "5etools", key: name, name }, level, classKey: "Warlock|PHB", prepared: true, alwaysPrepared: false, notes: "" });

describe("spell damage bonuses", () => {
  it("adds Charisma to Eldritch Blast with Agonizing Blast", () => {
    expect(spellDamageBonuses(warlock(["Agonizing Blast"]), spell("Eldritch Blast"))).toEqual([{ amount: 3, source: "Agonizing Blast" }]);
  });
  it("adds nothing without the invocation or to other spells", () => {
    expect(spellDamageBonuses(warlock([]), spell("Eldritch Blast"))).toEqual([]);
    expect(spellDamageBonuses(warlock(["Agonizing Blast"]), spell("Toll the Dead"))).toEqual([]);
  });
  it("fires more beams at 5th, 11th and 17th level", () => {
    expect([1, 4, 5, 10, 11, 17, 20].map(eldritchBlastBeams)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });
});

describe("Dark One's Blessing", () => {
  it("reminds on a hit how much temporary HP a kill gives", async () => {
    const { reminders } = await import("../combat");
    const c = warlock([]);
    c.features.push({ id: "dob", name: "Dark One's Blessing", origin: "Warlock 1", kind: "subclass", description: "" });
    const r = reminders(c, {}).find((x) => x.source === "Dark One's Blessing");
    expect(r?.when).toBe("hit");
    expect(r?.text).toMatch(/gain 8 temporary HP/);
  });
});
