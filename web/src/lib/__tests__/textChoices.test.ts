import { describe, expect, it } from "vitest";
import { textChoices, withTextChoices } from "../textChoices";
import { abilityNotes } from "../abilityNotes";
import { newCharacter } from "../defaults";

const CANNY = "You gain the Canny benefit below.\n\n**Canny.** Choose one of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses the chosen skill.";
const GLAMOUR = "Whenever you make a Charisma check, you gain a bonus to the check equal to your Wisdom modifier (minimum of +1). You also gain proficiency in one of the following skills of your choice: Deception, Performance, or Persuasion.";

describe("choices from text", () => {
  it("finds Canny's expertise and Glamour's listed skills", () => {
    expect(textChoices(CANNY)).toMatchObject([{ kind: "expertise", count: 1 }]);
    const g = textChoices(GLAMOUR);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ kind: "skill", count: 1 });
    expect(g[0].options.map((o) => o.key)).toEqual(["deception", "performance", "persuasion"]);
    expect(textChoices("You have advantage on Wisdom (Survival) checks.")).toEqual([]);
  });

  it("doesn't duplicate a kind the data already offers", () => {
    const existing = [{ id: "x", label: "Expertise", kind: "expertise" as const, count: 2, options: [] }];
    expect(withTextChoices(existing, CANNY)).toEqual(existing);
  });
});

describe("ability notes", () => {
  it("notes Glamour on CHA, Martial Arts on STR and the spellcasting ability", () => {
    const c = newCharacter();
    c.classes = [{ source: "5etools", key: "Ranger|PHB", name: "Ranger", level: 3, hitDie: 10, spellcastingAbility: "wis" }];
    c.abilities.wis = 16;
    c.features.push(
      { id: "g", name: "Otherworldly Glamour", origin: "", kind: "subclass", description: GLAMOUR },
      { id: "m", name: "Martial Arts", origin: "", kind: "class", description: "You can use Dexterity instead of Strength for the attack and damage rolls of your unarmed strikes and monk weapons." },
    );
    const n = abilityNotes(c);
    expect(n.cha.map((x) => x.short)).toEqual(["+WIS checks"]);
    expect(n.str[0]).toMatchObject({ short: "DEX instead", source: "Martial Arts" });
    expect(n.wis[0]).toMatchObject({ short: "spellcasting" });
    expect(n.dex).toEqual([]);
  });
});
