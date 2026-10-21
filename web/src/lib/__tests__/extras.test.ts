import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { damageWildShape, fitsPreset, startWildShape, wildShapeLimits } from "../extras";
import type { ContentSummary } from "../types";

const beast = (name: string, cr: number, movement: string[] = []): ContentSummary => ({ source: "srd", key: name, name, type: "monster", level: cr, creatureType: "beast", movement });

describe("extras", () => {
  it("follows the Wild Shape table", () => {
    const c = newCharacter();
    expect(wildShapeLimits(c)).toBeNull();
    c.classes = [{ source: "srd", key: "druid", name: "Druid", level: 2, hitDie: 8 }];
    expect(wildShapeLimits(c)).toMatchObject({ maxCr: 0.25, fly: false, swim: false });
    expect(fitsPreset(c, "wildshape", beast("Wolf", 0.25))).toBe(true);
    expect(fitsPreset(c, "wildshape", beast("Reef Shark", 0.5, ["swim"]))).toBe(false);
    c.classes[0].level = 4;
    expect(fitsPreset(c, "wildshape", beast("Reef Shark", 0.5, ["swim"]))).toBe(true);
    expect(fitsPreset(c, "wildshape", beast("Giant Eagle", 1, ["fly"]))).toBe(false);
    c.classes[0].subclass = { source: "srd", key: "moon", name: "Circle of the Moon" };
    c.classes[0].level = 9;
    expect(wildShapeLimits(c)?.maxCr).toBe(3);
    expect(fitsPreset(c, "familiar", { ...beast("Owl", 0), name: "Owl" })).toBe(true);
  });

  it("carries excess damage over when reverting", () => {
    const c = newCharacter();
    c.hp = { max: 20, current: 20, temp: 0 };
    c.features.push({ id: "w", name: "Wild Shape", origin: "", kind: "class", description: "", uses: { max: 2, used: 0, reset: "short" } });
    c.companions = [{ id: "b", name: "Brown Bear", kind: "", ac: 11, hp: { max: 34, current: 5 }, speed: "40 ft", notes: "", role: "wildshape" }];
    startWildShape(c, "b");
    expect(c.companions[0].hp.current).toBe(34);
    expect(c.features[0].uses!.used).toBe(1);
    expect(damageWildShape(c, 30)).toEqual({ reverted: false, carried: 0 });
    expect(damageWildShape(c, 10)).toEqual({ reverted: true, carried: 6 });
    expect(c.hp.current).toBe(14);
    expect(c.wildShape).toBeNull();
  });
});
