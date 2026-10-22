import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { eldritchBlastBeams, spellDamageBonuses } from "../spellBonuses";
import type { Character, Companion, SpellEntry } from "../types";

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

describe("creature initiative reminders", () => {
  const creature = (name: string, role: Companion["role"]): Companion => ({ id: name, name, kind: "", ac: 12, hp: { max: 5, current: 5 }, speed: "30 ft", notes: "", role });
  it("asks for a familiar's initiative in round 1 only", async () => {
    const { reminders, startCombat } = await import("../combat");
    const c = warlock([]);
    c.companions = [creature("Owl", "familiar")];
    startCombat(c);
    expect(reminders(c).find((r) => r.source === "Owl")?.text).toMatch(/roll its initiative/);
    c.combat!.round = 2;
    expect(reminders(c).find((r) => r.source === "Owl")).toBeUndefined();
  });
  it("asks again in the round a creature is summoned", async () => {
    const { addCompanion, reminders, startCombat } = await import("../combat");
    const c = warlock([]);
    startCombat(c);
    c.combat!.round = 3;
    addCompanion(c, creature("Wolf", "summon"));
    expect(reminders(c).find((r) => r.source === "Wolf")?.when).toBe("turnStart");
    c.combat!.round = 4;
    expect(reminders(c).find((r) => r.source === "Wolf")).toBeUndefined();
  });
  it("a Drakewarden drake shares your initiative", async () => {
    const { reminders, startCombat } = await import("../combat");
    const c = warlock([]);
    c.features.push({ id: "dc", name: "Drake Companion", origin: "Ranger 3", kind: "subclass", description: "" });
    c.companions = [creature("Drake", "companion")];
    startCombat(c);
    expect(reminders(c).find((r) => r.source === "Drake")?.text).toMatch(/shares your initiative/);
  });
});

describe("Mage Armor and AC effects", () => {
  const leather = { id: "la", name: "Leather Armor", qty: 1, weight: 10, equipped: true, notes: "", data: { armor: { base: 11, type: "light" as const } } };
  const base = () => {
    const c = warlock([]);
    c.acMode = "auto";
    c.abilities.dex = 14;
    return c;
  };
  it("sets AC to 13 + Dex while unarmored", async () => {
    const { armorClassBreakdown } = await import("../rules");
    const c = base();
    expect(armorClassBreakdown(c).total).toBe(12);
    c.lastingEffects = [{ id: "m", name: "Mage Armor" }];
    expect(armorClassBreakdown(c).total).toBe(15);
  });
  it("does nothing over worn armor", async () => {
    const { armorClassBreakdown } = await import("../rules");
    const c = base();
    c.equipment = [leather];
    c.lastingEffects = [{ id: "m", name: "Mage Armor" }];
    expect(armorClassBreakdown(c).total).toBe(13);
  });
  it("adds Shield's +5 while it lasts", async () => {
    const { armorClassBreakdown } = await import("../rules");
    const { startCombat } = await import("../combat");
    const c = base();
    startCombat(c);
    c.combat!.effects.push({ id: "s", name: "Shield", source: "spell", startedRound: 1, rounds: null, untilNextTurn: true, reminders: [] });
    expect(armorClassBreakdown(c).total).toBe(17);
  });
  it("a long rest ends it", async () => {
    const { applyRest } = await import("../../components/sheet/RestDialog");
    const c = base();
    c.lastingEffects = [{ id: "m", name: "Mage Armor" }];
    applyRest(c, "long");
    expect(c.lastingEffects).toEqual([]);
  });
  it("calls a familiar a familiar, whatever its form", async () => {
    const { reminders, startCombat } = await import("../combat");
    const c = base();
    c.companions = [{ id: "o", name: "Owl", kind: "", ac: 11, hp: { max: 1, current: 1 }, speed: "5 ft", notes: "", role: "familiar" }];
    startCombat(c);
    expect(reminders(c).find((r) => r.source === "Owl")?.text).toMatch(/^Your familiar \(Owl\): roll its initiative/);
  });
});
