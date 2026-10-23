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

describe("attack ↔ weapon link", () => {
  it("matches an unlinked attack to the weapon by name in any word order", () => {
    const c = battleSmith();
    const xb: Item = { id: "xb", name: "Light Crossbow", qty: 1, weight: 5, equipped: true, notes: "", data: { weapon: { damage: "1d8", damageType: "piercing", properties: ["Ammunition"], ranged: true, finesse: false } } };
    infuse(xb, "Repeating Shot");
    c.equipment = [xb];
    const typed: Attack = { id: "t", name: "Crossbow, light", ability: "dex", proficient: true, bonus: 0, damage: "1d8", damageType: "piercing", notes: "" };
    expect(attackAbility(c, typed).ability).toBe("int");
  });
});

describe("Battle Smith kit", () => {
  it("offers another artisan's tool only as a fallback for smith's tools", async () => {
    const { textChoices, hasToolProficiency } = await import("../textChoices");
    const ch = textChoices("When you adopt this specialization at 3rd level, you gain proficiency with smith's tools. If you already have this proficiency, you gain proficiency with one other type of artisan's tools of your choice.");
    expect(ch).toHaveLength(1);
    expect(ch[0].ifProficient).toBe("smith's tools");
    expect(ch[0].options.some((o) => o.key === "smith's tools")).toBe(false);
    expect(hasToolProficiency("Tools: thieves' tools, tinker's tools, Smith's tools", "smith's tools")).toBe(true);
    expect(hasToolProficiency("Tools: thieves' tools, tinker's tools", "smith's tools")).toBe(false);
  });
  it("creates a Steel Defender that follows level and Intelligence", async () => {
    const { syncSteelDefender } = await import("../steelDefender");
    const c = battleSmith();
    c.features.push({ id: "sd", name: "Steel Defender", origin: "Artificer 3", kind: "subclass", description: "" });
    syncSteelDefender(c);
    const d = c.companions!.find((p) => p.derived === "steel-defender")!;
    // 2 + INT 4 + 5 × 3
    expect(d.hp.max).toBe(21);
    expect(d.ac).toBe(15);
    expect(d.monster!.actions[0].text).toMatch(/\+6 to hit.*1d8 \+ 2 force/);
    d.hp.current = 10;
    c.classes[0].level = 15;
    syncSteelDefender(c);
    expect(d.hp.max).toBe(81);
    expect(d.hp.current).toBe(70);
    expect(d.ac).toBe(17);
    expect(d.monster!.reactions[0].text).toMatch(/1d4 \+ 4 force/);
    c.features = c.features.filter((f) => f.name !== "Steel Defender");
    syncSteelDefender(c);
    expect(c.companions).toEqual([]);
  });
});
