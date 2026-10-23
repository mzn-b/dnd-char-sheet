import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { infuse } from "../infusions";
import { attackAbility } from "../attacks";
import { attackBonus, damageBonus } from "../../components/sheet/AttacksPanel";
import type { Attack, Character, Item } from "../types";

const battleSmith = (withFeature = true): Character => {
  const c = newCharacter("Smith");
  c.abilities = { ...c.abilities, str: 12, dex: 14, int: 18 };
  c.classes = [{ key: "Artificer|TCE", name: "Artificer", level: 3, hitDie: 8, source: "5etools" }] as Character["classes"];
  if (withFeature) c.features = [{ id: "br", name: "Battle Ready", origin: "Artificer 3", kind: "subclass", description: "" }];
  return c;
};
const sword = (): Item => ({ id: "ls", name: "Longsword", qty: 1, weight: 3, equipped: true, notes: "", data: { weapon: { damage: "1d8", damageType: "slashing", properties: [], ranged: false, finesse: false } } });
const attack: Attack = { id: "a", name: "Longsword", itemId: "ls", ability: "str", proficient: true, bonus: 0, damage: "1d8", damageType: "slashing", notes: "" };

describe("Battle Ready", () => {
  it("uses Intelligence with an infused (magic) weapon", () => {
    const c = battleSmith();
    const w = sword();
    c.equipment = [w];
    expect(attackAbility(c, attack).ability).toBe("str");
    infuse(w, "Enhanced Weapon");
    const d = structuredClone(c);
    expect(attackAbility(d, attack).ability).toBe("int");
    // INT +4, proficiency +2, Enhanced Weapon +1
    expect(attackBonus(d, attack)).toBe(7);
    expect(damageBonus(d, attack)).toBe(5);
  });
  it("needs the feature, and keeps a better Strength or Dexterity", () => {
    const c = battleSmith(false);
    const w = sword();
    infuse(w, "Enhanced Weapon");
    c.equipment = [w];
    expect(attackAbility(c, attack).ability).toBe("str");
    const strong = battleSmith();
    strong.abilities.str = 20;
    strong.equipment = [w];
    expect(attackAbility(strong, attack).ability).toBe("str");
  });
});
