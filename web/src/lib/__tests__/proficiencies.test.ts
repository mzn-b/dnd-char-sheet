import { describe, expect, it } from "vitest";
import { alreadyOwned, mergeOwned, ownedFrom, ownedFromEffects, ownedFromSelections, parseProficiencies, removeProficiencyItem } from "../proficiencies";
import type { Choice } from "../types";

const lang: Choice = { id: "lang", kind: "proficiency", prefix: "Languages", count: 1, label: "Languages: choose 1", options: ["Common", "Elvish", "Dwarvish"].map((n) => ({ key: n.toLowerCase(), name: n })) };
const skills: Choice = { id: "sk", kind: "skill", count: 2, label: "Skills", options: [{ key: "perception", name: "Perception" }, { key: "stealth", name: "Stealth" }] };
const mixed: Choice = { id: "mix", kind: "proficiency", prefix: "mixed", count: 1, label: "Any", options: [{ key: "language:elvish", name: "Elvish" }, { key: "tool:dice set", name: "Dice set" }, { key: "skill:stealth", name: "Stealth" }] };

describe("proficiency lines", () => {
  it("groups lines by category, without duplicates, and keeps free text apart", () => {
    const p = parseProficiencies("Armor: light, medium, shield\nWeapons: simple\nLanguages: Common, Elvish\nLanguages: common\nTools: Smith's tools\nSpecial training with sleds");
    expect(p.byCategory.Languages).toEqual(["Common", "Elvish"]);
    expect(p.byCategory.Armor).toEqual(["light", "medium", "shield"]);
    expect(p.other).toEqual(["Special training with sleds"]);
  });
  it("removes an item from whichever line holds it", () => {
    expect(removeProficiencyItem("Languages: Common, Elvish\nTools: Dice set\nLanguages: Elvish", "Languages", "elvish")).toBe("Languages: Common\nTools: Dice set");
  });
});

describe("already had", () => {
  it("a race's own Common isn't offered in its language pick", () => {
    const owned = ownedFromEffects([{ kind: "proficiency", value: "Languages: Common, Elvish" }]);
    expect(alreadyOwned(owned, lang, lang.options[0])).toBe(true);
    expect(alreadyOwned(owned, lang, lang.options[2])).toBe(false);
  });
  it("skills and picks from the other step count, including mixed choices", () => {
    const owned = mergeOwned(ownedFrom({ proficienciesAndLanguages: "Weapons: Simple weapons", skills: { perception: 1 } }), ownedFromSelections([lang], { lang: ["elvish"] }));
    expect(alreadyOwned(owned, skills, skills.options[0])).toBe(true);
    expect(alreadyOwned(owned, skills, skills.options[1])).toBe(false);
    expect(alreadyOwned(owned, mixed, mixed.options[0])).toBe(true);
    expect(alreadyOwned(owned, mixed, mixed.options[1])).toBe(false);
  });
  it('treats "simple" and "Simple weapons" as the same', () => {
    const owned = ownedFrom({ proficienciesAndLanguages: "Weapons: simple\nArmor: Light armor", skills: {} });
    expect(owned.items.Weapons.has("simple")).toBe(true);
    expect(owned.items.Armor.has("light")).toBe(true);
  });
});
