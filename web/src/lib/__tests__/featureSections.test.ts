import { describe, expect, it } from "vitest";
import fey from "./fey-wanderer.json";
import { featureSections } from "../featureSections";
import { newCharacter } from "../defaults";
import { abilityCheckBonus, skillBonus } from "../rules";
import { reminders } from "../combat";
import { abilityNotes } from "../abilityNotes";
import { textChoices } from "../textChoices";

/** A Fey Wanderer ranger as the level-up wizard builds it: one "Fey Wanderer" feature holding the 3rd-level features. */
function ranger() {
  const c = newCharacter("Fey");
  c.classes = [{ source: "5etools", key: "Ranger|PHB", name: "Ranger", level: 3, hitDie: 10, spellcastingAbility: "wis", subclass: { source: "5etools", key: "fw", name: "Fey Wanderer" } }];
  c.abilities = { str: 8, dex: 16, con: 14, int: 8, wis: 16, cha: 8 };
  c.skills.persuasion = 1;
  c.features.push({ id: "fw", name: fey.name, origin: "Ranger 3", kind: "subclass", description: fey.description });
  return c;
}

describe("feature sections", () => {
  it("splits Fey Wanderer into its 3rd-level features", () => {
    expect(featureSections(fey).map((s) => s.name)).toEqual(["Fey Wanderer", "Dreadful Strikes", "Fey Wanderer Magic", "Otherworldly Glamour"]);
  });

  it("applies Otherworldly Glamour and reminds of Dreadful Strikes by name", () => {
    const c = ranger();
    expect(abilityCheckBonus(c, "cha")).toBe(-1 + 3);
    expect(skillBonus(c, "persuasion")).toBe(-1 + 2 + 3);
    expect(skillBonus(c, "intimidation")).toBe(-1 + 3);
    expect(reminders(c).find((r) => r.when === "hit")?.source).toBe("Dreadful Strikes");
    expect(abilityNotes(c).cha[0]).toMatchObject({ short: "+WIS checks", source: "Otherworldly Glamour" });
    expect(textChoices(fey.description).map((ch) => ch.kind)).toContain("skill");
  });

  it("doesn't treat option lists as features", () => {
    const style = { name: "Fighting Style", description: "Choose one of the following options.\n\n**Archery.** You gain a +2 bonus to attack rolls you make with ranged weapons.\n\n**Defense.** While you are wearing armor, you gain a +1 bonus to AC." };
    expect(featureSections(style).map((s) => s.name)).toEqual(["Fighting Style"]);
    const c = newCharacter();
    c.features.push({ id: "fs", name: style.name, origin: "", kind: "class", description: style.description });
    expect(reminders(c).some((r) => /Archery/.test(r.text))).toBe(false);
  });
});
