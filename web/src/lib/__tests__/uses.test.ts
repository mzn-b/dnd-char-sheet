import { describe, expect, it } from "vitest";
import fixtures from "./fixtures.json";
import { detectUses } from "../uses";

const F = fixtures as Record<string, { text: string }>;

describe("detectUses", () => {
  it("Second Wind: once per short or long rest", () => expect(detectUses(F["Second Wind"].text)).toEqual({ formula: 1, reset: "short" }));
  it("Lucky: 3 points per long rest", () => expect(detectUses(F["Lucky"].text)).toEqual({ formula: 3, reset: "long" }));
  it("Fey Touched: once per long rest", () => expect(detectUses(F["Fey Touched"].text)).toEqual({ formula: 1, reset: "long" }));
  it("Magic Initiate: once per long rest", () => expect(detectUses(F["Magic Initiate"].text)).toEqual({ formula: 1, reset: "long" }));
  it("proficiency bonus uses", () =>
    expect(detectUses("You can use this feature a number of times equal to your proficiency bonus, and you regain all expended uses when you finish a long rest.")).toEqual({ formula: "prof", reset: "long" }));
  it("ability modifier uses", () =>
    expect(detectUses("You can use this feature a number of times equal to your Wisdom modifier (minimum of once). You regain all expended uses when you finish a long rest.")).toEqual({ formula: "wis", reset: "long" }));
  it("unlimited features return null", () => expect(detectUses(F["Great Weapon Master"].text)).toBeNull());
  it("Sneak Attack (once per turn) is not a per-rest limit", () => expect(detectUses(F["Sneak Attack"].text)).toBeNull());
});
