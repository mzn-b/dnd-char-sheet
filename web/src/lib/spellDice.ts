import type { SpellDice } from "./types";

/** "8d6" + 2 × "1d6" → "10d6"; mixed dice are joined: "2d8 + 1d6". */
function addDice(base: string, extra: string, times: number): string {
  if (!times) return base;
  const b = base.match(/^(\d+)d(\d+)(.*)$/);
  const e = extra.match(/^(\d+)d(\d+)$/);
  if (b && e && b[2] === e[2]) return `${Number(b[1]) + Number(e[1]) * times}d${b[2]}${b[3]}`;
  if (e) return `${base} + ${Number(e[1]) * times}d${e[2]}`;
  return `${base} + ${times}×${extra}`;
}

/** Highest table entry at or below a level ({1: "1d10", 5: "2d10"} at 7 → "2d10"). */
const byLevel = (table: Record<string, string>, level: number) =>
  Object.entries(table).filter(([l]) => Number(l) <= level).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1];

/** Dice for casting at a given slot level (leveled spells) or character level (cantrips). */
export function diceAt(dice: SpellDice | undefined, spellLevel: number, castLevel: number, characterLevel: number): string | undefined {
  if (!dice?.base && !dice?.bySlot && !dice?.byCharacterLevel) return undefined;
  if (spellLevel === 0) return dice.byCharacterLevel ? byLevel(dice.byCharacterLevel, characterLevel) ?? dice.base : dice.base;
  if (dice.bySlot?.[String(castLevel)]) return dice.bySlot[String(castLevel)];
  if (!dice.base) return undefined;
  return dice.perSlot ? addDice(dice.base, dice.perSlot, Math.max(0, castLevel - spellLevel)) : dice.base;
}

/** "8d6 fire" / "1d8 + 3 healing". */
export function describeDice(dice: SpellDice | undefined, roll: string | undefined, modifier?: number): string | undefined {
  if (!roll || !dice) return undefined;
  const mod = dice.addModifier && modifier != null ? ` ${modifier >= 0 ? "+" : "−"} ${Math.abs(modifier)}` : dice.addModifier ? " + mod" : "";
  const what = dice.kind === "heal" ? "healing" : dice.types?.join("/") ?? "damage";
  return `${roll}${mod} ${what}`;
}

/** Short note on how the spell scales: "+1d6 per slot above 3rd" / "cantrip: 2d10 at 5th". */
export function scalingNote(dice: SpellDice | undefined, spellLevel: number): string | undefined {
  if (!dice) return undefined;
  if (spellLevel === 0 && dice.byCharacterLevel) return `scales at character levels ${Object.keys(dice.byCharacterLevel).filter((l) => l !== "1").join(", ")}`;
  if (dice.perSlot) return `+${dice.perSlot} per slot level above ${spellLevel}`;
  return undefined;
}
