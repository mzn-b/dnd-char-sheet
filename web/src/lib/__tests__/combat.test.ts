import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { activatableEffects, activateEffect, addEffect, durationRounds, effectForSpell, endEffect, endTurn, reminders, roundsLeft, startCombat, startTurn } from "../combat";
import type { Character, SpellEntry } from "../types";

const spell = (name: string): SpellEntry => ({ id: name, ref: { source: "srd", key: name, name }, level: 1, prepared: true, alwaysPrepared: false, notes: "" });

function fighter(): Character {
  const c = newCharacter("Test");
  c.classes = [{ source: "srd", key: "barbarian", name: "Barbarian", level: 5, hitDie: 12 }];
  c.features.push({ id: "f1", name: "Rage", origin: "Barbarian 1", kind: "class", description: "" });
  return c;
}

describe("combat", () => {
  it("parses spell durations into rounds", () => {
    expect(durationRounds("Concentration, up to 1 minute")).toBe(10);
    expect(durationRounds("1 round")).toBe(1);
    expect(durationRounds("Concentration, up to 10 minutes")).toBe(100);
    expect(durationRounds("Instantaneous")).toBeUndefined();
  });

  it("rounds advance with your turns and effects expire", () => {
    const c = fighter();
    startCombat(c, 15);
    startTurn(c); // round 1
    const bless = effectForSpell(c, spell("Bless"), { meta: { Duration: "Concentration, up to 1 minute" }, spell: { concentration: true } } as never)!;
    addEffect(c, bless);
    expect(bless.rollBonus?.attack).toBe("1d4");
    expect(roundsLeft(c, bless)).toBe(10);
    for (let i = 0; i < 9; i++) { endTurn(c); startTurn(c); }
    expect(c.combat!.round).toBe(10);
    expect(c.combat!.effects.some((e) => e.name === "Bless")).toBe(true);
    endTurn(c);
    const ended = startTurn(c);
    expect(c.combat!.round).toBe(11);
    expect(ended).toContain("Bless");
  });

  it("Shield lasts until the start of your next turn", () => {
    const c = fighter();
    startCombat(c);
    startTurn(c);
    endTurn(c);
    addEffect(c, effectForSpell(c, spell("Shield"), { meta: { Duration: "1 round" }, spell: {} } as never)!);
    expect(startTurn(c)).toContain("Shield");
  });

  it("activating Rage spends a use and adds reminders with the right bonus", () => {
    const c = fighter();
    startCombat(c);
    const rage = activatableEffects(c).find((a) => a.name === "Rage")!;
    expect(rage.left).toBe(3);
    activateEffect(c, rage.def, rage.name);
    expect(c.resourcesUsed?.["barbarian:rage"]).toBe(1);
    expect(reminders(c).some((r) => r.when === "hit" && /\+2 damage/.test(r.text))).toBe(true);
  });

  it("ending a concentration effect ends concentration", () => {
    const c = fighter();
    startCombat(c);
    c.concentration = { name: "Bless" };
    const e = effectForSpell(c, spell("Bless"), { meta: { Duration: "Concentration, up to 1 minute" }, spell: { concentration: true } } as never)!;
    addEffect(c, e);
    endEffect(c, e.id);
    expect(c.concentration).toBeNull();
  });

  it("generic spells get reminders from their text", () => {
    const c = fighter();
    startCombat(c);
    const e = effectForSpell(c, spell("Ensnaring Gloom"), {
      meta: { Duration: "Concentration, up to 1 minute" },
      spell: { concentration: true },
      description: "Until the spell ends, you can use a bonus action on each of your turns to move the gloom 10 feet. A creature takes 2d6 cold damage.",
    } as never)!;
    expect(e.reminders.some((r) => r.when === "turnStart")).toBe(true);
  });
});
