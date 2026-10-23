import { describe, expect, it } from "vitest";
import { newCharacter } from "../defaults";
import { carriedWeight, inventoryTree, isContainer, moveItem } from "../containers";
import type { Item } from "../types";

const item = (id: string, name: string, weight = 1, extra: Partial<Item> = {}): Item => ({ id, name, qty: 1, weight, equipped: false, notes: "", ...extra });
const sheet = () => {
  const c = newCharacter("Bags");
  c.equipment = [item("bp", "Backpack", 5), item("rope", "Hempen Rope (50 feet)", 10), item("pouch", "Pouch", 1), item("gem", "Ruby", 0), item("sword", "Longsword", 3, { equipped: true })];
  return c;
};
const order = (c: ReturnType<typeof sheet>) => inventoryTree(c.equipment).map((r) => `${"-".repeat(r.depth)}${r.item.id}`);

describe("containers", () => {
  it("knows containers by name, but not packs sold full or a bag of tricks", () => {
    expect(isContainer(item("a", "Backpack"))).toBe(true);
    expect(isContainer(item("b", "Component pouch"))).toBe(true);
    expect(isContainer(item("c", "Bag of Tricks"))).toBe(false);
    expect(isContainer(item("d", "Explorer's Pack", 59, { data: { contents: [{ name: "Backpack", qty: 1 }] } }))).toBe(false);
    expect(isContainer(item("e", "Torch", 1, { container: true }))).toBe(true);
  });
  it("puts items in, nests containers, and takes them out again", () => {
    const c = sheet();
    moveItem(c, "rope", "bp", "into");
    moveItem(c, "gem", "pouch", "into");
    moveItem(c, "pouch", "bp", "into");
    expect(order(c)).toEqual(["bp", "-rope", "-pouch", "--gem", "sword"]);
    moveItem(c, "pouch", "sword", "after");
    expect(order(c)).toEqual(["bp", "-rope", "sword", "pouch", "-gem"]);
    moveItem(c, "sword", "bp", "before");
    expect(order(c)[0]).toBe("sword");
  });
  it("unequips what goes into a container and won't put a container inside itself", () => {
    const c = sheet();
    moveItem(c, "sword", "bp", "into");
    expect(c.equipment.find((i) => i.id === "sword")!.equipped).toBe(false);
    moveItem(c, "pouch", "bp", "into");
    moveItem(c, "bp", "pouch", "into");
    expect(c.equipment.find((i) => i.id === "bp")!.containerId).toBeUndefined();
  });
  it("doesn't count what's in a Bag of Holding", () => {
    const c = sheet();
    c.equipment.push(item("boh", "Bag of Holding", 15));
    expect(carriedWeight(c.equipment)).toBe(34);
    moveItem(c, "rope", "boh", "into");
    expect(carriedWeight(c.equipment)).toBe(24);
  });
});
