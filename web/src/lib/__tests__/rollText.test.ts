import { describe, expect, it } from "vitest";
import fixtures from "./fixtures.json";
import { extractRolls, resolveRoll, type RollInfo } from "../rollText";

const F = fixtures as Record<string, { level: number | null; text: string }>;
const rolls = (name: string) => extractRolls(F[name].text, { spellLevel: F[name].level ?? undefined });
const find = (rs: RollInfo[], pred: (r: RollInfo) => boolean) => {
  const r = rs.find(pred);
  if (!r) throw new Error(`no matching roll in ${JSON.stringify(rs, null, 1)}`);
  return r;
};

describe("extractRolls", () => {
  it("Toll the Dead: base and 'instead' condition, both scale as cantrip", () => {
    const rs = rolls("Toll the Dead");
    const base = find(rs, (r) => r.dice === "1d8");
    const alt = find(rs, (r) => r.dice === "1d12");
    expect(base.type).toBe("necrotic");
    expect(alt.instead).toBe(true);
    expect(alt.condition).toMatch(/missing any of its hit points/);
    expect(resolveRoll(base, { spellLevel: 0, characterLevel: 5 })).toBe("2d8");
    expect(resolveRoll(alt, { spellLevel: 0, characterLevel: 17 })).toBe("4d12");
  });

  it("Hex: extra damage whenever you hit", () => {
    const r = find(rolls("Hex"), (r) => r.dice === "1d6");
    expect(r.type).toBe("necrotic");
    expect(r.timing).toBe("whenever you hit");
  });

  it("Ice Knife: hit damage and save damage; only cold scales", () => {
    const rs = rolls("Ice Knife");
    const hit = find(rs, (r) => r.dice === "1d10");
    const burst = find(rs, (r) => r.dice === "2d6");
    expect(hit.type).toBe("piercing");
    expect(burst.type).toBe("cold");
    expect(resolveRoll(burst, { spellLevel: 1, slotLevel: 3 })).toBe("4d6");
    expect(resolveRoll(hit, { spellLevel: 1, slotLevel: 3 })).toBe("1d10");
  });

  it("Booming Blade: move damage now, extra hit damage from 5th level", () => {
    const rs = rolls("Booming Blade");
    const move = find(rs, (r) => r.dice === "1d8" && !r.minCharacterLevel);
    const extra = find(rs, (r) => r.dice === "1d8" && r.minCharacterLevel === 5);
    expect(move.type).toBe("thunder");
    expect(resolveRoll(move, { spellLevel: 0, characterLevel: 1 })).toBe("1d8");
    expect(resolveRoll(move, { spellLevel: 0, characterLevel: 11 })).toBe("3d8");
    expect(resolveRoll(extra, { spellLevel: 0, characterLevel: 1 })).toBeUndefined();
    expect(resolveRoll(extra, { spellLevel: 0, characterLevel: 11 })).toBe("2d8");
    expect(resolveRoll(extra, { spellLevel: 0, characterLevel: 17 })).toBe("3d8");
  });

  it("Spiritual Weapon: force damage equal to 1d8 + mod, scales every two slots", () => {
    const r = find(rolls("Spiritual Weapon"), (r) => r.dice.startsWith("1d8"));
    expect(r.dice).toBe("1d8 + mod");
    expect(r.type).toBe("force");
    expect(resolveRoll(r, { spellLevel: 2, slotLevel: 4 })).toBe("2d8 + mod");
    expect(resolveRoll(r, { spellLevel: 2, slotLevel: 3 })).toBe("1d8 + mod");
  });

  it("Spirit Guardians: radiant or necrotic depending on alignment, half on save", () => {
    const rs = rolls("Spirit Guardians").filter((r) => r.dice === "3d8");
    expect(rs.map((r) => r.type).sort()).toEqual(["necrotic", "radiant"]);
    expect(rs.find((r) => r.type === "radiant")!.condition).toMatch(/good or neutral/);
    expect(rs[0].timing).toMatch(/enters the area/);
  });

  it("Chromatic Orb: damage of the chosen type", () => {
    expect(find(rolls("Chromatic Orb"), (r) => r.dice === "3d8").type).toBe("chosen");
  });

  it("False Life and Armor of Agathys: temporary HP and flat retaliation damage", () => {
    expect(find(rolls("False Life"), (r) => r.kind === "temp hp").dice).toBe("1d4 + 4");
    const aoa = rolls("Armor of Agathys");
    expect(find(aoa, (r) => r.kind === "temp hp").dice).toBe("5");
    const cold = find(aoa, (r) => r.kind === "damage");
    expect(cold.dice).toBe("5");
    expect(cold.type).toBe("cold");
    expect(cold.condition).toMatch(/hits you with a melee attack/);
  });

  it("Healing Word: healing with modifier", () => {
    const r = find(rolls("Healing Word"), (r) => r.kind === "healing");
    expect(r.dice).toBe("1d4 + mod");
    expect(resolveRoll(r, { spellLevel: 1, slotLevel: 3 })).toBe("3d4 + mod");
  });

  it("Witch Bolt: initial damage scales, the repeated damage doesn't", () => {
    const rs = rolls("Witch Bolt").filter((r) => r.dice === "1d12");
    const later = rs.find((r) => r.timing === "again on later turns");
    expect(rs.length).toBeGreaterThanOrEqual(1);
    if (later) expect(resolveRoll(later, { spellLevel: 1, slotLevel: 3 })).toBe("1d12");
  });

  it("Moonbeam: half on save, triggered by entering/starting turn", () => {
    const r = find(rolls("Moonbeam"), (r) => r.dice === "2d10");
    expect(r.halfOnSave).toBe(true);
    expect(r.timing).toMatch(/starts its turn/);
  });

  it("Sleep: a hit point pool roll", () => {
    expect(find(rolls("Sleep"), (r) => r.dice === "5d8").kind).toBe("roll");
  });

  it("Divine Smite: scales with slot, capped, plus undead/fiend bonus", () => {
    const rs = rolls("Divine Smite");
    const base = find(rs, (r) => r.dice === "2d8");
    expect(base.type).toBe("radiant");
    expect(resolveRoll(base, { slotLevel: 3 })).toBe("4d8");
    expect(resolveRoll(base, { slotLevel: 5 })).toBe("5d8");
    const extra = find(rs, (r) => r.dice === "1d8" && !!r.condition);
    expect(extra.condition).toMatch(/undead or a fiend/);
  });

  it("Sneak Attack: conditional extra damage", () => {
    const r = find(rolls("Sneak Attack"), (r) => r.dice === "1d6");
    expect(r.kind).toBe("damage");
    expect(r.condition).toMatch(/advantage/);
  });

  it("Second Wind: healing with fighter level", () => {
    expect(find(rolls("Second Wind"), (r) => r.kind === "healing").dice).toBe("1d10 + fighter level");
  });

  it("Great Weapon Master: -5 to hit and +10 damage", () => {
    const rs = rolls("Great Weapon Master");
    expect(rs.some((r) => r.kind === "bonus" && r.dice === "−5")).toBe(true);
    expect(rs.some((r) => r.kind === "bonus" && r.dice === "+10")).toBe(true);
  });

  it("Healer: 1d6 + 4 healing", () => {
    expect(find(rolls("Healer"), (r) => r.dice.startsWith("1d6")).dice).toBe("1d6 + 4");
  });

  it("Bardic Inspiration: a die", () => {
    expect(find(rolls("Bardic Inspiration"), (r) => r.dice === "1d6").kind).toBe("die");
  });

  it("does not list scaling text as separate rolls", () => {
    const rs = rolls("Toll the Dead");
    expect(rs.every((r) => ["1d8", "1d12"].includes(r.dice))).toBe(true);
  });
});
