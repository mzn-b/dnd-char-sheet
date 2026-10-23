import { api } from "./api";
import { addGrantedSpells, buildFeature, grantFeature, prepareGrantedSpells } from "./apply";
import type { Character, Choice, ContentDetail, ContentSummary, Feature, GrantedSpell, Selections, SpellEntry } from "./types";

/**
 * Picks that come with a race, background or feat beyond its plain choices: which spell set (Magic
 * Initiate's class, Astral Elf's cantrip), which spells (High Elf's wizard cantrip), and which feat
 * (Variant Human, Strixhaven backgrounds). They're offered as ordinary choices with reserved ids and
 * applied by resolveGrants.
 */
export const VARIANT_ID = "__variant";
export const FEAT_ID = "__feat";
export const spellPickId = (variant: string | undefined, i: number) => `__spell:${variant ?? ""}:${i}`;
/** Selections for the granted feat's own choices are stored under this prefix. */
export const FEAT_PREFIX = "__feat/";

export const isGrantChoice = (ch: Choice) => ch.id.startsWith("__");

/** Add the grant choices to a detail's choices. `allFeats` lists feats for "any feat of your choice". */
export function withGrantChoices(d: ContentDetail, allFeats?: ContentSummary[]): Choice[] {
  const out: Choice[] = [];
  const variants = d.spellVariants ?? [];
  if (variants.length > 1) {
    out.push({
      id: VARIANT_ID, kind: "feature", count: 1, label: `${d.name}: choose one`,
      options: variants.map((v) => ({ key: v.name, name: v.name, description: v.grantedSpells.map((g) => g.spell.name).join(", ") || "Spells chosen below." })),
    });
    variants.forEach((v) =>
      v.spellPicks.forEach((p, i) =>
        out.push({ id: spellPickId(v.name, i), kind: "feature", count: p.count, label: `${v.name}: ${p.label}`, options: p.options.map((o) => ({ ...o, type: "spell" as const })), when: { id: VARIANT_ID, key: v.name } }),
      ),
    );
  } else {
    (d.spellPicks ?? []).forEach((p, i) => out.push({ id: spellPickId(undefined, i), kind: "feature", count: p.count, label: p.label, options: p.options.map((o) => ({ ...o, type: "spell" as const })) }));
  }
  const fc = d.featChoice;
  if (fc) {
    const options = (fc.options ?? allFeats ?? []).map((f) => ({ key: f.key, name: f.name, source: f.source, type: "feat" as const, prereqs: (f as ContentSummary).prereqs }));
    if (options.length) out.push({ id: FEAT_ID, kind: "feature", count: fc.count, label: fc.options?.length === 1 ? `Feat: ${options[0].name}` : `Choose ${fc.count === 1 ? "a feat" : `${fc.count} feats`}`, options, ...(options.length === 1 ? { required: [options[0].key] } : {}) });
  }
  return out;
}

/** Choices that can be made by this character level (race options picked later, like Celestial Revelation). */
export const choicesUpTo = (choices: Choice[] | undefined, level: number) => (choices ?? []).filter((ch) => !ch.level || ch.level <= level);

/** Whether a choice applies given the other picks (a Magic Initiate class's spells only once that class is picked). */
export const choiceShown = (ch: Choice, selections: Selections) => !ch.when || (selections[ch.when.id] ?? []).includes(ch.when.key);

/** The selections for a granted feat's own choices. */
export const featSelections = (selections: Selections): Selections =>
  Object.fromEntries(Object.entries(selections).filter(([k]) => k.startsWith(FEAT_PREFIX)).map(([k, v]) => [k.slice(FEAT_PREFIX.length), v]));

/**
 * Spells and feats a detail grants with these picks. `level` decides which spells are unlocked
 * (character level for races, 1 for feats). Granted feats come back built, with their own grants.
 */
export async function resolveGrants(
  d: ContentDetail, selections: Selections, level: number, grantedBy: string,
): Promise<{ spells: SpellEntry[]; feats: { feature: Feature; detail: ContentDetail }[] }> {
  const variant = d.spellVariants && d.spellVariants.length > 1 ? d.spellVariants.find((v) => v.name === selections[VARIANT_ID]?.[0]) : undefined;
  const granted: GrantedSpell[] = [...(variant?.grantedSpells ?? d.grantedSpells ?? [])];
  const picks = variant ? variant.spellPicks : d.spellPicks ?? [];
  picks.forEach((p, i) => {
    for (const k of selections[spellPickId(variant?.name, i)] ?? []) {
      const spell = p.options.find((o) => o.key === k);
      if (spell) granted.push({ level: p.level, spell, mode: p.mode, uses: p.uses });
    }
  });
  const spells = await prepareGrantedSpells(granted, level, grantedBy);
  const feats: { feature: Feature; detail: ContentDetail }[] = [];
  // A single named feat (Wildspacer's Tough) is granted without asking.
  const single = d.featChoice?.options?.length === 1 ? [d.featChoice.options[0].key] : [];
  for (const key of selections[FEAT_ID]?.length ? selections[FEAT_ID] : single) {
    const opt = d.featChoice?.options?.find((o) => o.key === key) ?? { source: "5etools" as const, key };
    const detail = await api.detail("feat", opt.source, key).catch(() => null);
    if (!detail) continue;
    const sub = featSelections(selections);
    const feature = await buildFeature(detail, sub, "Feat", "feat");
    const nested = await resolveGrants(detail, sub, 1, `feat:${detail.name}`);
    spells.push(...nested.spells);
    feats.push({ feature, detail }, ...nested.feats);
  }
  return { spells, feats };
}

/**
 * Apply resolved grants to a draft: the spells, and each granted feat as a feature (its origin says where it
 * came from, so changing race or background removes it again).
 */
export function applyGrants(d: Character, res: Awaited<ReturnType<typeof resolveGrants>>, origin: string) {
  for (const { feature, detail } of res.feats) {
    feature.origin = origin;
    grantFeature(d, feature, { ...detail, effects: detail.effects?.filter((e) => e.kind !== "speed") });
  }
  addGrantedSpells(d, res.spells);
}

/** A Constitution change after levels were gained also changes the HP of every level. */
export function keepHpInStepWithCon(d: Character, conBefore: number) {
  const diff = Math.floor((d.abilities.con - 10) / 2) - Math.floor((conBefore - 10) / 2);
  const levels = d.classes.reduce((s, k) => s + k.level, 0);
  if (diff && levels) {
    d.hp.max += diff * levels;
    d.hp.current = Math.max(0, d.hp.current + diff * levels);
  }
}
