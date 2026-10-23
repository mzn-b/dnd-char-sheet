import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { infuse, maxInfusedItems, uninfuse } from "../infusions";
import { attackModifiers } from "../modifiers";
import { armorClassBreakdown } from "../rules";
import type { Character, Item } from "../types";

// Modifiers are cached per character object; the sheet always works on a fresh copy, so do the same here.
const fresh = (c: Character) => structuredClone(c);

const artificer = (level: number): Character => {
  const c = newCharacter("Tinker");
  c.acMode = "auto";
  c.classes = [{ key: "Artificer|TCE", name: "Artificer", level, hitDie: 8, source: "5etools" }] as Character["classes"];
  return c;
};
const longsword = (): Item => ({ id: "ls", name: "Longsword", qty: 1, weight: 3, equipped: true, notes: "", data: { weapon: { damage: "1d8", damageType: "slashing", properties: ["Versatile"], ranged: false, finesse: false } } });
const shield = (): Item => ({ id: "sh", name: "Shield", qty: 1, weight: 6, equipped: true, notes: "", data: { armor: { base: 2, type: "shield" } } });

describe("artificer infusions", () => {
  it("infused items follow the Artificer table", () => {
    expect([1, 2, 5, 6, 10, 14, 18].map((l) => maxInfusedItems(artificer(l)))).toEqual([0, 2, 2, 3, 4, 5, 6]);
  });
  it("Enhanced Weapon adds +1 to attack and damage, +2 from 10th level", () => {
    const c = artificer(2);
    const w = longsword();
    c.equipment = [w];
    infuse(w, "Enhanced Weapon");
    const atk = { id: "a", name: "Longsword", itemId: "ls" } as Parameters<typeof attackModifiers>[1];
    expect(attackModifiers(c, atk).attack.map((m) => m.value)).toEqual([1]);
    expect(attackModifiers(c, atk).damage.map((m) => m.value)).toEqual([1]);
    c.classes[0].level = 10;
    expect(attackModifiers(fresh(c), atk).attack.map((m) => m.value)).toEqual([2]);
  });
  it("Enhanced Defense raises AC; removing it takes the bonus away", () => {
    const c = artificer(2);
    const s = shield();
    c.equipment = [s];
    expect(armorClassBreakdown(c).total).toBe(12);
    infuse(s, "Enhanced Defense");
    expect(armorClassBreakdown(fresh(c)).total).toBe(13);
    uninfuse(s);
    expect(armorClassBreakdown(fresh(c)).total).toBe(12);
  });
  it("infusions that need attunement work only once attuned, and bring their charges", () => {
    const c = artificer(6);
    const s = shield();
    c.equipment = [s];
    infuse(s, "Repulsion Shield");
    expect(s.attunement).toBe(true);
    expect(s.charges).toEqual({ max: 4, used: 0 });
    expect(armorClassBreakdown(fresh(c)).total).toBe(12);
    s.attuned = true;
    expect(armorClassBreakdown(fresh(c)).total).toBe(13);
    uninfuse(s);
    expect(s.attunement).toBeUndefined();
    expect(s.charges).toBeUndefined();
  });
});
