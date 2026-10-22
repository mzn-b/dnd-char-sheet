import { casterType, multiclassSlots } from "../../lib/rules";
import type { Character, ClassEntry, ClassRules, LevelRules, Progression, SpellModel, SpellProgression, SubclassRules } from "../../lib/types";

/** Everything the wizard needs to know about the level being gained. */
export interface LevelPlan {
  newLevel: number;
  isFirstLevelOverall: boolean;
  isNewClass: boolean;
  current: LevelRules | undefined;
  /** Spell table for this level: the class's own, or a subclass's (Eldritch Knight, Arcane Trickster). */
  spellcasting: SpellProgression | null;
  spellModel: SpellModel | null;
  needsSubclass: boolean;
  grantsAsi: boolean;
  cantripPicks: number;
  spellPicks: number;
  /** Unlimited optional picks for homebrew casters without a progression table. */
  freeSpellPicks: boolean;
  canSwapSpell: boolean;
  maxSpellLevel: number;
  preparedNote: string | null;
  progressions: Progression[];
}

export function planLevel(c: Character, rules: ClassRules, sub?: SubclassRules): LevelPlan {
  const existing = c.classes.find((k) => k.key === rules.index && k.source === rules.source);
  const newLevel = (existing?.level ?? 0) + 1;
  const current = rules.levels.find((l) => l.level === newLevel);
  const previous = rules.levels.find((l) => l.level === newLevel - 1);
  const subNow = sub?.levels.find((l) => l.level === newLevel);
  const subPrev = sub?.levels.find((l) => l.level === newLevel - 1);
  const sc = current?.spellcasting ?? subNow?.spellcasting ?? null;
  const prevSc = previous?.spellcasting ?? subPrev?.spellcasting ?? null;
  const model = rules.spellModel ?? sub?.spellModel ?? null;
  const isCaster = !!(rules.spellcastingAbility ?? (sub?.casterType ? sub.spellcastingAbility : null));

  let spellPicks = 0;
  if (sc && model === "known" && sc.spellsKnown != null) spellPicks = sc.spellsKnown - (prevSc?.spellsKnown ?? 0);
  if (sc && model === "spellbook") spellPicks = newLevel === 1 ? 6 : 2;

  const maxSpellLevel = sc ? sc.slots.reduce((hi, n, i) => (n > 0 ? i + 1 : hi), 0) : 9;

  return {
    newLevel,
    isFirstLevelOverall: c.classes.length === 0,
    isNewClass: !existing,
    current,
    spellcasting: sc,
    spellModel: model,
    needsSubclass: !existing?.subclass && newLevel === rules.subclassLevel,
    grantsAsi: (current?.abilityScoreBonuses ?? 0) > (previous?.abilityScoreBonuses ?? 0),
    cantripPicks: sc ? Math.max(0, sc.cantripsKnown - (prevSc?.cantripsKnown ?? 0)) : 0,
    spellPicks: Math.max(0, spellPicks),
    freeSpellPicks: isCaster && !sc,
    canSwapSpell: model === "known" && newLevel > 1 && !!sc && !!prevSc,
    maxSpellLevel,
    preparedNote:
      sc && model === "prepared"
        ? `${rules.name}s prepare spells from their entire class list after each long rest. Manage prepared spells any time on the Spells tab.`
        : null,
    progressions: [...(current?.progressions ?? []), ...(subNow?.progressions ?? [])],
  };
}

/**
 * Recompute spell slots after the level-up. Single-class casters use their own table;
 * multiclass casters use the PHB multiclass table; pact magic is tracked separately.
 */
export function recomputeSlots(classes: ClassEntry[], leveled: ClassEntry, spellcasting: SpellProgression | null, current: Character["spellcasting"]) {
  const slotCasters = classes.filter((k) => ["full", "half", "third", "artificer"].includes(casterType(k)));
  let max: number[] | null = null;
  if (slotCasters.length > 1) max = multiclassSlots(classes);
  else if (slotCasters.length === 1 && slotCasters[0].key === leveled.key && spellcasting) max = spellcasting.slots;

  const slots = max ? max.map((m, i) => ({ max: m, used: Math.min(current.slots[i]?.used ?? 0, m) })) : current.slots;
  const warlock = classes.find((k) => casterType(k) === "pact");
  let pact = current.pactSlots;
  if (warlock && warlock.key === leveled.key && spellcasting) {
    const level = spellcasting.slots.findIndex((n) => n > 0) + 1;
    pact = { max: spellcasting.slots[level - 1] ?? 0, level, used: 0 };
  }
  // A pure warlock's slots live in the pact tracker only.
  const pureWarlock = !slotCasters.length && casterType(leveled) === "pact";
  return { slots: pureWarlock ? current.slots.map((s) => ({ ...s, max: 0, used: 0 })) : slots, pactSlots: pact };
}
