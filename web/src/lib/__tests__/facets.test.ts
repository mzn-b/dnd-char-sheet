import { describe, expect, it } from "vitest";
import { deriveFacets, describeFilter, matches, sortBy } from "../facets";
import type { ContentSummary } from "../types";

const spell = (name: string, level: number, facets: ContentSummary["facets"]): ContentSummary => ({ source: "5etools", key: name, name, type: "spell", level, facets });
const spells = [
  spell("Fire Bolt", 0, { school: "Evocation", castingTime: "Action", concentration: false, damageTypes: ["Fire"], range: 120, components: ["V", "S"] }),
  spell("Healing Word", 1, { school: "Evocation", castingTime: "Bonus action", concentration: false, healing: true, range: 60, components: ["V"] }),
  spell("Hex", 1, { school: "Enchantment", castingTime: "Bonus action", concentration: true, damageTypes: ["Necrotic"], range: 90, components: ["V", "S", "M"] }),
  spell("Shield", 1, { school: "Abjuration", castingTime: "Reaction", concentration: false, range: 0, components: ["V", "S"] }),
];

describe("facet filters", () => {
  it("derives controls from the values present", () => {
    const specs = deriveFacets(spells, "spell");
    const by = Object.fromEntries(specs.map((s) => [s.key, s]));
    expect(by.castingTime.kind).toBe("enum");
    expect(by.castingTime.options?.[0]).toEqual({ value: "Bonus action", count: 2 });
    expect(by.concentration.kind).toBe("bool");
    expect(by.range).toMatchObject({ kind: "range", min: 0, max: 120, unit: "ft" });
    expect(by.components.kind).toBe("multi");
  });

  it("filters by value, flag, range and all-of lists", () => {
    const names = (state: Parameters<typeof matches>[2]) => spells.filter((s) => matches(s, "spell", state)).map((s) => s.name);
    expect(names({ castingTime: { values: ["Bonus action"] } })).toEqual(["Healing Word", "Hex"]);
    expect(names({ castingTime: { values: ["Bonus action"] }, concentration: { bool: false } })).toEqual(["Healing Word"]);
    expect(names({ range: { min: 60, max: 100 } })).toEqual(["Healing Word", "Hex"]);
    expect(names({ components: { values: ["S", "M"], all: true } })).toEqual(["Hex"]);
    expect(names({ damageTypes: { values: ["Fire", "Necrotic"] } })).toEqual(["Fire Bolt", "Hex"]);
    // Entries without the value fail an active filter.
    expect(names({ healing: { bool: true } })).toEqual(["Healing Word"]);
  });

  it("filters monsters by CR and sorts by a value", () => {
    const m = (name: string, cr: number, ac: number): ContentSummary => ({ source: "srd", key: name, name, type: "monster", level: cr, facets: { ac } });
    const list = [m("Wolf", 0.25, 13), m("Brown Bear", 1, 11), m("Giant Eagle", 1, 13)];
    expect(list.filter((x) => matches(x, "monster", { cr: { min: 1 } })).map((x) => x.name)).toEqual(["Brown Bear", "Giant Eagle"]);
    expect(sortBy(list, "monster", "ac", true)[2].name).toBe("Brown Bear");
    const spec = deriveFacets(list, "monster").find((s) => s.key === "ac")!;
    expect(describeFilter(spec, { min: 13 })).toBe("Armor class ≥ 13");
  });
});
