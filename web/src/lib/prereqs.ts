import type { Character, ChoiceOption } from "./types";

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
