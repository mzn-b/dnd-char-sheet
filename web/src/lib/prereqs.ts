import { featureParts } from "./featureSections";
import { effectiveScore } from "./modifiers";
import type { Ability, Character, ChoiceOption, FeatPrereq } from "./types";

/** What an option's prerequisites are checked against: the build as it will be after this level-up. */
export interface PrereqContext {
  classLevels: Record<string, number>;
  totalLevel: number;
  /** Features, options and feature sections, lower-cased (incl. picks made in this level-up). */
  names: Set<string>;
  /** Known spell names, lower-cased. */
  spells: Set<string>;
}

export function prereqContext(c: Character, opts: { classKey?: string; newLevel?: number; picked?: string[] } = {}): PrereqContext {
  const classLevels: Record<string, number> = {};
  for (const k of c.classes) classLevels[k.name.toLowerCase()] = k.key === opts.classKey && opts.newLevel ? opts.newLevel : k.level;
  const total = c.classes.reduce((s, k) => s + k.level, 0) + (opts.newLevel ? 1 : 0);
  const names = new Set([
    ...c.features.flatMap((f) => [f.name, ...(f.subfeatures ?? []).map((x) => x.name)]),
    ...(opts.picked ?? []),
  ].map((n) => n.toLowerCase()));
  return { classLevels, totalLevel: total, names, spells: new Set(c.spellcasting.spells.map((s) => s.ref.name.toLowerCase())) };
}

/** Why an option can't be taken yet, or undefined when its prerequisites are met. */
export function unmetRequirement(o: ChoiceOption, ctx: PrereqContext, newClassName?: string): string | undefined {
  const r = o.requires;
  if (!r) return undefined;
  if (r.level) {
    const cls = (r.className ?? newClassName)?.toLowerCase();
    const have = cls ? ctx.classLevels[cls] ?? 0 : ctx.totalLevel;
    if (have < r.level) return `Needs ${r.className ?? newClassName ?? "character"} level ${r.level}`;
  }
  if (r.pact && !ctx.names.has(`pact of the ${r.pact.toLowerCase()}`)) return `Needs Pact of the ${r.pact}`;
  const spell = r.spells?.find((s) => !ctx.spells.has(s.toLowerCase()));
  if (spell) return `Needs the ${spell} spell`;
  const feature = r.features?.find((f) => !ctx.names.has(f.toLowerCase()));
  if (feature) return `Needs ${feature}`;
  return undefined;
}

/**
 * Why the character can't take a feat yet (first unmet requirement), or undefined when one of its
 * prerequisite alternatives is met. `level` is the character level the feat is taken at.
 */
export function featPrereqProblem(c: Character, prereqs: FeatPrereq[] | undefined, level = c.classes.reduce((s, k) => s + k.level, 0)): string | undefined {
  if (!prereqs?.length) return undefined;
  const profs = c.proficienciesAndLanguages.toLowerCase();
  const names = new Set(featureParts(c).map((p) => p.name.toLowerCase()));
  const problems = prereqs.map((p): string | undefined => {
    if (p.level && level < p.level) return `Needs level ${p.level}`;
    if (p.abilities?.length && !p.abilities.some((a) => Object.entries(a).every(([ab, n]) => effectiveScore(c, ab as Ability) >= n)))
      return `Needs ${p.abilities.map((a) => Object.entries(a).map(([ab, n]) => `${ab.toUpperCase()} ${n}`).join(" and ")).join(" or ")}`;
    const race = (c.race ?? "").toLowerCase();
    if (p.races?.length && !p.races.some((r) => race.includes(r.name) && (!r.subrace || race.includes(r.subrace))))
      return `Needs ${p.races.map((r) => (r.subrace ? `${r.name} (${r.subrace})` : r.name)).join(" or ")}`;
    for (const pr of p.proficiency ?? []) {
      if (pr.armor && !new RegExp(`armor:[^\\n]*\\b${pr.armor}\\b|\\b${pr.armor} armor\\b`).test(profs)) return `Needs ${pr.armor} armor proficiency`;
      if (pr.weapon && !new RegExp(`weapons:[^\\n]*\\b${pr.weapon}\\b|\\b${pr.weapon} weapons\\b`).test(profs)) return `Needs ${pr.weapon} weapon proficiency`;
    }
    if (p.spellcasting && !c.classes.some((k) => k.spellcastingAbility) && !c.spellcasting.spells.length) return "Needs the ability to cast a spell";
    const feats = c.features.filter((f) => f.kind === "feat").map((f) => f.name.toLowerCase());
    const feat = p.feats?.find((f) => !feats.some((x) => x.startsWith(f)));
    if (feat) return `Needs the ${feat.replace(/\b\w/g, (x) => x.toUpperCase())} feat`;
    if (p.backgrounds?.length && !p.backgrounds.some((b) => (c.background ?? "").toLowerCase().includes(b))) return `Needs the ${p.backgrounds.join(" or ")} background`;
    if (p.features?.length && !p.features.some((f) => names.has(f))) return `Needs ${p.features.join(" or ")}`;
    return undefined;
  });
  return problems.some((x) => !x) ? undefined : problems[0];
}
