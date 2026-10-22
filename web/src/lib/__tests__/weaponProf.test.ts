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
  it("martial weapons", () => {
    expect(weaponProficient("Simple weapons, martial weapons", "Martial Melee", "Greatsword")).toBe(true);
  });
});
