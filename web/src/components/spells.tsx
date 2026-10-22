import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import { uid } from "../lib/defaults";
import { LASTING_SPELLS, abilityMod, canCastInWildShape, fmt, ordinal, spellAttack, spellSaveDC, totalLevel } from "../lib/rules";
import { describeDice, diceAt, scalingNote } from "../lib/spellDice";
import { eldritchBlastBeams, spellDamageBonuses } from "../lib/spellBonuses";
import { describeRoll, extractRolls, resolveRoll } from "../lib/rollText";
import { withModifier } from "./rolls";
import { addEffect, effectForSpell } from "../lib/combat";
import { rollKey, useCorrections } from "../lib/corrections";
import { RollButton } from "./dice";
import { ActionBadge } from "./ActionBadge";
import { useDecision } from "./decisions";
import { spellDecision } from "../lib/featureUse";
import { kindFromCastingTime, spendEconomy } from "../lib/economy";
import { classResources } from "../lib/resources";
import { d20 } from "../lib/dice";
import type { Ability, Character, ContentDetail, SpellDice, SpellEntry } from "../lib/types";
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
      {kindFromCastingTime(detail.meta["Casting Time"]) === "other" ? (
        <span className="rounded bg-ink-800 px-1" title={detail.meta["Casting Time"]}>{castingTimeShort(detail.meta["Casting Time"])}</span>
      ) : (
        <ActionBadge kind={kindFromCastingTime(detail.meta["Casting Time"])} detail={detail.meta["Casting Time"]} />
      )}
      {detail.meta.Range && <span className="hidden sm:inline" title="Range">{detail.meta.Range}</span>}
      {detail.spell?.concentration && <span className="rounded bg-arcane-500/20 px-1 text-arcane-400" title="Concentration">C</span>}
      {detail.spell?.ritual && <span className="rounded bg-emerald-500/15 px-1 text-emerald-400" title="Ritual">rit</span>}
    </span>
  );
}

/** Classes with the Ritual Casting feature (rangers, paladins and sorcerers have none in 2014). */
const RITUAL_CLASSES = /^(bard|cleric|druid|wizard|artificer)$/i;

/** Whether this spell can be cast as a ritual: a Ritual Casting class, Book of Ancient Secrets or the Ritual Caster feat. */
export function canRitualCast(c: Character, spell: SpellEntry) {
  const cls = c.classes.find((k) => k.key === spell.classKey);
  if (cls && RITUAL_CLASSES.test(cls.name)) return true;
  const names = c.features.flatMap((f) => [f.name, ...(f.subfeatures ?? []).map((x) => x.name)]);
  // Book of Ancient Secrets: warlock spells with the ritual tag, and the rituals in the Book of Shadows
  // (added without a class, since they come from other classes' lists).
  if ((!cls || /^warlock$/i.test(cls.name)) && names.some((n) => /book of ancient secrets/i.test(n))) return true;
  return names.some((n) => /^ritual caster/i.test(n)) && !cls;
}

/**
 * Cast a spell: pick a slot (or pact slot) of the spell's level or higher, cast as a ritual,
 * or spend an innate use. Starts concentration when needed.
 */
export function CastButton({
  c, update, spell, detail, onCast, ritualOnly,
}: { c: Character; update: Update; spell: SpellEntry; detail?: ContentDetail; onCast?: (d: Character) => void; ritualOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const ask = useDecision();
  const conc = !!detail?.spell?.concentration;
  // Find Familiar, Find Steed…: ask which creature after casting.
  const followUp = () => {
    const decision = spellDecision(spell.ref.name);
    if (decision) setTimeout(() => ask(decision));
  };
  const concentrate = (d: Character, ritual = false) => {
    if (conc) d.concentration = { name: spell.ref.name, spellId: spell.id };
    const s = d.spellcasting.spells.find((x) => x.id === spell.id);
    if (s) s.castCount = (s.castCount ?? 0) + 1;
    // In combat, the casting time uses the action, bonus action or reaction.
    // A ritual takes 10 minutes longer: no action in combat.
    spendEconomy(d, ritual ? "other" : kindFromCastingTime(detail?.meta["Casting Time"]), `Cast ${spell.ref.name}`, { spellLevel: spell.level });
    // Spells that change the sheet for hours (Mage Armor) stay on until a long rest or you end them.
    if (LASTING_SPELLS.test(spell.ref.name)) {
      d.lastingEffects = [...(d.lastingEffects ?? []).filter((e) => e.name !== spell.ref.name), { id: uid(), name: spell.ref.name }];
    }
    // In combat, lasting spells become active effects with reminders and a countdown.
    if (d.combat?.active) {
      const effect = effectForSpell(d, spell, detail);
      if (effect) addEffect(d, effect);
    }
    onCast?.(d);
  };

  if (c.wildShape && !canCastInWildShape(c)) {
    return <button className="btn px-2 py-0 text-xs" disabled title="You can't cast spells in Wild Shape (until Beast Spells at 18th level)">Cast</button>;
  }
  const smallBtn = "btn px-2 py-0 text-xs";
  // At will (Mask of Many Faces, Ancestral Guardian's Augury…): no limit, no slot.
  if (spell.uses === "at will") {
    return <button className={smallBtn} title="At will" onClick={() => { update((d) => concentrate(d)); followUp(); }}>Cast (at will)</button>;
  }
  // Ritual only (Totem Warrior's Beast Sense; Book of Ancient Secrets; unprepared spellbook spells).
  if (spell.uses === "ritual" || ritualOnly) {
    return <button className={`${smallBtn} text-emerald-400`} title="Cast as a ritual: 10 minutes longer, no slot" onClick={() => { update((d) => concentrate(d, true)); followUp(); }}>Ritual</button>;
  }
  // Paid with class resource points (Shadow Arts: 2 ki).
  const cost = spell.uses?.match(/^(\d+) (ki|sorcery points?|superiority dice?|psionic energy dice?)$/i);
  if (cost) {
    const n = Number(cost[1]);
    const res = classResources(c).find((r) => r.name.toLowerCase().startsWith(cost[2].toLowerCase().slice(0, 3)));
    const left = res ? res.max - (c.resourcesUsed?.[res.id] ?? 0) : 0;
    return (
      <button
        className={smallBtn}
        disabled={!res || left < n}
        title={res ? `${left} ${res.name} left` : `No ${cost[2]} pool`}
        onClick={() => { update((d) => { if (res) d.resourcesUsed = { ...d.resourcesUsed, [res.id]: (d.resourcesUsed?.[res.id] ?? 0) + n }; concentrate(d); }); followUp(); }}
      >
        Cast ({n} {cost[2]})
      </button>
    );
  }
  const freeMax = spell.uses ? parseInt(spell.uses, 10) || 1 : 0;
  const freeLeft = Math.max(0, freeMax - (spell.usesSpent ?? 0));
  const anySlots = c.spellcasting.slots.some((s, i) => i + 1 >= spell.level && s.max > 0) || c.spellcasting.pactSlots.level >= spell.level && c.spellcasting.pactSlots.max > 0;
  // Innate-only spells (racial magic) get a simple button; spells that can also use slots get the menu.
  if (spell.uses && (spell.level === 0 || !anySlots)) {
    const max = freeMax || 1;
    const spent = spell.usesSpent ?? 0;
    return (
      <button
        className="btn px-2 py-0 text-xs"
        disabled={spent >= max}
        title={`Innate: ${spell.uses}`}
        onClick={() => { update((d) => { const s = d.spellcasting.spells.find((x) => x.id === spell.id)!; s.usesSpent = (s.usesSpent ?? 0) + 1; concentrate(d); }); followUp(); }}
      >
        Cast ({max - spent}/{max})
      </button>
    );
  }
  if (spell.level === 0) {
    return <button className="btn px-2 py-0 text-xs" onClick={() => { update(concentrate); followUp(); }}>Cast</button>;
  }

  const slots = c.spellcasting.slots.map((s, i) => ({ level: i + 1, left: s.max - s.used })).filter((s) => s.level >= spell.level && s.left > 0);
  const pact = c.spellcasting.pactSlots;
  const pactOk = pact.max - pact.used > 0 && pact.level >= spell.level;
  const castWith = (level: number | "pact" | "ritual" | "free") => {
    update((d) => {
      if (level === "free") {
        const s = d.spellcasting.spells.find((x) => x.id === spell.id)!;
        s.usesSpent = (s.usesSpent ?? 0) + 1;
      } else if (level === "pact") d.spellcasting.pactSlots.used += 1;
      else if (level !== "ritual") d.spellcasting.slots[level - 1].used += 1;
      concentrate(d, level === "ritual");
    });
    setOpen(false);
    followUp();
  };
  const ritual = !!detail?.spell?.ritual && canRitualCast(c, spell);
  const nothing = !slots.length && !pactOk && !ritual && !freeLeft;

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
          {freeLeft > 0 && (
            <button className="block w-full rounded px-2 py-1 text-left text-xs text-arcane-400 hover:bg-ink-800" onClick={() => castWith("free")}>
              Free cast ({freeLeft} left, {spell.uses})
            </button>
          )}
          {ritual && (
            <button className="block w-full rounded px-2 py-1 text-left text-xs text-emerald-400 hover:bg-ink-800" onClick={() => castWith("ritual")}>
              As a ritual (+10 min, no slot)
            </button>
          )}
        </div>
      )}
    </span>
  );
}

/** Character level and casting modifier for resolving a spell's rolls. */
export function spellRollContext(c: Character, spell: SpellEntry) {
  const ability = castingAbility(c, spell);
  return { characterLevel: totalLevel(c), mod: ability ? abilityMod(c, ability) : undefined };
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
  const corrections = useCorrections();
  const all = detail ? extractRolls(detail.description, { spellLevel: spell.level }).filter((r) => !corrections.isRollHidden(rollKey(spell.ref.name, r))) : [];
  // If the main roll found in the text was marked incorrect, don't show the structured copy of it either.
  const primaryHidden = !!detail && extractRolls(detail.description, { spellLevel: spell.level }).some(
    (r) => (r.kind === "damage" || r.kind === "healing") && corrections.isRollHidden(rollKey(spell.ref.name, r)) && !!detail.spell?.dice?.base && r.dice.startsWith(detail.spell.dice.base),
  );
  // Spells without structured dice (Open5e, homebrew) use the first roll found in their text.
  const first = all.find((r) => r.kind === "damage" || r.kind === "healing");
  const structured = detail?.spell?.dice;
  const fromText: SpellDice | undefined = first
    ? { kind: first.kind === "healing" ? "heal" : "damage", base: first.dice.replace(/ [+−] mod$/, ""), types: first.type ? [first.type] : undefined, addModifier: / [+−] mod$/.test(first.dice) }
    : undefined;
  // A hidden main roll keeps the save DC / attack bonus but drops its dice.
  const dice: SpellDice | undefined = primaryHidden
    ? fromText ? { ...fromText, save: structured?.save, attack: structured?.attack } : structured && { kind: structured.kind, save: structured.save, attack: structured.attack }
    : structured ?? fromText;
  if (!dice) return null;
  // Structured data often omits "+ your spellcasting modifier"; the text says it.
  const withMod = !!first && / [+−] mod$/.test(first.dice) && !!dice.base && first.dice.startsWith(dice.base) ? { ...dice, addModifier: true } : dice;
  const ability = castingAbility(c, spell);
  const roll = diceAt(withMod, spell.level, spell.level, totalLevel(c));
  // Spellcasting modifier when the spell adds it, plus feature bonuses (Agonizing Blast…).
  const bonuses = withMod.kind === "damage" ? spellDamageBonuses(c, spell, detail) : [];
  const castMod = withMod.addModifier && ability ? abilityMod(c, ability) : 0;
  const flat = castMod + bonuses.reduce((n, b) => n + b.amount, 0);
  const shown = bonuses.length ? { ...withMod, addModifier: true } : withMod;
  const beams = /^eldritch blast$/i.test(spell.ref.name) ? eldritchBlastBeams(totalLevel(c)) : 1;
  const text = describeDice(shown, roll, shown.addModifier && (ability || bonuses.length) ? flat : undefined);
  const scaling = [
    beams > 1 && `${beams} beams: one attack and damage roll each`,
    ...bonuses.map((b) => `${b.source} ${fmt(b.amount)}`),
    scalingNote(dice, spell.level),
  ].filter(Boolean).join(" · ");
  // Everything else the text says you might roll (conditional, per-turn, alternate damage…).
  const at = { spellLevel: spell.level, slotLevel: spell.level, characterLevel: totalLevel(c) };
  const extra = all.filter((r) => {
    const resolved = resolveRoll(r, at);
    return resolved && (r.condition || r.instead || r.timing === "again on later turns" || resolved.replace(/ [+−] mod$/, "") !== roll);
  });
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1 text-[11px]">
      {text && (
        <RollButton
          expression={`${roll!.replace(/\s+/g, "")}${flat ? (flat > 0 ? `+${flat}` : `${flat}`) : ""}`}
          label={`${spell.ref.name}${dice.kind === "heal" ? " healing" : " damage"}`}
          kind={dice.kind === "heal" ? "heal" : "damage"}
          title={scaling ? `${text} · ${scaling}` : text}
          className={`rounded border px-1.5 py-0 ${dice.kind === "heal" ? "border-emerald-700 text-emerald-400" : "border-blood-500/50 text-blood-500"}`}
        >
          {beams > 1 ? `${beams}× ${text}` : text}
        </RollButton>
      )}
      {dice.save && ability && <span className="rounded border border-sky-800 px-1.5 text-sky-300" title={`${dice.save} saving throw against your spell save DC`}>DC {spellSaveDC(c, ability)} {dice.save.slice(0, 3).toUpperCase()}</span>}
      {extra.length > 0 && (
        <span
          className="rounded border border-accent-600/40 px-1.5 text-accent-400"
          title={extra.map((r) => describeRoll(r, withModifier(resolveRoll(r, { spellLevel: spell.level, slotLevel: spell.level, characterLevel: totalLevel(c) })!, ability ? abilityMod(c, ability) : undefined))).join("\n")}
        >
          +{extra.length} more
        </span>
      )}
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
