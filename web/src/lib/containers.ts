import type { Character, Item } from "./types";

/**
 * Items inside other items (a rope in the backpack, gems in a pouch). An item's `containerId` names the
 * container it's in; the equipment list's order is the display order, contents right after their container.
 */

const CONTAINER_NAME = /\b(backpacks?|sacks?|pouch(es)?|chests?|quivers?|cases?|barrels?|baskets?|buckets?|haversacks?|satchels?|purses?|crates?|bandoliers?|bag of holding|portable hole|bags?)\b/i;
const NOT_CONTAINER = /bag of (tricks|beans)|\(bag of/i;
/** Magic containers whose contents don't add to what you carry (DMG: Bag of Holding, Handy Haversack, Portable Hole). */
const WEIGHTLESS = /bag of holding|handy haversack|portable hole/i;

/** Whether an item holds other items: set by the player, or guessed from its name (packs sold full aren't). */
export const isContainer = (i: Item) => i.container ?? (!i.data?.contents?.length && CONTAINER_NAME.test(i.name) && !NOT_CONTAINER.test(i.name));
export const isWeightless = (i: Item) => WEIGHTLESS.test(i.name);

const parentOf = (items: Item[], i: Item) => (i.containerId ? items.find((x) => x.id === i.containerId && isContainer(x)) : undefined);

/** The containers an item is in, innermost first. */
export function ancestors(items: Item[], i: Item): Item[] {
  const out: Item[] = [];
  for (let p = parentOf(items, i); p && !out.includes(p); p = parentOf(items, p)) out.push(p);
  return out;
}

/** Items in display order with their depth; contents of collapsed containers are left out. */
export function inventoryTree(items: Item[], collapsed: Set<string> = new Set()): { item: Item; depth: number; contents: number }[] {
  const out: { item: Item; depth: number; contents: number }[] = [];
  const children = (id: string | undefined) => items.filter((i) => (id ? parentOf(items, i)?.id === id : !parentOf(items, i)));
  const walk = (id: string | undefined, depth: number) => {
    for (const item of children(id)) {
      const inside = isContainer(item) ? children(item.id).length : 0;
      out.push({ item, depth, contents: inside });
      if (inside && !collapsed.has(item.id) && depth < 8) walk(item.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

/** Everything inside a container, at any depth. */
const subtree = (items: Item[], id: string): Item[] => items.filter((i) => ancestors(items, i).some((a) => a.id === id));

/**
 * Move an item before or after another (into the same container), into a container, or to the end of the
 * list. Its contents come along. Putting something in a container takes it off (it isn't worn or wielded).
 */
export function moveItem(d: Character, dragId: string, targetId: string | null, where: "before" | "after" | "into") {
  const items = d.equipment;
  const dragged = items.find((i) => i.id === dragId);
  const target = targetId ? items.find((i) => i.id === targetId) : undefined;
  if (!dragged || dragged === target) return;
  const moving = [dragged, ...subtree(items, dragged.id)];
  // A container can't go inside itself.
  if (target && moving.includes(target)) return;
  const rest = items.filter((i) => !moving.includes(i));
  let at = rest.length;
  let containerId: string | undefined;
  if (target) {
    const block = [target, ...subtree(rest, target.id)];
    const first = rest.indexOf(target);
    const last = rest.indexOf(block[block.length - 1]);
    if (where === "before") at = first;
    else at = Math.max(first, last) + 1;
    containerId = where === "into" ? target.id : parentOf(rest, target)?.id;
  }
  dragged.containerId = containerId;
  if (containerId) dragged.equipped = false;
  d.equipment = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Carried weight: everything except what's inside a Bag of Holding or the like. */
export const carriedWeight = (items: Item[]) =>
  items.filter((i) => !ancestors(items, i).some(isWeightless)).reduce((s, i) => s + i.weight * i.qty, 0);

/** What a container's contents weigh (all levels). */
export const contentsWeight = (items: Item[], id: string) => subtree(items, id).reduce((s, i) => s + i.weight * i.qty, 0);
