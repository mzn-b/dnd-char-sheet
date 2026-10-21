import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { abilityScore, armorClassBreakdown, hpMax, initiative, passiveScore, saveBonus, skillBonus, speed, spellSaveDC } from "../rules";
import { attackBonus, damageBonus } from "../../components/sheet/AttacksPanel";
import { allModifiers } from "../modifiers";
import type { Character, Item } from "../types";

const item = (name: string, data: Item["data"], extra: Partial<Item> = {}): Item => ({ id: name, name, qty: 1, weight: 0, equipped: true, notes: "", data, ...extra });
const feature = (c: Character, name: string) => c.features.push({ id: name, name, origin: "", kind: "feat", description: "" });

function base(): Character {
  const c = newCharacter("Test");
  c.classes = [{ source: "srd", key: "fighter", name: "Fighter", level: 4, hitDie: 10 }];
  c.abilities = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
  c.hp.max = 36;
  c.acMode = "auto";
  c.speed = 30;
  return c;
}

describe("modifiers", () => {
  it("applies Cloak of Protection only while attuned", () => {
    const c = base();
    c.equipment.push(item("Cloak of Protection", { bonuses: { ac: 1, save: 1 } }, { attunement: true }));
    expect(armorClassBreakdown(c).total).toBe(12);
    c.equipment[0].attuned = true;
    expect(armorClassBreakdown(structuredClone(c)).total).toBe(13);
    expect(saveBonus(structuredClone(c), "wis")).toBe(2);
  });

  it("raises Strength with a Belt of Giant Strength", () => {
    const c = base();
    c.equipment.push(item("Belt", { bonuses: { abilitySet: { str: 21 } } }, { attunement: true, attuned: true }));
    expect(abilityScore(c, "str")).toBe(21);
  });

  it("adds magic weapon bonuses only to that weapon's attack", () => {
    const c = base();
    c.equipment.push(item("+1 Longsword", { weapon: { damage: "1d8", damageType: "slashing", properties: [], ranged: false, finesse: false }, bonuses: { weaponAttack: 1, weaponDamage: 1 } }, { equipped: false }));
    const sword = { id: "a", name: "+1 Longsword", ability: "str" as const, proficient: true, bonus: 0, damage: "1d8", damageType: "slashing", notes: "", itemId: "+1 Longsword" };
    const axe = { ...sword, id: "b", name: "Handaxe", itemId: undefined };
    expect(attackBonus(c, sword)).toBe(3 + 2 + 1);
    expect(damageBonus(c, sword)).toBe(4);
    expect(attackBonus(c, axe)).toBe(5);
  });

  it("handles Tough, Alert, Mobile, Observant", () => {
    const c = base();
    ["Tough", "Alert", "Mobile", "Observant"].forEach((n) => feature(c, n));
    expect(hpMax(c)).toBe(36 + 8);
    expect(initiative(c)).toBe(2 + 5);
    expect(speed(c)).toBe(40);
    expect(passiveScore(c, "perception")).toBe(10 + 1 + 5);
  });

  it("gives Archery only to ranged attacks and Defense only in armor", () => {
    const c = base();
    c.features.push({ id: "fs", name: "Fighting Style", origin: "", kind: "class", description: "", subfeatures: [{ id: "s", choiceId: "x", key: "archery", name: "Archery", description: "" }, { id: "t", choiceId: "x", key: "defense", name: "Defense", description: "" }] });
    const bow = { id: "a", name: "Longbow", ability: "dex" as const, proficient: true, bonus: 0, damage: "1d8", damageType: "piercing", notes: "", ranged: true };
    expect(attackBonus(c, bow)).toBe(2 + 2 + 2);
    expect(attackBonus(c, { ...bow, ranged: false })).toBe(4);
    expect(armorClassBreakdown(c).total).toBe(12);
    c.equipment.push(item("Chain Mail", { armor: { base: 16, type: "heavy" } }));
    expect(armorClassBreakdown(structuredClone(c)).total).toBe(17);
  });

  it("Jack of All Trades adds half proficiency to unproficient checks and initiative", () => {
    const c = base();
    c.classes = [{ source: "srd", key: "bard", name: "Bard", level: 2, hitDie: 8 }];
    feature(c, "Jack of All Trades");
    c.skills.persuasion = 1;
    expect(skillBonus(c, "arcana")).toBe(0 + 1);
    expect(skillBonus(c, "persuasion")).toBe(-1 + 2);
    expect(initiative(c)).toBe(3);
  });

  it("Unarmored Movement scales and switches off in armor", () => {
    const c = base();
    c.classes = [{ source: "srd", key: "monk", name: "Monk", level: 6, hitDie: 8 }];
    feature(c, "Unarmored Movement");
    expect(speed(c)).toBe(45);
    c.equipment.push(item("Leather", { armor: { base: 11, type: "light" } }));
    expect(speed(structuredClone(c))).toBe(30);
  });

  it("can be switched off and supports custom modifiers", () => {
    const c = base();
    feature(c, "Alert");
    c.customModifiers = [{ id: "x", label: "Ioun Stone", target: "spellDc", value: 1 }];
    c.disabledModifiers = ["feature:alert"];
    expect(initiative(c)).toBe(2);
    expect(spellSaveDC(c, "int")).toBe(8 + 2 + 0 + 1);
    expect(allModifiers(c)).toHaveLength(2);
  });

  it("applies variant encumbrance and exhaustion", () => {
    const c = base();
    c.options = { encumbrance: "variant" };
    c.equipment.push(item("Anvil", {}, { weight: 100, equipped: false }));
    expect(speed(c)).toBe(20);
    c.exhaustion = 2;
    expect(speed(structuredClone(c))).toBe(10);
  });
});
