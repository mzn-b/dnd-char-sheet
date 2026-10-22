import type { Character, Feature } from "./types";

/** A named part of a feature: the feature itself, or a "**Name.**" section inside its text. */
export interface FeaturePart {
  name: string;
  text: string;
  feature: Feature;
}

/**
 * Many subclasses deliver several features as one entry: Fey Wanderer's 3rd-level feature contains
 * "**Dreadful Strikes.**", "**Fey Wanderer Magic.**" and "**Otherworldly Glamour.**". Rules that look
 * for a feature by name need these sections as parts of their own.
 */
const FEATURE_MARK = /^\*?\s*\d+(?:st|nd|rd|th)-level [^*\n]*feature\b/i;

/** Race "traits" that are description rather than something you use; they stay in the race's own text. */
const FLAVOR_TRAIT = /^(age|alignment|size|speed|languages?|creature type|ability score increase)$/i;

export function featureSections(f: Pick<Feature, "name" | "description"> & { kind?: Feature["kind"] }): { name: string; text: string }[] {
  const text = f.description ?? "";
  const heading = /(?:^|\n)\*\*([^*\n]{2,60}?)\.\*\*/g;
  const marks = [...text.matchAll(heading)].map((m) => ({ name: m[1].trim(), start: m.index! + m[0].length, at: m.index! }));
  const sections = marks.map((m, i) => ({ name: m.name, text: text.slice(m.start, i + 1 < marks.length ? marks[i + 1].at : undefined).trim(), at: m.at, end: i + 1 < marks.length ? marks[i + 1].at : text.length }));
  // A race's traits (**Claws.**, **Daunting Roar.**) are each something you have; flavor (Age, Size…)
  // stays with the race.
  if (f.kind === "race") {
    const traits = sections.filter((x) => !FLAVOR_TRAIT.test(x.name));
    if (!traits.length) return [{ name: f.name, text }];
    const intro = [text.slice(0, marks[0].at), ...sections.filter((x) => FLAVOR_TRAIT.test(x.name)).map((x) => text.slice(x.at, x.end))].join("").trim();
    return [{ name: f.name, text: intro }, ...traits.map(({ name, text: t }) => ({ name, text: t }))];
  }
  // A background's "Feature: Shelter of the Faithful" is its feature; the rest (proficiencies, tables) stays.
  if (f.kind === "background") {
    const feats = sections.filter((x) => /^feature:\s*/i.test(x.name));
    if (!feats.length) return [{ name: f.name, text }];
    const intro = sections.filter((x) => !/^feature:\s*/i.test(x.name)).map((x) => text.slice(x.at, x.end));
    return [{ name: f.name, text: [text.slice(0, marks[0].at), ...intro].join("").trim() }, ...feats.map((x) => ({ name: x.name.replace(/^feature:\s*/i, ""), text: x.text }))];
  }
  // Only sections marked as features ("*3rd-level Fey Wanderer feature*"); option lists such as
  // Fighting Style's **Archery.** / **Defense.** are choices, not features you have.
  // Tasha's "Deft Explorer Improvement" holds one unmarked benefit (**Roving.**, **Tireless.**).
  const benefit = /^You gain an additional benefit\b/i.test(text.trim());
  const features = sections.filter((x) => FEATURE_MARK.test(x.text) || benefit).map(({ name, text: t }) => ({ name, text: t }));
  if (!features.length) return [{ name: f.name, text }];
  return [{ name: f.name, text: text.slice(0, marks[0].at) }, ...features];
}

/** Every feature, chosen option and feature section on the character, by name. */
export function featureParts(c: Character): FeaturePart[] {
  return c.features.flatMap((f) => [
    ...featureSections(f).map((s) => ({ ...s, feature: f })),
    ...(f.subfeatures ?? []).map((s) => ({ name: s.name, text: s.description ?? "", feature: f })),
  ]);
}

/**
 * Split a subclass entry that bundles several features ("Gloom Stalker" → Dread Ambusher, Umbral Sight…)
 * into one feature per section, so each has its own uses, action cost and reminders. The first part keeps
 * the entry's intro text, choices, effects and granted spells. Ids are derived, so splitting is stable.
 */
export function splitFeature(f: Feature): Feature[] {
  const sections = featureSections(f);
  if (sections.length < 2) return [f];
  const [intro, ...parts] = sections;
  return [
    { ...f, description: intro.text.trim(), uses: undefined },
    ...parts.map((s): Feature => ({
      id: `${f.id}:${s.name.toLowerCase().replace(/\W+/g, "-")}`,
      name: s.name,
      origin: f.origin,
      kind: f.kind,
      description: s.text,
    })),
  ];
}
