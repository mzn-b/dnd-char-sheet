import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { armorClassBreakdown } from "../rules";
import type { Character, Item } from "../types";

const withRace = (name: string, text: string, dex = 14): Character => {
  const c = newCharacter("Test");
  c.acMode = "auto";
  c.abilities.dex = dex;
  c.abilities.con = 16;
  c.features = [{ id: "r", name: "Race", origin: "Race", kind: "race", description: `**${name}.** ${text}` }];
  return c;
};
const armor = (base: number, type: "light" | "medium" | "heavy" | "shield"): Item => ({ id: `${type}${base}`, name: type, qty: 1, weight: 1, equipped: true, notes: "", data: { armor: { base, type } } });

describe("racial natural armor", () => {
  it("Autognome: 13 + Dex while unarmored", () => {
    const c = withRace("Armored Casing", "You are encased in thin metal or some other durable material. While you aren't wearing armor, your base Armor Class is 13 + your Dexterity modifier.");
    expect(armorClassBreakdown(c).total).toBe(15);
    expect(armorClassBreakdown(c).parts[0]).toBe("Armored Casing 13");
    c.equipment = [armor(2, "shield")];
    expect(armorClassBreakdown(structuredClone(c)).total).toBe(17);
    c.equipment = [armor(11, "light")];
    expect(armorClassBreakdown(structuredClone(c)).total).toBe(13);
  });
  it("Lizardfolk and Loxodon may use it over weaker worn armor", () => {
    const liz = withRace("Natural Armor", "You have tough, scaly skin. When you aren't wearing armor, your base AC is 13 + Dexterity modifier. You can use your natural armor to determine your AC if the armor you wear would leave you with a lower AC.");
    liz.equipment = [armor(11, "light")];
    expect(armorClassBreakdown(liz).total).toBe(15);
    const lox = withRace("Natural Armor", "When you aren't wearing armor, your AC is 12 + your Constitution modifier. You can use your natural armor to determine your AC if the armor you wear would leave you with a lower AC.");
    expect(armorClassBreakdown(lox).total).toBe(15);
  });
  it("Tortle: a flat 17", () => {
    const c = withRace("Natural Armor", "Your shell provides you a base AC of 17 (your Dexterity modifier doesn't affect this number). You can't wear light, medium, or heavy armor.", 18);
    expect(armorClassBreakdown(c).total).toBe(17);
  });
  it("Warforged: +1 AC", () => {
    const c = withRace("Integrated Protection", "Your body has built-in defensive layers. You gain a +1 bonus to Armor Class.");
    c.features[0].name = "Integrated Protection";
    expect(armorClassBreakdown(c).total).toBe(13);
  });
});
