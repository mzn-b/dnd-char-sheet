import { describe, expect, it } from "vitest";
import { POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY } from "../rules";

const cost = (scores: number[]) => scores.reduce((s, n) => s + POINT_BUY_COST[n], 0);

describe("point buy (PHB)", () => {
  it("uses the PHB cost table", () => expect(POINT_BUY_COST).toEqual({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 }));
  it("has a 27-point budget", () => expect(POINT_BUY_BUDGET).toBe(27));
  it("three 15s and three 8s cost exactly 27", () => expect(cost([15, 15, 15, 8, 8, 8])).toBe(27));
  it("the standard array is affordable with point buy", () => expect(cost(STANDARD_ARRAY)).toBe(27));
});
