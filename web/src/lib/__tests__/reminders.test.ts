import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { addEffect, reminders, startCombat } from "../combat";
import { abilityCheckBonus, skillBonus } from "../rules";
import type { Character, ContentDetail, SpellEntry } from "../types";

function feyRanger(): Character {
  const c = newCharacter("Fey");
  c.classes = [{ source: "5etools", key: "Ranger|PHB", name: "Ranger", level: 3, hitDie: 10, spellcastingAbility: "wis", spellModel: "known", subclass: { source: "5etools", key: "fw", name: "Fey Wanderer" } }];
  c.abilities = { str: 8, dex: 16, con: 14, int: 8, wis: 16, cha: 12 };
  c.features.push(
    { id: "d", name: "Dreadful Strikes", origin: "Ranger 3", kind: "subclass", description: "When you hit a creature with a weapon, you can deal an extra 1d4 psychic damage to the target." },
    { id: "g", name: "Otherworldly Glamour", origin: "Ranger 3", kind: "subclass", description: "Whenever you make a Charisma check, you gain a bonus to the check equal to your Wisdom modifier (minimum of +1)." },
    { id: "z", name: "Zephyr Step", origin: "Feat", kind: "feat", description: "At the start of your turn, you can move 5 feet without provoking opportunity attacks." },
  );
  return c;
}

const spell = (name: string, level: number): SpellEntry => ({ id: name, ref: { source: "5etools", key: name, name }, level, prepared: false, alwaysPrepared: false, notes: "", classKey: "Ranger|PHB" });
const detail = (name: string, castingTime: string, description: string): ContentDetail => ({ source: "5etools", key: name, name, type: "spell", description, meta: { "Casting Time": castingTime } });

describe("combat reminders", () => {
  it("reminds of Dreadful Strikes and other on-hit / turn-start features", () => {
    const c = feyRanger();
    const r = reminders(c);
    expect(r.find((x) => x.source === "Dreadful Strikes")).toMatchObject({ when: "hit" });
    expect(r.find((x) => x.source === "Dreadful Strikes")!.text).toMatch(/1d4 psychic/);
    expect(r.find((x) => x.source === "Zephyr Step")).toMatchObject({ when: "turnStart" });
    expect(r.some((x) => x.source === "Otherworldly Glamour")).toBe(false);
  });

  it("suggests on-hit damage spells you can cast, until one is active", () => {
    const c = feyRanger();
    c.spellcasting.spells = [spell("Hunter's Mark", 1), spell("Cure Wounds", 1)];
    const details = {
      "Hunter's Mark": detail("Hunter's Mark", "1 bonus action", "Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack. Whenever you hit (it) …"),
      "Cure Wounds": detail("Cure Wounds", "1 action", "A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier."),
    };
    details["Hunter's Mark"].description = "You choose a creature you can see within range and mystically mark it as your quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever you hit it with a weapon attack.";
    const r = reminders(c, details);
    const hm = r.find((x) => x.source === "Hunter's Mark");
    expect(hm?.when).toBe("attack");
    expect(hm?.text).toMatch(/bonus action/);
    expect(hm?.text).toMatch(/\+1d6/);
    expect(r.some((x) => x.source === "Cure Wounds")).toBe(false);
    // Once cast, the active effect takes over (no "available" hint).
    startCombat(c);
    addEffect(c, { id: "hm", name: "Hunter's Mark", source: "spell", startedRound: 1, rounds: null, reminders: [{ when: "hit", text: "Hunter's Mark: +1d6" }] });
    const after = reminders(c, details).filter((x) => x.source === "Hunter's Mark");
    expect(after.map((x) => x.when)).toEqual(["hit"]);
  });

  it("adds WIS to CHA checks with Otherworldly Glamour", () => {
    const c = feyRanger();
    expect(abilityCheckBonus(c, "cha")).toBe(1 + 3);
    expect(skillBonus(c, "persuasion")).toBe(1 + 3);
    expect(skillBonus(c, "insight")).toBe(3);
  });
});
