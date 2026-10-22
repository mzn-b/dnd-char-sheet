import { describe, expect, it } from "vitest";
import foe from "./favored-foe.json";
import { durationFromText, featureDuration } from "../featureDuration";
import { applyFeatureUse, endFeatureEffect } from "../featureUse";
import { newCharacter } from "../defaults";
import { reminders, startCombat, startTurn } from "../combat";
import type { Feature } from "../types";

describe("feature durations", () => {
  it("reads minutes, rounds, next turn and concentration", () => {
    expect(featureDuration(foe)).toEqual({ rounds: 10, concentration: true, label: "1 min" });
    expect(durationFromText("For the next 10 minutes, you have advantage on Athletics checks.")).toMatchObject({ rounds: 100, label: "10 min" });
    expect(durationFromText("You can't use this feature again until the start of your next turn.")).toBeUndefined();
    expect(durationFromText("If the spell requires concentration, the creature must concentrate.")).toBeUndefined();
    expect(durationFromText("frightened of you until the end of your next turn. You can't use it on that creature again for 24 hours.")).toMatchObject({ label: "until the end of your next turn" });
    expect(durationFromText("Your speed increases by 10 feet for 1 round.")).toMatchObject({ rounds: 1, label: "1 round" });
    expect(durationFromText("You gain resistance until the start of your next turn.")).toMatchObject({ untilNextTurn: true });
    expect(durationFromText("This lasts for 1 hour.")).toMatchObject({ rounds: null, label: "1 hr" });
    expect(durationFromText("You have advantage on Survival checks.")).toBeUndefined();
  });

  it("activates Favored Foe like a concentration spell", () => {
    const c = newCharacter();
    const f: Feature = { id: "ff", name: foe.name, origin: "Ranger 1", kind: "class", description: foe.description, uses: { max: 2, used: 0, reset: "long", formula: "prof" } };
    c.features.push(f);
    startCombat(c);
    startTurn(c);
    applyFeatureUse(c, f);
    expect(f.uses!.used).toBe(1);
    expect(c.concentration?.name).toBe("Favored Foe");
    const e = c.combat!.effects.find((x) => x.name === "Favored Foe")!;
    expect(e).toMatchObject({ rounds: 10, concentration: true });
    expect(e.reminders[0]).toMatchObject({ when: "hit" });
    expect(e.reminders[0].text).toMatch(/1d4/);
    // The effect's reminder replaces the always-on one while it lasts.
    expect(reminders(c).filter((r) => r.when === "hit" && /Favored Foe/.test(r.text))).toHaveLength(1);
    expect(reminders(c).some((r) => r.when === "damaged" && /Concentration on Favored Foe/.test(r.text))).toBe(true);
    // Free to use: no action spent.
    expect(c.combat!.economy).toMatchObject({ action: false, bonus: false });
    endFeatureEffect(c, f);
    expect(c.combat!.effects).toHaveLength(0);
    expect(c.concentration).toBeNull();
  });
});
