import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ordinal } from "../lib/rules";
import type { Character, ContentDetail, SpellEntry } from "../lib/types";
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
        <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-ink-700 bg-ink-900 p-1 shadow-xl" onMouseLeave={() => setOpen(false)}>
          {slots.map((s) => (
            <button key={s.level} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-ink-800" onClick={() => castWith(s.level)}>
              {ordinal(s.level)}-level slot <span className="text-ink-400">({s.left} left){s.level > spell.level ? " · upcast" : ""}</span>
            </button>
          ))}
          {pactOk && (
            <button className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-ink-800" onClick={() => castWith("pact")}>
              Pact slot ({ordinal(pact.level)}) <span className="text-ink-400">({pact.max - pact.used} left)</span>
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
