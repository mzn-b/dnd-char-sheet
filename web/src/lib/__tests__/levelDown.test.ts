import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { levelDown, planLevelDown, takeSnapshot } from "../levelDown";
import type { Character, ClassRules } from "../types";

function warlock2(): Character {
  const c = newCharacter("Lock");
  c.classes = [{ source: "srd", key: "warlock", name: "Warlock", level: 2, hitDie: 8, spellcastingAbility: "cha", casterType: "pact" }];
  c.abilities.cha = 16;
  c.hp = { max: 17, current: 17, temp: 0 };
  c.features = [{ id: "pm", name: "Pact Magic", origin: "Warlock 1", kind: "class", description: "" }];
  c.spellcasting.spells = [{ id: "eb", ref: { source: "srd", key: "eldritch-blast", name: "Eldritch Blast" }, level: 0, prepared: true, alwaysPrepared: false, notes: "" }];
  c.spellcasting.pactSlots = { max: 2, used: 0, level: 1 };
  c.levelHistory = [{ classKey: "warlock", className: "Warlock", level: 2, hpGained: 7, summary: [], at: "2026-01-01" }];
  return c;
}

/** What the wizard does for Warlock 3: snapshot, then the level's changes and a history entry. */
function levelTo3(c: Character, withSnapshot: boolean) {
  const snapshot = takeSnapshot(c);
  c.classes[0].level = 3;
  c.classes[0].subclass = { source: "srd", key: "fiend", name: "The Fiend" };
  c.hp.max += 7;
  c.hp.current += 7;
  c.features.push(
    { id: "pb", name: "Pact Boon", origin: "Warlock 3", kind: "class", description: "" },
    { id: "inv", name: "Eldritch Invocations", origin: "Warlock 2", kind: "class", description: "", subfeatures: [
      { id: "s1", choiceId: "inv", key: "ab", name: "Agonizing Blast", description: "" },
      { id: "s2", choiceId: "inv", key: "ds", name: "Devil's Sight", description: "" },
    ] },
    { id: "ft", name: "Resilient", origin: "Feat", kind: "feat", description: "", effects: [{ kind: "ability", ability: "con", amount: 1 }] },
  );
  c.abilities.con += 1;
  c.spellcasting.spells.push({ id: "hb", ref: { source: "srd", key: "hold-person", name: "Hold Person" }, level: 2, prepared: true, alwaysPrepared: false, notes: "" });
  c.spellcasting.pactSlots = { max: 2, used: 0, level: 2 };
  c.levelHistory.push({
    classKey: "warlock", className: "Warlock", level: 3, hpGained: 7, at: "2026-02-01",
    summary: ["Chose Otherworldly Patron: The Fiend", "Took feat: Resilient", "New features: Pact Boon", "Eldritch Invocations: Devil's Sight", "Learned spells: Hold Person"],
    ...(withSnapshot ? { snapshot } : {}),
  });
}

describe("level down", () => {
  it("restores the build exactly from the snapshot, keeping play state", () => {
    const c = warlock2();
    levelTo3(c, true);
    // Play after leveling: take damage, loot, cast.
    c.hp.current = 5;
    c.equipment.push({ id: "gem", name: "Ruby", qty: 1, weight: 0, equipped: false, notes: "" });
    c.spellcasting.pactSlots.used = 2;
    c.spellcasting.spells[0].castCount = 4;
    expect(planLevelDown(c)).toMatchObject({ exact: true, canLevelDown: true });
    levelDown(c);
    expect(c.classes[0]).toMatchObject({ level: 2 });
    expect(c.classes[0].subclass).toBeUndefined();
    expect(c.features.map((f) => f.name)).toEqual(["Pact Magic"]);
    expect(c.abilities.con).toBe(10);
    expect(c.hp).toMatchObject({ max: 17, current: 5 });
    expect(c.spellcasting.spells.map((s) => s.ref.name)).toEqual(["Eldritch Blast"]);
    expect(c.spellcasting.spells[0].castCount).toBe(4);
    expect(c.spellcasting.pactSlots).toEqual({ max: 2, level: 1, used: 2 });
    expect(c.equipment.map((i) => i.name)).toEqual(["Ruby"]);
    expect(c.levelHistory).toHaveLength(1);
  });

  it("undoes an older level from its history", () => {
    const c = warlock2();
    levelTo3(c, false);
    const plan = planLevelDown(c)!;
    expect(plan.exact).toBe(false);
    expect(plan.warnings.join(" ")).toMatch(/Subclass removed/);
    const rules = { levels: [{ spellcasting: { cantripsKnown: 2, spellsKnown: 2, slots: [1] } }, { spellcasting: { cantripsKnown: 2, spellsKnown: 3, slots: [2] } }] } as unknown as ClassRules;
    levelDown(c, { rules });
    expect(c.classes[0].level).toBe(2);
    expect(c.classes[0].subclass).toBeUndefined();
    expect(c.features.find((f) => f.name === "Pact Boon")).toBeUndefined();
    expect(c.features.find((f) => f.name === "Resilient")).toBeUndefined();
    expect(c.abilities.con).toBe(10);
    expect(c.features.find((f) => f.name === "Eldritch Invocations")!.subfeatures!.map((s) => s.name)).toEqual(["Agonizing Blast"]);
    expect(c.spellcasting.spells.map((s) => s.ref.name)).toEqual(["Eldritch Blast"]);
    expect(c.hp.max).toBe(17);
    expect(c.spellcasting.pactSlots).toMatchObject({ max: 2, level: 1 });
  });

  it("won't go below level 1 and can lower XP", () => {
    const c = warlock2();
    levelTo3(c, true);
    c.xp = 1000;
    levelDown(c, { lowerXp: true });
    expect(c.xp).toBe(300);
    c.classes[0].level = 1;
    expect(planLevelDown(c)?.canLevelDown).toBe(false);
  });
});
