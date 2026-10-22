import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { startCombat, startTurn } from "../combat";
import { featureKind } from "../economy";
import { scaledFeatureDice } from "../featureRolls";
import { splitFeature } from "../featureSections";
import { applyFeatureUse, usesLeft } from "../featureUse";
import { prereqContext, unmetRequirement } from "../prereqs";
import { classResources, resetResources } from "../resources";
import { textChoices, textEffects } from "../textChoices";
import { detectUses } from "../uses";
import type { Character, ClassEntry, Feature } from "../types";

function hero(cls: ClassEntry[]): Character {
  const c = newCharacter("Hero");
  c.classes = cls;
  c.abilities = { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 };
  return c;
}
const feature = (name: string, description = ""): Feature => ({ id: name, name, origin: "", kind: "class", description });

describe("class audit fixes", () => {
  it("reads proficiencies from feature text", () => {
    expect(textEffects("When you choose this domain at 1st level, you gain proficiency with heavy armor.")).toEqual([{ kind: "proficiency", value: "Armor: heavy armor" }]);
    expect(textEffects("You gain proficiency in Wisdom saving throws.")).toEqual([{ kind: "save", ability: "wis" }]);
    expect(textEffects("You gain proficiency in Wisdom saving throws. If you already have this proficiency, you instead gain proficiency in Intelligence or Charisma saving throws (your choice).")).toEqual([]);
    expect(textEffects("you gain proficiency in the Nature and Survival skills if you don't already have it. Your proficiency bonus is doubled for any ability check you make that uses either of those proficiencies.").map((e) => e.kind)).toEqual(["skill", "skill", "expertise", "expertise"]);
    expect(textEffects("you gain proficiency with one type of artisan's tools of your choice.")).toEqual([]);
  });

  it("finds skill choices in prose", () => {
    const [knowledge] = textChoices("You also become proficient in your choice of two of the following skills: Arcana, History, Nature, or Religion. Your proficiency bonus is doubled for any ability check you make that uses either of those skills.");
    expect(knowledge).toMatchObject({ kind: "expertise", grantsProficiency: true, count: 2 });
    expect(knowledge.options.map((o) => o.key)).toEqual(["arcana", "history", "nature", "religion"]);
    const [order] = textChoices("You also gain proficiency in the Intimidation or Persuasion skill (your choice).");
    expect(order.options.map((o) => o.key)).toEqual(["intimidation", "persuasion"]);
    const [lore] = textChoices("you gain proficiency with three skills of your choice.");
    expect(lore.count).toBe(3);
    const [primal] = textChoices("you gain proficiency in one skill of your choice from the list of skills available to barbarians at 1st level.");
    expect(primal.options).toHaveLength(6);
  });

  it("reads use limits", () => {
    expect(detectUses("When you finish a short rest, you can cast… Once you use this feature, you can't use it again until you finish a long rest.")?.reset).toBe("long");
    expect(detectUses("Once you use this feature, you can't use this feature again until you finish a rest.")).toEqual({ formula: 1, reset: "short" });
    expect(detectUses("You have a number of psionic energy dice equal to twice your proficiency bonus. You regain all expended dice when you finish a long rest.")).toBeNull();
    expect(detectUses("Once you have spent this time, you regain expended spell slots when you finish a long rest.")).toBeNull();
  });

  it("splits bundled subclass features", () => {
    const parts = splitFeature(feature("Circle of Stars", "Intro.\n\n**Star Map.** *2nd-level Circle of Stars feature*\n\nYou can cast guiding bolt a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a long rest.\n\n**Starry Form.** *2nd-level Circle of Stars feature*\n\nAs a bonus action, you can expend a use of your Wild Shape feature."));
    expect(parts.map((p) => p.name)).toEqual(["Circle of Stars", "Star Map", "Starry Form"]);
    expect(featureKind(hero([]), parts[2])).toBe("bonus");
  });

  it("spends the pool a feature draws on", () => {
    const c = hero([{ source: "5etools", key: "Druid|PHB", name: "Druid", level: 2, hitDie: 8 }]);
    const starry = feature("Starry Form", "As a bonus action, you can expend a use of your Wild Shape feature to take on a starry form.");
    expect(usesLeft(c, starry)).toBe(2);
    applyFeatureUse(c, starry);
    expect(c.resourcesUsed?.["druid:wildshape"]).toBe(1);
    const cleric = hero([{ source: "5etools", key: "Cleric|PHB", name: "Cleric", level: 6, hitDie: 8 }]);
    const guided = feature("Channel Divinity: Guided Strike", "When you make an attack roll, you can use your Channel Divinity to gain a +10 bonus to the roll.");
    applyFeatureUse(cleric, guided);
    expect(cleric.resourcesUsed?.["cleric:channel"]).toBe(1);
    const monk = hero([{ source: "5etools", key: "Monk|PHB", name: "Monk", level: 5, hitDie: 8 }]);
    applyFeatureUse(monk, feature("Stunning Strike", "When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike."));
    expect(monk.resourcesUsed?.["monk:ki"]).toBe(1);
  });

  it("psionic dice and Sorcerous Restoration", () => {
    const c = hero([{ source: "5etools", key: "Fighter|PHB", name: "Fighter", level: 5, hitDie: 10, subclass: { source: "5etools", key: "x", name: "Psi Warrior" } }]);
    expect(classResources(c).find((r) => r.name === "Psionic Energy Dice")).toMatchObject({ max: 6, die: "d8" });
    expect(scaledFeatureDice(c, "Psionic Strike")).toBe("1d8");
    const s = hero([{ source: "5etools", key: "Sorcerer|PHB", name: "Sorcerer", level: 20, hitDie: 6 }]);
    s.resourcesUsed = { "sorcerer:sorcery": 10 };
    resetResources(s, "short");
    expect(s.resourcesUsed["sorcerer:sorcery"]).toBe(6);
  });

  it("Action Surge gives back the action", () => {
    const c = hero([{ source: "srd", key: "fighter", name: "Fighter", level: 2, hitDie: 10 }]);
    c.features.push(feature("Action Surge", "On your turn, you can take one additional action."));
    startCombat(c);
    startTurn(c);
    c.combat!.economy.action = true;
    applyFeatureUse(c, c.features[0]);
    expect(c.combat!.economy.action).toBe(false);
  });

  it("checks option prerequisites", () => {
    const c = hero([{ source: "5etools", key: "Warlock|PHB", name: "Warlock", level: 2, hitDie: 8 }]);
    const ctx = prereqContext(c, { classKey: "Warlock|PHB", newLevel: 3 });
    expect(unmetRequirement({ key: "a", name: "Thirsting Blade", requires: { level: 5, className: "Warlock", pact: "Blade" } }, ctx)).toMatch(/level 5/);
    expect(unmetRequirement({ key: "b", name: "Agonizing Blast", requires: { spells: ["Eldritch Blast"] } }, ctx)).toMatch(/Eldritch Blast/);
    ctx.spells.add("eldritch blast");
    expect(unmetRequirement({ key: "b", name: "Agonizing Blast", requires: { spells: ["Eldritch Blast"] } }, ctx)).toBeUndefined();
  });
});

describe("races", () => {
  it("splits race traits; flavor stays with the race", async () => {
    const { splitFeature } = await import("../featureSections");
    const parts = splitFeature({ id: "r", name: "Leonin", origin: "Race", kind: "race", description: "**Age.** Old.\n\n**Claws.** Your claws deal 1d4 + Strength.\n\n**Daunting Roar.** As a bonus action, you roar. Once you use this trait, you can't use it again until you finish a short or long rest." });
    expect(parts.map((p) => p.name)).toEqual(["Leonin", "Claws", "Daunting Roar"]);
    expect(parts[0].description).toContain("Age");
    expect(featureKind(hero([]), parts[2])).toBe("bonus");
    expect(detectUses(parts[2].description)).toEqual({ formula: 1, reset: "short" });
  });

  it("keeps repeated picks for +2 as two +1s", async () => {
    const { withRequired } = await import("../apply");
    expect(withRequired({ id: "a", label: "", kind: "ability", count: 3, maxPerOption: 2, options: [] }, ["dex", "dex", "wis"])).toEqual(["dex", "dex", "wis"]);
    expect(withRequired({ id: "b", label: "", kind: "feature", count: 2, required: ["x"], options: [] }, ["x", "y"])).toEqual(["x", "y"]);
  });
});
