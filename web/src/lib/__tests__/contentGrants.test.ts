import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { applyEffects, applySubfeatureMechanics } from "../apply";
import { splitFeature } from "../featureSections";
import { FEAT_ID, VARIANT_ID, choiceShown, spellPickId, withGrantChoices } from "../grants";
import type { Choice, ContentDetail } from "../types";

const detail = (extra: Partial<ContentDetail>): ContentDetail => ({ source: "5etools", key: "x", type: "feat", name: "Magic Initiate", description: "", meta: {}, ...extra });

describe("grants from races, backgrounds and feats", () => {
  it("offers spell sets, their spells only once the set is picked, and feats", () => {
    const d = detail({
      spellVariants: [
        { name: "Bard Spells", grantedSpells: [], expandedSpells: [], spellPicks: [{ level: 1, count: 2, label: "Choose 2 Bard cantrip", mode: "known", options: [{ source: "5etools", key: "a", name: "Vicious Mockery" }] }] },
        { name: "Wizard Spells", grantedSpells: [], expandedSpells: [], spellPicks: [{ level: 1, count: 2, label: "Choose 2 Wizard cantrip", mode: "known", options: [{ source: "5etools", key: "b", name: "Fire Bolt" }] }] },
      ],
      featChoice: { count: 1 },
    });
    const choices = withGrantChoices(d, [{ source: "5etools", key: "tough", name: "Tough", type: "feat" }]);
    expect(choices.map((c) => c.id)).toEqual([VARIANT_ID, spellPickId("Bard Spells", 0), spellPickId("Wizard Spells", 0), FEAT_ID]);
    const wizardPick = choices[2];
    expect(choiceShown(wizardPick, {})).toBe(false);
    expect(choiceShown(wizardPick, { [VARIANT_ID]: ["Wizard Spells"] })).toBe(true);
  });

  it("applies tool and language picks to the proficiency lines, and mixed skill picks to skills", () => {
    const c = newCharacter();
    const tools: Choice = { id: "t", kind: "proficiency", prefix: "Tools", count: 1, label: "", options: [{ key: "dice set", name: "Dice set" }] };
    applySubfeatureMechanics(c, [tools], [{ id: "1", choiceId: "t", key: "dice set", name: "Tools: Dice set", description: "" }]);
    expect(c.proficienciesAndLanguages).toContain("Tools: Dice set");
    applySubfeatureMechanics(c, [tools], [{ id: "1", choiceId: "t", key: "dice set", name: "Tools: Dice set", description: "" }], -1);
    expect(c.proficienciesAndLanguages).not.toContain("Dice set");
    const mixed: Choice = { id: "m", kind: "proficiency", prefix: "mixed", count: 1, label: "", options: [{ key: "skill:stealth", name: "Stealth" }] };
    applySubfeatureMechanics(c, [mixed], [{ id: "2", choiceId: "m", key: "skill:stealth", name: "Proficiency: Stealth", description: "" }]);
    expect(c.skills.stealth).toBe(1);
  });

  it("Resilient gives the chosen ability's save; increases stop at 20", () => {
    const c = newCharacter();
    c.abilities.str = 20;
    const resilient: Choice = { id: "ability", kind: "ability", count: 1, amount: 1, grantsSave: true, label: "", options: [{ key: "wis", name: "WIS" }] };
    applySubfeatureMechanics(c, [resilient], [{ id: "1", choiceId: "ability", key: "wis", name: "WIS +1", description: "" }]);
    expect(c.saveProficiencies).toContain("wis");
    applyEffects(c, { name: "Heavy Armor Master", effects: [{ kind: "ability", ability: "str", amount: 1 }] });
    expect(c.abilities.str).toBe(20);
  });

  it("splits a background's feature out", () => {
    const parts = splitFeature({ id: "b", name: "Acolyte", origin: "Background", kind: "background", description: "**Skill Proficiencies.** Insight, Religion\n\n**Feature: Shelter of the Faithful.** As an acolyte, you command respect." });
    expect(parts.map((p) => p.name)).toEqual(["Acolyte", "Shelter of the Faithful"]);
    expect(parts[0].description).toContain("Insight");
  });
});
