import { describe, expect, it } from "vitest";
import { weaponProficient } from "../items";

describe("weaponProficient", () => {
  const wizard = "Daggers, darts, slings, quarterstaffs, light crossbows";
  const rogue = "Simple weapons, hand crossbows, longswords, rapiers, shortswords";
  it("needs the proficiency text to cover simple weapons", () => {
    expect(weaponProficient(wizard, "Simple Melee", "Mace")).toBe(false);
    expect(weaponProficient(wizard, "Simple Melee", "Dagger")).toBe(true);
    expect(weaponProficient(rogue, "Simple Melee", "Mace")).toBe(true);
  });
  it("matches weapons by base name and plural", () => {
    expect(weaponProficient(rogue, "Martial Melee", "Longsword +1")).toBe(true);
    expect(weaponProficient(rogue, "Martial Ranged", "Hand Crossbow")).toBe(true);
    expect(weaponProficient(rogue, "Martial Ranged", "Heavy Crossbow")).toBe(false);
    expect(weaponProficient(wizard, "Simple Ranged", "Light Crossbow")).toBe(true);
    expect(weaponProficient(rogue, "Martial Melee", "Greatsword")).toBe(false);
  });
  it("reads class proficiency lines", () => {
    expect(weaponProficient("Armor: light, medium, shield\nWeapons: simple", "Simple Melee", "Mace")).toBe(true);
    expect(weaponProficient("Weapons: simple, hand crossbows, longswords", "Martial Melee", "Longsword")).toBe(true);
    expect(weaponProficient("Armor: light\nWeapons: simple", "Martial Melee", "Longsword")).toBe(false);
  });
  it("martial weapons", () => {
    expect(weaponProficient("Simple weapons, martial weapons", "Martial Melee", "Greatsword")).toBe(true);
  });
});
