import { syncSteelDefender } from "./steelDefender";
import { recomputeSlots } from "../components/levelup/plan";
import { applySubfeatureMechanics } from "./apply";
import { SKILLS, XP_THRESHOLDS, hpMax, totalLevel } from "./rules";
import type { Ability, BuildSnapshot, Character, ClassRules, LevelRecord } from "./types";

export function takeSnapshot(c: Character): BuildSnapshot {
  return structuredClone({
    classes: c.classes,
    abilities: c.abilities,
    saveProficiencies: c.saveProficiencies,
    skills: c.skills,
    proficienciesAndLanguages: c.proficienciesAndLanguages,
    features: c.features,
    speed: c.speed,
    hpMax: c.hp.max,
    spells: c.spellcasting.spells,
    slotMax: c.spellcasting.slots.map((s) => s.max),
    pact: { max: c.spellcasting.pactSlots.max, level: c.spellcasting.pactSlots.level },
  });
}

export interface LevelDownPlan {
  record: LevelRecord;
  /** Restored from a snapshot (exact) or worked out from the history (best effort). */
  exact: boolean;
  /** What the level gave, which will be removed. */
  removes: string[];
  /** Things to check by hand afterwards (best-effort path only). */
  warnings: string[];
  canLevelDown: boolean;
  reason?: string;
}

export function planLevelDown(c: Character): LevelDownPlan | null {
  const record = c.levelHistory[c.levelHistory.length - 1];
  if (!record) return null;
  const base = { record, exact: !!record.snapshot, removes: [`${record.className} level ${record.level}`, `${record.hpGained} max HP`, ...record.summary] };
  if (totalLevel(c) <= 1) return { ...base, warnings: [], canLevelDown: false, reason: "A character needs at least one level. Delete or recreate the character instead." };
  if (record.snapshot) return { ...base, warnings: [], canLevelDown: true };
  const warnings: string[] = ["This level was gained before level snapshots existed, so it's undone from its history."];
  if (record.summary.some((s) => /^Swapped |replaced /.test(s))) warnings.push("A spell or option swapped at this level isn't restored: re-add the old one if you want it back.");
  if (record.summary.some((s) => /^Chose /.test(s))) warnings.push("Subclass removed: spellcasting a subclass granted (Eldritch Knight, Arcane Trickster) may need fixing.");
  if (record.summary.some((s) => /^Became a |^Multiclassed into /.test(s))) warnings.push("Proficiencies gained from the class remain in your Proficiencies & Languages text.");
  return { ...base, warnings, canLevelDown: true };
}

const listAfter = (summary: string[], prefix: string) =>
  summary.filter((s) => s.startsWith(prefix)).flatMap((s) => s.slice(prefix.length).split(/,\s*/)).map((s) => s.trim()).filter(Boolean);

/**
 * Undo the most recent level-up. Play state (current HP, inventory, coins, notes, creatures, spell
 * uses, XP unless asked) stays; the build goes back to how it was before that level.
 * `rules` (the leveled class's progression) lets the best-effort path recompute spell slots.
 */
export function levelDown(d: Character, opts: { rules?: ClassRules; lowerXp?: boolean } = {}) {
  const record = d.levelHistory[d.levelHistory.length - 1];
  if (!record || totalLevel(d) <= 1) return;
  const snap = record.snapshot;
  if (snap) {
    const usage = new Map(d.spellcasting.spells.map((s) => [s.id, s]));
    d.classes = snap.classes;
    d.abilities = snap.abilities;
    d.saveProficiencies = snap.saveProficiencies;
    d.skills = snap.skills;
    d.proficienciesAndLanguages = snap.proficienciesAndLanguages;
    d.features = snap.features;
    d.speed = snap.speed;
    d.hp.max = snap.hpMax;
    // Keep how much each remaining spell has been used.
    d.spellcasting.spells = snap.spells.map((s) => {
      const now = usage.get(s.id);
      return now ? { ...s, usesSpent: now.usesSpent, castCount: now.castCount, prepared: now.prepared } : s;
    });
    d.spellcasting.slots = snap.slotMax.map((max, i) => ({ max, used: Math.min(d.spellcasting.slots[i]?.used ?? 0, max) }));
    d.spellcasting.pactSlots = { ...snap.pact, used: Math.min(d.spellcasting.pactSlots.used, snap.pact.max) };
  } else {
    bestEffort(d, record, opts.rules);
  }
  d.levelHistory = d.levelHistory.slice(0, -1);
  d.hp.current = Math.min(d.hp.current, hpMax(d));
  syncSteelDefender(d);
  if (opts.lowerXp) d.xp = Math.min(d.xp, XP_THRESHOLDS[Math.max(0, totalLevel(d) - 1)]);
}

/** Undo a level from what its history entry says it gave. */
function bestEffort(d: Character, record: LevelRecord, rules?: ClassRules) {
  const s = record.summary;
  const entry = d.classes.find((k) => k.key === record.classKey) ?? d.classes.find((k) => k.name === record.className);
  if (!entry) return;
  const origin = `${record.className} ${record.level}`;

  // Features gained at this level (class and subclass), with the mechanics of their choices.
  for (const f of d.features.filter((x) => x.origin === origin && x.kind !== "feat")) {
    applySubfeatureMechanics(d, f.choices ?? [], f.subfeatures ?? [], -1);
  }
  d.features = d.features.filter((x) => !(x.origin === origin && x.kind !== "feat"));

  // Options picked by count (Invocations, Maneuvers…): "Invocations: Agonizing Blast, Devil's Sight".
  for (const line of s) {
    const m = line.match(/^([^:]+): (.+)$/);
    const parent = m && d.features.find((f) => f.name === m[1] && f.subfeatures?.length);
    if (!m || !parent || /^(Learned|Spells granted|Took feat|Ability Score|Skill proficiencies|Chose|New features)/.test(line)) continue;
    const names = m[2].split(/,\s*/);
    const removed = parent.subfeatures!.filter((x) => names.includes(x.name));
    applySubfeatureMechanics(d, parent.choices ?? [], removed, -1);
    parent.subfeatures = parent.subfeatures!.filter((x) => !removed.includes(x));
  }

  // Feat or Ability Score Improvement.
  const feat = s.find((x) => x.startsWith("Took feat: "))?.slice(11).replace(/ \(.*\)$/, "");
  if (feat) {
    const f = [...d.features].reverse().find((x) => x.kind === "feat" && x.name === feat);
    if (f) {
      applySubfeatureMechanics(d, f.choices ?? [], f.subfeatures ?? [], -1);
      for (const e of f.effects ?? []) if (e.kind === "ability") d.abilities[e.ability] -= e.amount;
      d.features = d.features.filter((x) => x !== f);
    }
  }
  for (const part of listAfter(s, "Ability Score Improvement: ")) {
    const m = part.match(/^(STR|DEX|CON|INT|WIS|CHA) \+(\d+)$/);
    if (m) d.abilities[m[1].toLowerCase() as Ability] -= Number(m[2]);
  }

  // Skills picked for a new class.
  for (const name of listAfter(s, "Skill proficiencies: ")) {
    const key = SKILLS.find((k) => k.name === name)?.key;
    if (key) d.skills[key] = 0;
  }

  // Spells learned or granted at this level.
  for (const name of [...listAfter(s, "Learned cantrips: "), ...listAfter(s, "Learned spells: "), ...listAfter(s, "Spells granted: ")]) {
    const i = d.spellcasting.spells.map((x) => x.ref.name).lastIndexOf(name);
    if (i >= 0) d.spellcasting.spells.splice(i, 1);
  }

  if (s.some((x) => x.startsWith("Chose "))) entry.subclass = undefined;
  d.hp.max -= record.hpGained;
  entry.level -= 1;
  if (entry.level <= 0) d.classes = d.classes.filter((k) => k !== entry);

  // Spell slots for the new level.
  if (rules && entry.level > 0) {
    const sc = rules.levels[entry.level - 1]?.spellcasting ?? null;
    Object.assign(d.spellcasting, recomputeSlots(d.classes, entry, sc, d.spellcasting));
  }
}
