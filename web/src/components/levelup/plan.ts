import { casterType, multiclassSlots, pactSlots, spellModel } from "../../lib/rules";
import type { Character, ClassEntry, ClassRules, LevelRules } from "../../lib/types";

/** Everything the wizard needs to know about the level being gained. */
export interface LevelPlan {
  newLevel: number;
  isFirstLevelOverall: boolean;
  isNewClass: boolean;
  current: LevelRules | undefined;
  previous: LevelRules | undefined;
  needsSubclass: boolean;
  grantsAsi: boolean;
  cantripPicks: number;
  spellPicks: number;
  /** Unlimited optional picks for homebrew casters without a progression table. */
  freeSpellPicks: boolean;
  canSwapSpell: boolean;
  maxSpellLevel: number;
  preparedNote: string | null;
}

export function planLevel(c: Character, rules: ClassRules): LevelPlan {
  const existing = c.classes.find((k) => k.key === rules.index && k.source === rules.source);
  const newLevel = (existing?.level ?? 0) + 1;
  const current = rules.levels.find((l) => l.level === newLevel);
  const previous = rules.levels.find((l) => l.level === newLevel - 1);
  const sc = current?.spellcasting;
  const prevSc = previous?.spellcasting;
  const model = spellModel(rules.index);
  const isCaster = !!rules.spellcastingAbility;

  let spellPicks = 0;
  if (sc && model === "known" && sc.spellsKnown != null) spellPicks = sc.spellsKnown - (prevSc?.spellsKnown ?? 0);
  if (sc && model === "spellbook") spellPicks = newLevel === 1 ? 6 : 2;

  const maxSpellLevel = sc ? sc.slots.reduce((hi, n, i) => (n > 0 ? i + 1 : hi), 0) : 9;

  return {
    newLevel,
    isFirstLevelOverall: c.classes.length === 0,
    isNewClass: !existing,
    current,
    previous,
    needsSubclass: !existing?.subclass && newLevel === rules.subclassLevel,
    grantsAsi: (current?.abilityScoreBonuses ?? 0) > (previous?.abilityScoreBonuses ?? 0),
    cantripPicks: sc ? Math.max(0, sc.cantripsKnown - (prevSc?.cantripsKnown ?? 0)) : 0,
    spellPicks: Math.max(0, spellPicks),
    freeSpellPicks: isCaster && !sc,
    canSwapSpell: model === "known" && newLevel > 1 && !!sc,
    maxSpellLevel,
    preparedNote:
      sc && model === "prepared"
        ? `${rules.name}s prepare spells from their entire class list after each long rest. Manage prepared spells any time on the Spells tab.`
        : null,
  };
}

/**
 * Recompute spell slots after the level-up. Single-class casters use their own table;
 * multiclass casters use the PHB multiclass table; pact magic is tracked separately.
 */
export function recomputeSlots(classes: ClassEntry[], leveled: ClassEntry, levelRules: LevelRules | undefined, current: Character["spellcasting"]) {
  const slotCasters = classes.filter((k) => ["full", "half", "third"].includes(casterType(k)));
  let max: number[] | null = null;
  if (slotCasters.length > 1) max = multiclassSlots(classes);
  else if (slotCasters.length === 1 && slotCasters[0].key === leveled.key && levelRules?.spellcasting) max = levelRules.spellcasting.slots;

  const slots = max ? max.map((m, i) => ({ max: m, used: Math.min(current.slots[i]?.used ?? 0, m) })) : current.slots;
  const warlock = classes.find((k) => casterType(k) === "pact");
  const pact = warlock ? { ...pactSlots(warlock.level), used: 0 } : current.pactSlots;
  return { slots, pactSlots: pact };
}
