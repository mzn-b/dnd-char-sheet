import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import { abilityMod, fmt, ordinal, spellAttack, spellSaveDC, totalLevel } from "../lib/rules";
import { describeDice, diceAt, scalingNote } from "../lib/spellDice";
import { RollButton } from "./dice";
import { d20 } from "../lib/dice";
import type { Ability, Character, ContentDetail, SpellEntry } from "../lib/types";
import type { Update } from "../lib/useCharacter";

/** Details for every spell on the sheet (cached), keyed by spell entry id. */
export function useSpellDetails(spells: SpellEntry[]): Record<string, ContentDetail | undefined> {
  const results = useQueries({
    queries: spells.map((s) => ({
      queryKey: ["detail", "spell", s.ref.source, s.ref.key],
      queryFn: () => api.detail("spell", s.ref.source, s.ref.key),
      staleTime: Infinity,
    })),
  });
  return Object.fromEntries(spells.map((s, i) => [s.id, results[i]?.data]));
}

/** "1 action" → "A", "1 bonus action" → "BA", "1 reaction, …" → "R", otherwise the text. */
export function castingTimeShort(t?: string): string {
  if (!t) return "";
  const s = t.toLowerCase();
  if (/^1 action/.test(s)) return "A";
  if (/bonus/.test(s)) return "BA";
  if (/reaction/.test(s)) return "R";
  return t.replace(/ minutes?/, " min").replace(/ hours?/, " hr");
}

export function actionType(t?: string): "action" | "bonus" | "reaction" | "other" {
  const s = castingTimeShort(t);
  return s === "A" ? "action" : s === "BA" ? "bonus" : s === "R" ? "reaction" : "other";
}

export function SpellBadges({ detail }: { detail?: ContentDetail }) {
  if (!detail) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] text-ink-400">
      <span className="rounded bg-ink-800 px-1" title={detail.meta["Casting Time"]}>{castingTimeShort(detail.meta["Casting Time"])}</span>
      {detail.meta.Range && <span className="hidden sm:inline" title="Range">{detail.meta.Range}</span>}
      {detail.spell?.concentration && <span className="rounded bg-arcane-500/20 px-1 text-arcane-400" title="Concentration">C</span>}
      {detail.spell?.ritual && <span className="rounded bg-emerald-500/15 px-1 text-emerald-400" title="Ritual">R</span>}
    </span>
  );
}

/**
 * Cast a spell: pick a slot (or pact slot) of the spell's level or higher, cast as a ritual,
 * or spend an innate use. Starts concentration when needed.
 */
export function CastButton({ c, update, spell, detail }: { c: Character; update: Update; spell: SpellEntry; detail?: ContentDetail }) {
  const [open, setOpen] = useState(false);
  const conc = !!detail?.spell?.concentration;
  const concentrate = (d: Character) => {
    if (conc) d.concentration = { name: spell.ref.name, spellId: spell.id };
  };

  if (spell.uses) {
    const max = parseInt(spell.uses, 10) || 1;
    const spent = spell.usesSpent ?? 0;
    return (
      <button
        className="btn px-2 py-0 text-xs"
        disabled={spent >= max}
        title={`Innate: ${spell.uses}`}
        onClick={() => update((d) => { const s = d.spellcasting.spells.find((x) => x.id === spell.id)!; s.usesSpent = (s.usesSpent ?? 0) + 1; concentrate(d); })}
      >
        Cast ({max - spent}/{max})
      </button>
    );
  }
  if (spell.level === 0) {
    return conc ? (
      <button className="btn px-2 py-0 text-xs" onClick={() => update(concentrate)}>Cast</button>
    ) : null;
  }

  const slots = c.spellcasting.slots.map((s, i) => ({ level: i + 1, left: s.max - s.used })).filter((s) => s.level >= spell.level && s.left > 0);
  const pact = c.spellcasting.pactSlots;
  const pactOk = pact.max - pact.used > 0 && pact.level >= spell.level;
  const castWith = (level: number | "pact" | "ritual") => {
    update((d) => {
      if (level === "pact") d.spellcasting.pactSlots.used += 1;
      else if (level !== "ritual") d.spellcasting.slots[level - 1].used += 1;
      concentrate(d);
    });
    setOpen(false);
  };
  const nothing = !slots.length && !pactOk && !detail?.spell?.ritual;

  return (
    <span className="relative">
      <button className="btn px-2 py-0 text-xs" disabled={nothing} title={nothing ? "No slots left" : "Cast"} onClick={() => setOpen(!open)}>Cast</button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-ink-700 bg-ink-900 p-1 shadow-xl" onMouseLeave={() => setOpen(false)}>
          {slots.map((s) => {
            const roll = diceAt(detail?.spell?.dice, spell.level, s.level, 1);
            return (
              <button key={s.level} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-ink-800" onClick={() => castWith(s.level)}>
                {ordinal(s.level)}-level slot <span className="text-ink-400">({s.left} left)</span>
                {roll && <span className={`ml-1 ${s.level > spell.level ? "text-accent-400" : "text-ink-400"}`}>· {roll}</span>}
              </button>
            );
          })}
          {pactOk && (
            <button className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-ink-800" onClick={() => castWith("pact")}>
              Pact slot ({ordinal(pact.level)}) <span className="text-ink-400">({pact.max - pact.used} left)</span>
              {diceAt(detail?.spell?.dice, spell.level, pact.level, 1) && <span className="ml-1 text-accent-400">· {diceAt(detail?.spell?.dice, spell.level, pact.level, 1)}</span>}
            </button>
          )}
          {detail?.spell?.ritual && (
            <button className="block w-full rounded px-2 py-1 text-left text-xs text-emerald-400 hover:bg-ink-800" onClick={() => castWith("ritual")}>
              As a ritual (+10 min, no slot)
            </button>
          )}
        </div>
      )}
    </span>
  );
}

/** Spellcasting ability a spell is cast with: its class's, else the character's best caster ability. */
function castingAbility(c: Character, spell: SpellEntry): Ability | undefined {
  const cls = c.classes.find((k) => k.key === spell.classKey);
  if (cls?.spellcastingAbility) return cls.spellcastingAbility;
  const casters = c.classes.map((k) => k.spellcastingAbility).filter(Boolean) as Ability[];
  return casters.sort((a, b) => abilityMod(c, b) - abilityMod(c, a))[0];
}

/**
 * "What do I roll?" for a spell: dice at its base level (cantrips at your character level),
 * how it scales, and the save DC or attack bonus. The dice are clickable but meant for reading.
 */
export function SpellRollInfo({ c, spell, detail }: { c: Character; spell: SpellEntry; detail?: ContentDetail }) {
  const dice = detail?.spell?.dice;
  if (!dice) return null;
  const ability = castingAbility(c, spell);
  const roll = diceAt(dice, spell.level, spell.level, totalLevel(c));
  const text = describeDice(dice, roll, ability ? abilityMod(c, ability) : undefined);
  const scaling = scalingNote(dice, spell.level);
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1 text-[11px]">
      {text && (
        <RollButton
          expression={roll!.replace(/\s+/g, "")}
          label={`${spell.ref.name}${dice.kind === "heal" ? " healing" : " damage"}`}
          kind={dice.kind === "heal" ? "heal" : "damage"}
          title={scaling ? `${text} · ${scaling}` : text}
          className={`rounded border px-1.5 py-0 ${dice.kind === "heal" ? "border-emerald-700 text-emerald-400" : "border-blood-500/50 text-blood-500"}`}
        >
          {text}
        </RollButton>
      )}
      {dice.save && ability && <span className="rounded border border-sky-800 px-1.5 text-sky-300" title={`${dice.save} saving throw against your spell save DC`}>DC {spellSaveDC(c, ability)} {dice.save.slice(0, 3).toUpperCase()}</span>}
      {dice.attack && ability && (
        <RollButton expression={d20(spellAttack(c, ability))} label={`${spell.ref.name}: spell attack`} kind="attack" className="rounded border border-accent-600/50 px-1.5 py-0 text-accent-400">
          {fmt(spellAttack(c, ability))} to hit
        </RollButton>
      )}
    </span>
  );
}

/** Table of dice by slot level (or character level for cantrips), for the spell detail view. */
export function SpellDiceTable({ detail }: { detail: ContentDetail }) {
  const dice = detail.spell?.dice;
  const level = detail.level ?? 0;
  if (!dice || (!dice.base && !dice.bySlot && !dice.byCharacterLevel)) return null;
  const rows: [string, string | undefined][] =
    level === 0
      ? Object.keys(dice.byCharacterLevel ?? { 1: dice.base! }).map((l) => [`Character level ${l}+`, diceAt(dice, 0, 0, Number(l))])
      : Array.from({ length: 10 - level }, (_, i) => [`${ordinal(level + i)}-level slot`, diceAt(dice, level, level + i, 1)]);
  const distinct = new Set(rows.map((r) => r[1]));
  return (
    <div className="rounded-lg border border-ink-800 p-2 text-sm">
      <div className="label mb-1">What to roll{dice.save ? ` · ${dice.save} save` : ""}{dice.attack ? ` · ${dice.attack} spell attack` : ""}</div>
      {distinct.size <= 1 ? (
        <span>{describeDice(dice, rows[0]?.[1])}</span>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {rows.map(([l, r]) => <span key={l}><span className="text-ink-400">{l}:</span> {r}</span>)}
        </div>
      )}
    </div>
  );
}
