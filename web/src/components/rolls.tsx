import { useState } from "react";
import { describeRoll, extractRolls, resolveRoll, scalingText, type RollInfo } from "../lib/rollText";
import { ordinal } from "../lib/rules";
import { RollButton } from "./dice";

const KIND_STYLE: Record<RollInfo["kind"], string> = {
  damage: "border-blood-500/50 text-blood-500",
  healing: "border-emerald-700 text-emerald-400",
  "temp hp": "border-arcane-500/50 text-arcane-400",
  bonus: "border-accent-600/50 text-accent-400",
  die: "border-ink-600 text-ink-200",
  roll: "border-ink-600 text-ink-200",
};

/** "1d8 + mod" with a known modifier → "1d8 + 3". */
export function withModifier(dice: string, mod?: number) {
  if (mod == null) return dice;
  return dice.replace(/([+−])\s*mod\b/, (_m, sign) => {
    const n = sign === "−" ? -mod : mod;
    return `${n >= 0 ? "+" : "−"} ${Math.abs(n)}`;
  }).replace(/^mod$/, String(mod));
}

/** A rollable expression for the in-app roller ("2d8 + 1d6 + 3" → "2d8+1d6+3"); undefined if not rollable. */
const rollable = (dice: string) => (/^[\dd+\s−-]+$/.test(dice) && /\d*d\d+/.test(dice) ? dice.replace(/−/g, "-").replace(/\s+/g, "") : undefined);

/**
 * Every roll in a text: dice resolved for the chosen slot / character level, with conditions,
 * timing and scaling notes.
 */
export function RollList({
  rolls, at, mod, compact,
}: {
  rolls: RollInfo[];
  at: { spellLevel?: number; slotLevel?: number; characterLevel?: number };
  mod?: number;
  compact?: boolean;
}) {
  const visible = rolls
    .map((r) => ({ r, dice: resolveRoll(r, at) }))
    .filter((x): x is { r: RollInfo; dice: string } => !!x.dice);
  const locked = rolls.filter((r) => !resolveRoll(r, at));
  if (!visible.length && !locked.length) return null;
  return (
    <ul className={compact ? "space-y-0.5" : "space-y-1.5"}>
      {visible.map(({ r, dice }, i) => {
        const shown = withModifier(dice, mod);
        const expr = rollable(shown);
        const conditional = !!(r.condition || r.instead);
        const chip = (
          <span className={`rounded border px-1.5 py-0 font-semibold ${KIND_STYLE[r.kind]}`}>{shown}</span>
        );
        return (
          <li key={i} className={`flex flex-wrap items-baseline gap-x-2 text-sm ${conditional ? "pl-4" : ""}`} title={r.context}>
            {conditional && <span className="-ml-4 w-3 text-accent-400">↳</span>}
            {expr ? (
              <RollButton expression={expr} label={describeRoll(r, shown)} kind={r.kind === "healing" ? "heal" : r.kind === "damage" ? "damage" : "other"} className="px-0">
                {chip}
              </RollButton>
            ) : chip}
            <span className="text-ink-200">{describeRoll(r, "").replace(/^\s*·?\s*/, "")}</span>
            {!compact && scalingText(r) && <span className="text-xs text-ink-600">({scalingText(r)})</span>}
          </li>
        );
      })}
      {locked.map((r, i) => (
        <li key={`l${i}`} className="text-xs text-ink-600">{describeRoll(r)} (unlocks at character level {r.minCharacterLevel})</li>
      ))}
    </ul>
  );
}

/**
 * "What to roll" for a spell, with a slot-level picker for leveled spells.
 */
export function SpellRollBreakdown({
  description, spellLevel, characterLevel, mod, initialSlot,
}: { description: string; spellLevel: number; characterLevel: number; mod?: number; initialSlot?: number }) {
  const rolls = extractRolls(description, { spellLevel });
  const [slot, setSlot] = useState(initialSlot ?? spellLevel);
  if (!rolls.length) return null;
  const scales = rolls.some((r) => r.scaling?.perSlot);
  return (
    <div className="space-y-2 rounded-lg border border-ink-800 bg-ink-850/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label">What to roll</span>
        {spellLevel > 0 && scales && (
          <span className="flex flex-wrap gap-1">
            {Array.from({ length: 10 - spellLevel }, (_, i) => spellLevel + i).map((l) => (
              <button key={l} onClick={() => setSlot(l)} className={`chip ${slot === l ? "border-accent-600 text-accent-400" : ""}`}>{ordinal(l)}</button>
            ))}
          </span>
        )}
        {spellLevel === 0 && <span className="text-xs text-ink-600">at character level {characterLevel}</span>}
      </div>
      <RollList rolls={rolls} at={{ spellLevel, slotLevel: slot, characterLevel }} mod={mod} />
    </div>
  );
}
