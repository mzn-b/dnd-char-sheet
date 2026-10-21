import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Corrections } from "./api";
import type { RollInfo } from "./rollText";

const KEY = ["corrections"];
const EMPTY: Corrections = { hiddenRolls: [], hiddenReminders: [] };

/** Stable identity for a roll found in a text, so it stays hidden when the text is read again. */
export const rollKey = (source: string, r: Pick<RollInfo, "dice" | "kind" | "type" | "condition" | "minCharacterLevel">) =>
  `${source.toLowerCase()}::${r.dice}|${r.kind}|${r.type ?? ""}|${r.condition ?? ""}|${r.minCharacterLevel ?? ""}`;

/**
 * Values the user marked as incorrect. Hidden app-wide (a misread rule is wrong for every
 * character) and restorable from wherever they were hidden.
 */
export function useCorrections() {
  const qc = useQueryClient();
  const { data = EMPTY } = useQuery({ queryKey: KEY, queryFn: api.corrections, staleTime: Infinity });
  const save = useMutation({
    mutationFn: api.saveCorrections,
    onMutate: (next) => {
      const prev = qc.getQueryData<Corrections>(KEY);
      qc.setQueryData(KEY, next);
      return { prev };
    },
    onError: (_e, _n, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
  });
  const toggle = (field: keyof Corrections, key: string, hide: boolean) => {
    const set = new Set(data[field]);
    if (hide) set.add(key);
    else set.delete(key);
    save.mutate({ ...data, [field]: [...set] });
  };
  const hiddenRolls = new Set(data.hiddenRolls);
  const hiddenReminders = new Set(data.hiddenReminders);
  return {
    isRollHidden: (key: string) => hiddenRolls.has(key),
    hideRoll: (key: string) => toggle("hiddenRolls", key, true),
    restoreRoll: (key: string) => toggle("hiddenRolls", key, false),
    isReminderHidden: (text: string) => hiddenReminders.has(text),
    hideReminder: (text: string) => toggle("hiddenReminders", text, true),
    restoreReminder: (text: string) => toggle("hiddenReminders", text, false),
  };
}
