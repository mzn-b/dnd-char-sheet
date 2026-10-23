import { takeSnapshot } from "../../lib/levelDown";
import { splitFeature } from "../../lib/featureSections";
import {
  addGrantedSpells, addOptionSpellPicks, addProficiencyLine, applyEffects, applySubfeatureMechanics, attachProgression, buildFeature, grantFeature, grantProgression, prepareGrantedSpells,
  resolveSubfeatures, type OptionSpellSelections,
} from "../../lib/apply";
import { uid } from "../../lib/defaults";
import { syncSteelDefender } from "../../lib/steelDefender";
import { applyGrants, resolveGrants } from "../../lib/grants";
import { applyDetectedUses } from "../../lib/uses";
import { mod, skillName, totalLevel } from "../../lib/rules";
import type {
  Ability, Character, ChoiceOption, ClassEntry, ClassRules, ContentDetail, ContentRef, ContentSummary, Feature, Progression, Selections, SpellEntry,
  SpellPick, SpellVariant, SubclassRules, SubFeature, Choice,
} from "../../lib/types";
import { recomputeSlots, type LevelPlan } from "./plan";

/**
 * The level-up itself, without UI: which features a level brings, how much HP it gives, and applying all
 * picks to the character. The wizard collects the picks; tests drive it directly.
 */

export type NewFeature = ContentRef & { optional?: boolean; replaces?: string; kind: "class" | "subclass" };

/**
 * Features replaced by Tasha's optional ones: those swapped at this level plus any the character
 * already swapped ("…optional feature, which replaces the Natural Explorer feature").
 */
function replacedFeatures(c: Character, now: string[]): Set<string> {
  const before = c.features.flatMap((f) => [...(f.description ?? "").matchAll(/which replaces the (.+?) feature/gi)].map((m) => m[1]));
  return new Set([...now, ...before].map((n) => n.toLowerCase()));
}

/** "Favored Enemy", or its later "Favored Enemy improvement" / "Favored Enemy and Natural Explorer improvements" when all are replaced. */
function isReplaced(name: string, replaced: Set<string>) {
  if (replaced.has(name.toLowerCase())) return true;
  const m = name.match(/^(.+?) improvements?$/i);
  return !!m && m[1].split(/ and /i).every((n) => replaced.has(n.trim().toLowerCase()));
}

/** Optional features at this level that replace another one: offered as a swap. */
export const optionalSwaps = (plan: LevelPlan | null, optionalOn: boolean) =>
  optionalOn ? (plan?.current?.features ?? []).filter((f) => f.optional && f.replaces) : [];

/** Class and subclass features gained at the plan's level, after Tasha's swaps. */
export function newFeaturesFor(
  c: Character, plan: LevelPlan | null, subRules: SubclassRules | undefined, optionalOn: boolean, keepOriginal: Record<string, boolean>,
): NewFeature[] {
  if (!plan) return [];
  const fromClass = (plan.current?.features ?? []).map((f) => ({ ...f, kind: "class" as const }));
  const fromSub = (subRules?.levels.find((l) => l.level === plan.newLevel)?.features ?? []).map((f) => ({ ...f, kind: "subclass" as const }));
  const replaced = replacedFeatures(c, optionalSwaps(plan, optionalOn).filter((f) => !keepOriginal[f.key]).map((f) => f.replaces!));
  const owned = new Set(c.features.map((f) => f.name.toLowerCase()));
  // ASI is represented by the choice step instead of a feature entry.
  return [...fromClass, ...fromSub]
    .filter((f) => !/ability score improvement/i.test(f.name))
    .filter((f) => optionalOn || !f.optional)
    .filter((f) => !(f.optional && f.replaces && keepOriginal[f.key]))
    .filter((f) => !isReplaced(f.name, replaced))
    // "Deft Explorer Improvement" only for those who took Deft Explorer.
    .filter((f) => !(f.optional && /^(.+) improvement$/i.test(f.name) && !owned.has(f.name.replace(/ improvement$/i, "").toLowerCase()) && !fromClass.some((x) => x.name === f.name.replace(/ improvement$/i, ""))));
}

/** HP for the level: max die at 1st level overall, else average or roll; a CON increase counts for every level. */
export function hpGainFor(c: Character, plan: LevelPlan, hitDie: number, opts: { hpMode: "average" | "roll"; hpRoll: number | null; conGain: number }) {
  const conMod = mod(c.abilities.con);
  const baseHp = plan.isFirstLevelOverall ? hitDie : opts.hpMode === "average" ? Math.floor(hitDie / 2) + 1 : opts.hpRoll ?? 0;
  const newConMod = mod(c.abilities.con + (plan.grantsAsi ? opts.conGain : 0));
  return Math.max(1, baseHp + newConMod) + (newConMod - conMod) * totalLevel(c);
}

/** Everything the player picked for one level. */
export interface LevelUpPicks {
  subclass: ContentSummary | null;
  /** The subclass in effect (existing one, or the one picked now). */
  activeSubclass?: ContentRef & { variant?: string };
  variant?: SpellVariant;
  newFeatures: NewFeature[];
  featureDetails: (ContentDetail | undefined)[];
  featureSel: Record<string, Selections>;
  asiMode: "asi" | "feat";
  asi: Partial<Record<Ability, number>>;
  featDetail?: ContentDetail;
  featSel: Selections;
  progressionSel: Record<string, string[]>;
  swapSel: Record<string, { out: string; in: string[] }>;
  spellPicks: SpellPick[];
  spellPickSel: Record<number, string[]>;
  /** Race options picked at this character level (Aasimar's Celestial Revelation at 3rd), by race feature. */
  raceChoices?: { featureId: string; choices: Choice[] }[];
  raceSel?: Selections;
  /** Spells chosen for picked options that grant a choice of spells (Pact of the Tome, Book of Ancient Secrets). */
  optionSpellSel?: OptionSpellSelections;
  cantrips: ContentSummary[];
  spells: ContentSummary[];
  swapOut: string;
  swapIn: ContentSummary[];
  arcanum: ContentSummary | null;
  arcanumLevel: number;
  skillPicks: string[];
  profLines: string[];
  hpGain: number;
}

export interface PreparedLevelUp {
  builtFeatures: Feature[];
  subclassDetail: ContentDetail | null;
  builtFeat: Feature | null;
  featGrants?: Awaited<ReturnType<typeof resolveGrants>>;
  builtProgressions: { p: Progression; choice: Choice; subs: SubFeature[] }[];
  builtSwaps: { p: Progression; out: string; choice: Choice; subs: SubFeature[] }[];
  subRules?: SubclassRules;
  grantedSpells: SpellEntry[];
  builtRace?: { featureId: string; subs: SubFeature[] }[];
}

/** Resolve everything that needs fetching (feature texts, picked options, granted spells) before applying. */
export async function prepareLevelUp(
  c: Character, rules: ClassRules, plan: LevelPlan, picks: LevelUpPicks, subRulesIn: SubclassRules | undefined,
  fetchDetail: (type: "feature" | "subclass", ref: ContentRef) => Promise<ContentDetail>,
  fetchSubclassRules: (ref: ContentRef) => Promise<SubclassRules>,
): Promise<PreparedLevelUp> {
  const origin = `${rules.name} ${plan.newLevel}`;
  const builtFeatures: Feature[] = await Promise.all(
    picks.newFeatures.map(async (f, i) => {
      const det = picks.featureDetails[i] ?? (await fetchDetail("feature", f).catch(() => null));
      if (!det) return { id: uid(), name: f.name, origin, kind: f.kind, description: "", ref: { ...f, type: "feature" as const } };
      return buildFeature({ ...det, name: f.name }, picks.featureSel[f.key] ?? {}, origin, f.kind);
    }),
  ).then((fs) => fs.flatMap(splitFeature));
  const subclassDetail = picks.subclass ? await fetchDetail("subclass", picks.subclass).catch(() => null) : null;
  const builtFeat = plan.grantsAsi && picks.asiMode === "feat" && picks.featDetail ? await buildFeature(picks.featDetail, picks.featSel, "Feat", "feat") : null;
  // The feat's spells (Magic Initiate, Fey Touched…) and any feat it grants.
  const featGrants = builtFeat && picks.featDetail ? await resolveGrants(picks.featDetail, picks.featSel, 1, `feat:${picks.featDetail.name}`) : undefined;
  const builtProgressions = await Promise.all(plan.progressions.map(async (p) => ({ p, ...(await grantProgression(p, picks.progressionSel[p.name] ?? [])) })));
  const builtSwaps = await Promise.all(
    plan.progressions
      .filter((p) => picks.swapSel[p.name]?.out && picks.swapSel[p.name].in[0])
      .map(async (p) => ({ p, out: picks.swapSel[p.name].out, ...(await grantProgression(p, picks.swapSel[p.name].in)) })),
  );
  await addOptionSpellPicks(
    [...builtFeatures.flatMap((f) => f.subfeatures ?? []), ...builtProgressions.flatMap((x) => x.subs), ...builtSwaps.flatMap((x) => x.subs)],
    picks.optionSpellSel,
  );
  const subRules = subRulesIn ?? (picks.subclass ? await fetchSubclassRules(picks.subclass).catch(() => undefined) : undefined);
  const active = picks.activeSubclass;
  // Racial spells unlock by character level, subclass (domain/oath/circle) spells by class level.
  const race = c.features.find((f) => f.kind === "race");
  const grantedSpells = [
    ...(await prepareGrantedSpells(race?.grantedSpells, totalLevel(c) + 1, "race")),
    ...(active ? await prepareGrantedSpells(picks.variant?.grantedSpells ?? subRules?.grantedSpells, plan.newLevel, `subclass:${active.key}`, rules.index) : []),
    // Spells picked from a subclass list (Nature Domain cantrip, Additional Magical Secrets).
    ...(active
      ? await prepareGrantedSpells(
          picks.spellPicks.flatMap((p, i) => (picks.spellPickSel[i] ?? []).map((k) => ({ level: p.level, mode: p.mode, uses: p.uses, spell: p.options.find((o) => o.key === k)! }))).filter((g) => g.spell),
          plan.newLevel, `subclass:${active.key}`, rules.index,
        )
      : []),
    // Class and subclass features that teach spells by level (Primal Awareness), and spells from chosen
    // options (Armor of Shadows' Mage Armor, Pact of the Chain's Find Familiar).
    ...(await Promise.all(
      [...c.features.filter((f) => f.origin.startsWith(`${rules.name} `)), ...builtFeatures]
        .flatMap((f) => [{ name: f.name, spells: f.grantedSpells }, ...(f.subfeatures ?? []).map((x) => ({ name: x.name, spells: x.grantedSpells }))])
        .concat(builtProgressions.flatMap(({ subs }) => subs.map((x) => ({ name: x.name, spells: x.grantedSpells }))))
        .concat(c.features.flatMap((f) => (f.subfeatures ?? []).filter((x) => x.grantedSpells?.length && !f.origin.startsWith(`${rules.name} `)).map((x) => ({ name: x.name, spells: x.grantedSpells }))))
        .filter((f) => f.spells?.length)
        .map((f) => prepareGrantedSpells(f.spells, plan.newLevel, `feature:${f.name}`, rules.index)),
    )).flat(),
  ];
  const builtRace = await Promise.all((picks.raceChoices ?? []).map(async (g) => ({ featureId: g.featureId, subs: await resolveSubfeatures(g.choices, picks.raceSel ?? {}) })));
  return { builtFeatures, subclassDetail, builtFeat, featGrants, builtProgressions, builtSwaps, subRules, grantedSpells, builtRace };
}

/** Apply a prepared level to a draft character. Returns the history summary lines. */
export function applyLevelUp(d: Character, rules: ClassRules, plan: LevelPlan, picks: LevelUpPicks, prep: PreparedLevelUp): string[] {
  const { builtFeatures, subclassDetail, builtFeat, builtProgressions, builtSwaps, subRules, grantedSpells } = prep;
  const origin = `${rules.name} ${plan.newLevel}`;
  const summary: string[] = [];
  // The build before this level, so "Level down" can undo it exactly.
  const buildBefore = takeSnapshot(d);
  // Class & level
  let entry = d.classes.find((k) => k.key === rules.index && k.source === rules.source);
  if (!entry) {
    entry = {
      source: rules.source, key: rules.index, name: rules.name, level: 0, hitDie: rules.hitDie,
      spellcastingAbility: rules.spellcastingAbility, casterType: rules.casterType, spellModel: rules.spellModel, preparedDivisor: rules.preparedDivisor,
    } satisfies ClassEntry;
    d.classes.push(entry);
    if (plan.isFirstLevelOverall) d.saveProficiencies = [...new Set([...d.saveProficiencies, ...rules.savingThrows])];
    for (const line of picks.profLines) addProficiencyLine(d, line);
    for (const s of picks.skillPicks) d.skills[s] = Math.max(1, d.skills[s] ?? 0) as 1 | 2;
    summary.push(plan.isFirstLevelOverall ? `Became a ${rules.name}` : `Multiclassed into ${rules.name}`);
    if (picks.skillPicks.length) summary.push(`Skill proficiencies: ${picks.skillPicks.map(skillName).join(", ")}`);
  }
  entry.level = plan.newLevel;
  const subclass = picks.subclass;
  if (subclass) entry.subclass = { source: subclass.source, key: subclass.key, name: subclass.name };
  if (entry.subclass && picks.variant && !entry.subclass.variant) {
    entry.subclass.variant = picks.variant.name;
    summary.push(`${entry.subclass.name}: ${picks.variant.name}`);
  }
  if (subclass) {
    // Subclasses like Eldritch Knight grant spellcasting to a non-caster class.
    if (!entry.spellcastingAbility && subRules?.spellcastingAbility && subRules.casterType) {
      Object.assign(entry, { spellcastingAbility: subRules.spellcastingAbility, casterType: subRules.casterType, spellModel: subRules.spellModel });
    }
    summary.push(`Chose ${rules.subclassTitle}: ${subclass.name}`);
    // 5etools subclasses ship an intro feature named after the subclass; don't add the same text twice.
    const hasIntro = builtFeatures.some((f) => f.kind === "subclass" && subclass.name.includes(f.name));
    if (subclassDetail && !hasIntro) d.features.push({ id: uid(), name: subclass.name, origin, kind: "subclass", description: subclassDetail.description, ref: { ...subclass, type: "subclass" } });
  }

  // Ability scores / feat (before HP so Constitution increases count)
  if (plan.grantsAsi && picks.asiMode === "asi") {
    for (const [a, n] of Object.entries(picks.asi)) if (n) d.abilities[a as Ability] = Math.min(20, d.abilities[a as Ability] + n);
    const parts = Object.entries(picks.asi).filter(([, n]) => n).map(([a, n]) => `${a.toUpperCase()} +${n}`);
    if (parts.length) summary.push(`Ability Score Improvement: ${parts.join(", ")}`);
  }
  if (builtFeat && picks.featDetail) {
    grantFeature(d, builtFeat, { ...picks.featDetail, effects: picks.featDetail.effects?.filter((e) => e.kind !== "speed") });
    if (prep.featGrants) applyGrants(d, prep.featGrants, "Feat");
    summary.push(`Took feat: ${builtFeat.name}${builtFeat.subfeatures?.length ? ` (${builtFeat.subfeatures.map((s) => s.name).join(", ")})` : ""}`);
  }

  d.hp.max += picks.hpGain;
  d.hp.current += picks.hpGain;

  for (const f of builtFeatures) {
    // Proficiencies the feature grants (Bonus Proficiencies, Slippery Mind, Diamond Soul…).
    if (f.effects?.length) applyEffects(d, { name: f.name, effects: f.effects });
    applySubfeatureMechanics(d, f.choices ?? [], f.subfeatures ?? []);
    applyDetectedUses(d, f);
    d.features.push(f);
  }
  if (builtFeatures.length) summary.push(`New features: ${builtFeatures.map((f) => f.name).join(", ")}`);
  for (const f of builtFeatures) if (f.subfeatures?.length) summary.push(`${f.name}: ${f.subfeatures.map((s) => s.name).join(", ")}`);
  for (const { p, choice, subs } of builtProgressions) {
    if (!subs.length) continue;
    attachProgression(d, p, choice, subs, origin);
    summary.push(`${p.name}: ${subs.map((s) => s.name).join(", ")}`);
  }
  for (const { p, out, choice, subs } of builtSwaps) {
    const parent = d.features.find((f) => f.name === p.name);
    const old = parent?.subfeatures?.find((s) => s.id === out);
    if (!parent || !old) continue;
    parent.subfeatures = parent.subfeatures!.filter((s) => s.id !== out);
    attachProgression(d, p, choice, subs, origin);
    summary.push(`${p.name}: replaced ${old.name} with ${subs.map((s) => s.name).join(", ")}`);
  }

  // Spells
  const addSpell = (s: ContentSummary) =>
    d.spellcasting.spells.push({
      id: uid(), ref: { source: s.source, key: s.key, name: s.name }, level: s.level ?? 0, classKey: rules.index,
      prepared: (s.level ?? 0) === 0 || plan.spellModel === "known", alwaysPrepared: false, notes: "",
    });
  if (picks.arcanum && picks.arcanumLevel) {
    d.spellcasting.spells.push({
      id: uid(), ref: { source: picks.arcanum.source, key: picks.arcanum.key, name: picks.arcanum.name }, level: picks.arcanumLevel, classKey: rules.index,
      prepared: true, alwaysPrepared: true, notes: "", grantedBy: "feature:Mystic Arcanum", uses: "1/long rest",
    });
    summary.push(`Mystic Arcanum: ${picks.arcanum.name}`);
  }
  picks.cantrips.forEach(addSpell);
  picks.spells.forEach(addSpell);
  if (picks.swapOut && picks.swapIn[0]) {
    const old = d.spellcasting.spells.find((s) => s.id === picks.swapOut);
    d.spellcasting.spells = d.spellcasting.spells.filter((s) => s.id !== picks.swapOut);
    addSpell(picks.swapIn[0]);
    summary.push(`Swapped ${old?.ref.name} for ${picks.swapIn[0].name}`);
  }
  if (picks.cantrips.length) summary.push(`Learned cantrips: ${picks.cantrips.map((s) => s.name).join(", ")}`);
  if (picks.spells.length) summary.push(`Learned spells: ${picks.spells.map((s) => s.name).join(", ")}`);

  const before = d.spellcasting.spells.length;
  // Spells picked for options (Pact of the Tome) take over a copy already on the list.
  addGrantedSpells(d, grantedSpells, Object.values(picks.optionSpellSel ?? {}).flatMap((byPick) => Object.values(byPick).flat()));
  const added = d.spellcasting.spells.slice(before).map((s) => s.ref.name);
  if (added.length) summary.push(`Spells granted: ${added.join(", ")}`);

  Object.assign(d.spellcasting, recomputeSlots(d.classes, entry, plan.spellcasting, d.spellcasting));

  // Race options that come at this character level (Celestial Revelation).
  for (const { featureId, subs } of prep.builtRace ?? []) {
    const feat = d.features.find((f) => f.id === featureId);
    if (!feat || !subs.length) continue;
    feat.subfeatures = [...(feat.subfeatures ?? []), ...subs];
    applySubfeatureMechanics(d, feat.choices ?? [], subs, 1);
    summary.push(`${feat.name}: ${subs.map((s) => s.name).join(", ")}`);
  }

  // The Steel Defender's HP and attacks grow with the level (and appear at Battle Smith 3).
  syncSteelDefender(d);

  d.levelHistory.push({ classKey: rules.index, className: rules.name, level: plan.newLevel, hpGained: picks.hpGain, summary, at: new Date().toISOString(), snapshot: buildBefore });
  return summary;
}

export type { ChoiceOption };
