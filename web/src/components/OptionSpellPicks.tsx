import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { OptionSpellSelections } from "../lib/apply";
import type { Choice, ChoiceOption, SpellPick } from "../lib/types";
import { ChoicePicker } from "./ChoicePicker";

/** One spell choice that comes with a picked option: Pact of the Tome's three cantrips, Book of Ancient Secrets' rituals. */
export interface OptionSpellPick {
  option: ChoiceOption;
  pick: SpellPick;
  index: number;
}

/** The spell choices of these picked options (fetched with the options' rules). */
export function useOptionSpellPicks(options: ChoiceOption[]): OptionSpellPick[] {
  const withRef = options.filter((o) => o.source && o.type && o.type !== "spell");
  const details = useQueries({
    queries: withRef.map((o) => ({ queryKey: ["detail", o.type, o.source, o.key], queryFn: () => api.detail(o.type!, o.source!, o.key), staleTime: Infinity })),
  });
  return withRef.flatMap((option, i) => (details[i].data?.spellPicks ?? []).map((pick, index) => ({ option, pick, index })));
}

export const unfinishedOptionSpellPicks = (picks: OptionSpellPick[], sel: OptionSpellSelections) =>
  picks.filter((p) => (sel[p.option.key]?.[p.index]?.length ?? 0) < Math.min(p.pick.count, p.pick.options.length));

export function OptionSpellPicks({
  picks, sel, onChange, taken,
}: { picks: OptionSpellPick[]; sel: OptionSpellSelections; onChange: (s: OptionSpellSelections) => void; taken?: string[] }) {
  return (
    <>
      {picks.map(({ option, pick, index }) => (
        <div key={`${option.key}:${index}`} className="mt-3 rounded-lg border border-ink-800 bg-ink-850/50 p-3">
          <ChoicePicker
            choice={{
              id: `${option.key}:spells:${index}`, kind: "feature", count: pick.count,
              label: `${option.name}: ${pick.label}${pick.uses === "ritual" ? " (cast as rituals)" : ""} (doesn't count against spells known)`,
              options: pick.options.map((o) => ({ ...o, type: "spell" as const })),
            } satisfies Choice}
            taken={taken}
            selected={sel[option.key]?.[index] ?? []}
            onChange={(keys) => onChange({ ...sel, [option.key]: { ...sel[option.key], [index]: keys } })}
          />
        </div>
      ))}
    </>
  );
}
