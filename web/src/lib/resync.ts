import { api } from "./api";
import { addGrantedSpells, applyEffects, buildFeature, prepareGrantedSpells } from "./apply";
import { recomputeSlots } from "../components/levelup/plan";
import { splitFeature } from "./featureSections";
import { migrateCharacter } from "./migrate";
import { abilityScore, SKILLS, skillName, totalLevel } from "./rules";
import { applyDetectedUses, detectUses, usesMax } from "./uses";
import type { Character, ClassRules, ContentDetail, Effect, Feature, SpellEntry, SubclassRules } from "./types";

/**
 * Bump when rules parsing or automation changes in a way existing characters should pick up. Characters
 * store the version they were last synced with; the sheet offers a resync when it's older.
 */
export const RULES_VERSION = 2;

export const needsResync = (c: Character) => (c.rulesVersion ?? 0) < RULES_VERSION;

export interface ResyncPlan {
  /** What will change, in plain words. */
  changes: string[];
  /** Apply to a draft character. */
  apply: (d: Character) => void;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Re-read everything the character got from rules content (race, background, feats, class and subclass
 * features, class tables) and bring it up to date, keeping every choice, spell, item, note and use spent.
 * Fetches first; the returned apply() is synchronous so it fits the sheet's update().
 */
export async function planResync(c: Character): Promise<ResyncPlan> {
  // Current rules for every feature that came from content, and for every class.
  const refs = c.features.filter((f) => f.ref);
  const details = new Map<string, ContentDetail | null>();
  await Promise.all(
    refs.map(async (f) => details.set(f.id, await api.detail(f.ref!.type, f.ref!.source, f.ref!.key).catch(() => null))),
  );
  const classRules = new Map<string, ClassRules | null>();
  const subRules = new Map<string, SubclassRules | null>();
  await Promise.all(
    c.classes.map(async (k) => {
      classRules.set(k.key, await api.classRules(k.source, k.key).catch(() => null));
      if (k.subclass) subRules.set(k.key, await api.subclassRules(k.subclass.source, k.subclass.key).catch(() => null));
    }),
  );

  // Class and subclass features the current data has at the character's levels but the sheet lacks.
  const owned = new Set(c.features.flatMap((f) => [f.name, ...splitFeature(f).map((p) => p.name)]).map((n) => n.toLowerCase()));
  const replaced = new Set(c.features.flatMap((f) => [...(f.description ?? "").matchAll(/which replaces the (.+?) feature/gi)].map((m) => m[1].toLowerCase())));
  const missing: { feature: Feature; detail: ContentDetail }[] = [];
  for (const k of c.classes) {
    const rules = classRules.get(k.key);
    const sub = subRules.get(k.key);
    if (!rules) continue;
    for (let level = 1; level <= k.level; level++) {
      const refsHere = [
        ...(rules.levels.find((l) => l.level === level)?.features ?? []).map((f) => ({ ...f, kind: "class" as const })),
        ...(sub?.levels.find((l) => l.level === level)?.features ?? []).map((f) => ({ ...f, kind: "subclass" as const })),
      ];
      for (const f of refsHere) {
        const name = f.name.toLowerCase();
        // Optional (Tasha's) features are the player's call; ASIs are picks, not features.
        if (f.optional || owned.has(name) || replaced.has(name) || /ability score improvement/i.test(f.name) || /improvements?$/i.test(f.name)) continue;
        if (k.subclass && k.subclass.name.toLowerCase().includes(name)) continue;
        const detail = await api.detail("feature", f.source, f.key).catch(() => null);
        if (!detail) continue;
        missing.push({ feature: await buildFeature({ ...detail, name: f.name }, {}, `${rules.name} ${level}`, f.kind), detail });
      }
    }
  }

  // Granted spells as they stand now (race by character level, subclass by class level, feature tables).
  const level = totalLevel(c);
  const grants: SpellEntry[] = [];
  const race = c.features.find((f) => f.kind === "race" && f.ref);
  const raceDetail = race ? details.get(race.id) : null;
  grants.push(...(await prepareGrantedSpells(raceDetail?.grantedSpells ?? race?.grantedSpells, level, "race")));
  for (const k of c.classes) {
    const sub = subRules.get(k.key);
    if (!k.subclass || !sub) continue;
    const variant = sub.spellVariants?.find((v) => v.name === k.subclass?.variant);
    grants.push(...(await prepareGrantedSpells(variant?.grantedSpells ?? sub.grantedSpells, k.level, `subclass:${k.subclass.key}`, k.key)));
  }
  for (const f of c.features.filter((x) => x.ref && x.kind !== "race")) {
    const det = details.get(f.id);
    const cls = c.classes.find((k) => f.origin.startsWith(`${k.name} `));
    if (det?.grantedSpells?.length && (f.kind === "class" || f.kind === "subclass")) grants.push(...(await prepareGrantedSpells(det.grantedSpells, cls?.level ?? level, `feature:${f.name}`, cls?.key)));
  }

  const unsure = new Set<string>();
  const apply = (d: Character) => {
    migrateCharacter(d);
    // 1. Content features: current text, choices, effects, spells; picks and uses spent stay.
    for (const f of [...d.features]) {
      const det = f.ref ? details.get(f.id) : null;
      if (!det) continue;
      const choices = (det.choices ?? []).filter((ch) => !ch.id.startsWith("__"));
      // Effects: apply what's new (proficiencies, skills, saves are idempotent); ability increases by difference.
      const oldAbility = new Map<string, number>();
      for (const e of f.effects ?? []) if (e.kind === "ability") oldAbility.set(e.ability, (oldAbility.get(e.ability) ?? 0) + e.amount);
      const newAbility = new Map<string, number>();
      for (const e of det.effects ?? []) if (e.kind === "ability") newAbility.set(e.ability, (newAbility.get(e.ability) ?? 0) + e.amount);
      // Sheets saved before effects were recorded can't tell whether an increase is already in the score: leave
      // the score alone and point it out instead of risking a double bonus.
      for (const a of new Set([...oldAbility.keys(), ...newAbility.keys()])) {
        const diff = (newAbility.get(a) ?? 0) - (oldAbility.get(a) ?? 0);
        if (diff && f.effects) d.abilities[a as keyof Character["abilities"]] += diff;
        else if (diff) unsure.add(`${f.name} gives ${a.toUpperCase()} ${diff > 0 ? "+" : ""}${diff}: check that your ${a.toUpperCase()} score includes it`);
      }
      const rest: Effect[] = (det.effects ?? []).filter((e) => e.kind !== "ability" && !(e.kind === "speed" && f.kind !== "race"));
      if (rest.length) applyEffects(d, { name: f.name, effects: rest });
      Object.assign(f, {
        choices: choices.length ? choices : undefined,
        effects: det.effects?.length ? det.effects : undefined,
        grantedSpells: det.grantedSpells?.length ? det.grantedSpells : undefined,
        expandedSpells: det.expandedSpells?.length ? det.expandedSpells : undefined,
      });
      // Re-split with the current text: the parts it had keep their uses spent.
      const parts = d.features.filter((x) => x.id.startsWith(`${f.id}:`));
      const spent = new Map(parts.map((p) => [p.name, p.uses?.used ?? 0]));
      d.features = d.features.filter((x) => !x.id.startsWith(`${f.id}:`));
      const fresh = splitFeature({ ...f, description: det.description, uses: undefined });
      const [head, ...rest2] = fresh;
      Object.assign(f, { description: head.description });
      for (const p of rest2) {
        applyDetectedUses(d, p);
        if (p.uses) p.uses.used = Math.min(p.uses.max, spent.get(p.name) ?? 0);
      }
      d.features.splice(d.features.indexOf(f) + 1, 0, ...rest2);
    }
    // 2. Use limits as the rules read now (spent uses kept).
    for (const f of d.features) {
      const det = detectUses(f.description);
      if (f.uses && det) Object.assign(f.uses, { reset: det.reset, formula: det.formula, max: usesMax(d, det.formula, f.uses.max) });
      else if (!f.uses) applyDetectedUses(d, f);
    }
    // 3. Missing class/subclass features.
    for (const { feature, detail } of missing) {
      if (detail.effects?.length) applyEffects(d, { name: feature.name, effects: detail.effects.filter((e) => e.kind !== "speed") });
      for (const p of splitFeature(feature)) {
        applyDetectedUses(d, p);
        d.features.push(p);
      }
    }
    // 4. Class entries and spell slots from the current class tables.
    for (const k of d.classes) {
      const rules = classRules.get(k.key);
      const sub = subRules.get(k.key);
      if (!rules) continue;
      Object.assign(k, { hitDie: rules.hitDie, preparedDivisor: rules.preparedDivisor ?? k.preparedDivisor });
      if (rules.spellcastingAbility) Object.assign(k, { spellcastingAbility: rules.spellcastingAbility, casterType: rules.casterType, spellModel: rules.spellModel });
      else if (sub?.casterType) Object.assign(k, { spellcastingAbility: sub.spellcastingAbility, casterType: sub.casterType, spellModel: sub.spellModel });
      else Object.assign(k, { spellcastingAbility: undefined, casterType: "none", spellModel: undefined });
      const sc = rules.levels.find((l) => l.level === k.level)?.spellcasting ?? sub?.levels.find((l) => l.level === k.level)?.spellcasting ?? null;
      const pactUsed = d.spellcasting.pactSlots.used;
      Object.assign(d.spellcasting, recomputeSlots(d.classes, k, sc, d.spellcasting));
      d.spellcasting.pactSlots.used = Math.min(pactUsed, d.spellcasting.pactSlots.max);
    }
    // 5. Granted spells: add missing ones and refresh limits on the ones there.
    for (const g of grants) {
      const have = d.spellcasting.spells.find((s) => s.ref.key === g.ref.key && s.ref.source === g.ref.source && s.grantedBy);
      if (have) Object.assign(have, { uses: g.uses ?? have.uses, alwaysPrepared: have.alwaysPrepared || g.alwaysPrepared });
    }
    addGrantedSpells(d, grants);
    d.rulesVersion = RULES_VERSION;
  };

  // Describe the changes by comparing a synced copy with the character as it is.
  const after = structuredClone(c);
  apply(after);
  const changes: string[] = [];
  const names = (x: Character) => x.features.map((f) => `${f.name} (${f.origin})`);
  const added = names(after).filter((n) => !names(c).includes(n));
  const removed = names(c).filter((n) => !names(after).includes(n));
  if (added.length) changes.push(`Features added or split out: ${added.join(", ")}`);
  if (removed.length) changes.push(`Features merged or removed: ${removed.join(", ")}`);
  const textChanged = after.features.filter((f) => { const o = c.features.find((x) => x.id === f.id); return o && o.description !== f.description; }).map((f) => f.name);
  if (textChanged.length) changes.push(`Updated rules text: ${textChanged.join(", ")}`);
  const usesChanged = after.features.filter((f) => { const o = c.features.find((x) => x.id === f.id); return !sameJson(o?.uses && { ...o.uses, used: 0 }, f.uses && { ...f.uses, used: 0 }) && o; });
  if (usesChanged.length) changes.push(`Use limits: ${usesChanged.map((f) => `${f.name} ${f.uses ? `${usesMax(after, f.uses.formula, f.uses.max)}/${f.uses.reset} rest` : "no limit"}`).join(", ")}`);
  for (const a of ["str", "dex", "con", "int", "wis", "cha"] as const) if (after.abilities[a] !== c.abilities[a]) changes.push(`${a.toUpperCase()} ${c.abilities[a]} → ${after.abilities[a]}`);
  const skillDiff = SKILLS.filter((s) => (after.skills[s.key] ?? 0) !== (c.skills[s.key] ?? 0)).map((s) => `${skillName(s.key)} ${["—", "proficient", "expertise"][after.skills[s.key] ?? 0] ?? after.skills[s.key]}`);
  if (skillDiff.length) changes.push(`Skills: ${skillDiff.join(", ")}`);
  const saves = after.saveProficiencies.filter((s) => !c.saveProficiencies.includes(s));
  if (saves.length) changes.push(`Saving throw proficiencies: ${saves.map((s) => s.toUpperCase()).join(", ")}`);
  const lines = after.proficienciesAndLanguages.split("\n").filter((l) => l && !c.proficienciesAndLanguages.split("\n").includes(l));
  if (lines.length) changes.push(`Proficiencies: ${lines.join("; ")}`);
  if (after.speed !== c.speed) changes.push(`Speed ${c.speed} → ${after.speed} ft`);
  const spellsAdded = after.spellcasting.spells.filter((s) => !c.spellcasting.spells.some((x) => x.id === s.id)).map((s) => s.ref.name);
  if (spellsAdded.length) changes.push(`Spells granted: ${spellsAdded.join(", ")}`);
  const spellUses = after.spellcasting.spells.filter((s) => { const o = c.spellcasting.spells.find((x) => x.id === s.id); return o && o.uses !== s.uses; }).map((s) => `${s.ref.name} ${s.uses ?? "no limit"}`);
  if (spellUses.length) changes.push(`Spell limits: ${spellUses.join(", ")}`);
  if (!sameJson(after.spellcasting.slots.map((s) => s.max), c.spellcasting.slots.map((s) => s.max))) changes.push(`Spell slots: ${after.spellcasting.slots.map((s) => s.max).filter(Boolean).join("/") || "none"}`);
  if (!sameJson([after.spellcasting.pactSlots.max, after.spellcasting.pactSlots.level], [c.spellcasting.pactSlots.max, c.spellcasting.pactSlots.level])) changes.push(`Pact slots: ${after.spellcasting.pactSlots.max} × level ${after.spellcasting.pactSlots.level}`);
  for (const k of after.classes) {
    const o = c.classes.find((x) => x.key === k.key);
    if (o && (o.casterType ?? null) !== (k.casterType ?? null)) changes.push(`${k.name}: caster type ${o.casterType ?? "—"} → ${k.casterType}`);
  }
  if (abilityScore(after, "con") !== abilityScore(c, "con")) changes.push("Hit points follow the Constitution change");
  changes.push(...unsure);
  return { changes, apply };
}
