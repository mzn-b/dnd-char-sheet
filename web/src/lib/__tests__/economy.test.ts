import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { startCombat, startTurn } from "../combat";
import { featureKind, kindFromCastingTime, kindFromText, multiattackCount, spendEconomy } from "../economy";

describe("action economy", () => {
  it("reads casting times and feature text", () => {
    expect(kindFromCastingTime("1 bonus action")).toBe("bonus");
    expect(kindFromCastingTime("1 reaction, which you take when you are hit")).toBe("reaction");
    expect(kindFromCastingTime("1 action")).toBe("action");
    expect(kindFromCastingTime("1 minute")).toBe("other");
    expect(kindFromText("On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level.")).toBe("bonus");
    expect(kindFromText("When an attacker that you can see hits you with an attack, you can use your reaction to halve the attack's damage.")).toBe("reaction");
    expect(kindFromText("you can use your action to magically assume the shape of a beast")).toBe("action");
    expect(kindFromText("You have advantage on saving throws against being poisoned.")).toBeUndefined();
  });

  it("knows features whose cost depends on the build", () => {
    const c = newCharacter();
    c.classes = [{ source: "srd", key: "druid", name: "Druid", level: 2, hitDie: 8 }];
    expect(featureKind(c, { name: "Wild Shape", description: "use your action" })).toBe("action");
    c.classes[0].subclass = { source: "srd", key: "moon", name: "Circle of the Moon" };
    expect(featureKind(c, { name: "Wild Shape", description: "use your action" })).toBe("bonus");
    expect(featureKind(c, { name: "Rage", description: "" })).toBe("bonus");
  });

  it("marks the economy, counts Extra Attack and warns when spent", () => {
    const c = newCharacter();
    c.classes = [{ source: "srd", key: "fighter", name: "Fighter", level: 5, hitDie: 10 }];
    c.features.push({ id: "x", name: "Extra Attack", origin: "", kind: "class", description: "" });
    startCombat(c, 10);
    expect(spendEconomy(c, "action", "Longsword", { attack: true })).toMatch(/isn't your turn/);
    startTurn(c);
    expect(spendEconomy(c, "action", "Longsword", { attack: true })).toBeUndefined();
    expect(spendEconomy(c, "action", "Longsword", { attack: true })).toBeUndefined();
    expect(c.combat!.economy.attacks).toBe(2);
    expect(spendEconomy(c, "action", "Longsword", { attack: true })).toMatch(/already used/);
    expect(spendEconomy(c, "bonus", "Second Wind")).toBeUndefined();
    expect(spendEconomy(c, "bonus", "Second Wind")).toMatch(/bonus action is already used/);
  });

  it("counts a beast's Multiattack", () => {
    expect(multiattackCount([{ name: "Multiattack", text: "The bear makes two attacks: one with its bite and one with its claws." }])).toBe(2);
    expect(multiattackCount([{ name: "Bite", text: "Melee Weapon Attack" }])).toBe(1);
    const c = newCharacter();
    startCombat(c);
    startTurn(c);
    spendEconomy(c, "action", "Bite", { attack: true, attacksPerAction: 2 });
    expect(spendEconomy(c, "action", "Claws", { attack: true, attacksPerAction: 2 })).toBeUndefined();
    expect(spendEconomy(c, "action", "Bite", { attack: true, attacksPerAction: 2 })).toMatch(/already used/);
    expect(c.combat!.log.at(-1)!.text).toMatch(/^⚠/);
  });

  it("enforces the bonus-action spell rule", () => {
    const c = newCharacter();
    startCombat(c);
    startTurn(c);
    expect(spendEconomy(c, "bonus", "Healing Word", { spellLevel: 1 })).toBeUndefined();
    expect(spendEconomy(c, "action", "Fire Bolt", { spellLevel: 0 })).toBeUndefined();
    startTurn(c);
    spendEconomy(c, "bonus", "Misty Step", { spellLevel: 2 });
    expect(spendEconomy(c, "action", "Fireball", { spellLevel: 3 })).toMatch(/must be a cantrip/);
  });
});
