import { cachedFetch } from "./http.js";
import type { ContentDetail, ContentSummary, ContentType } from "./types.js";

const BASE = (process.env.SRD_API_URL ?? "https://www.dnd5eapi.co") + "/api/2014";
const LABEL = "SRD 5.1";

const ENDPOINT: Record<ContentType, string> = {
  spell: "spells",
  feat: "feats",
  item: "equipment",
  race: "races",
  background: "backgrounds",
  feature: "features",
  subclass: "subclasses",
  class: "classes",
};

const srd = <T = any>(path: string) => cachedFetch<T>(`${BASE}/${path}`);
const join = (parts?: string[]) => (parts ?? []).join("\n\n");

export async function listSrd(
  type: ContentType,
  opts: { cls?: string },
): Promise<ContentSummary[]> {
  if (type === "spell") {
    // Class spell lists come with levels; the global list needs per-spell lookups for classes.
    const path = opts.cls ? `classes/${opts.cls}/spells` : "spells";
    const { results } = await srd<{ results: any[] }>(path).catch(() => ({ results: [] }));
    return results.map((r) => ({
      source: "srd",
      key: r.index,
      type,
      name: r.name,
      level: r.level,
      classes: opts.cls ? [opts.cls] : undefined,
      sourceLabel: LABEL,
    }));
  }
  if (type === "subclass" && opts.cls) {
    const { results } = await srd<{ results: any[] }>(`classes/${opts.cls}/subclasses`);
    return results.map((r) => ({ source: "srd", key: r.index, type, name: r.name, classes: [opts.cls!], sourceLabel: LABEL }));
  }
  const { results } = await srd<{ results: any[] }>(ENDPOINT[type]);
  return results.map((r) => ({ source: "srd", key: r.index, type, name: r.name, sourceLabel: LABEL }));
}

export async function getSrd(type: ContentType, key: string): Promise<ContentDetail> {
  const r = await srd<any>(`${ENDPOINT[type]}/${key}`);
  const base = { source: "srd" as const, key, type, name: r.name, sourceLabel: LABEL };
  switch (type) {
    case "spell":
      return {
        ...base,
        level: r.level,
        classes: r.classes?.map((c: any) => c.index),
        description: join(r.desc) + (r.higher_level?.length ? `\n\n**At Higher Levels.** ${join(r.higher_level)}` : ""),
        meta: {
          Level: r.level === 0 ? "Cantrip" : String(r.level),
          School: r.school?.name ?? "",
          "Casting Time": r.casting_time,
          Range: r.range,
          Components: (r.components ?? []).join(", ") + (r.material ? ` (${r.material})` : ""),
          Duration: (r.concentration ? "Concentration, " : "") + r.duration,
        },
        spell: { school: r.school?.name, ritual: r.ritual, concentration: r.concentration },
      };
    case "feat":
      return {
        ...base,
        description: join(r.desc),
        prerequisite: r.prerequisites
          ?.map((p: any) => `${p.ability_score?.name ?? ""} ${p.minimum_score ?? ""}`.trim())
          .join(", "),
        meta: {},
      };
    case "item":
      return {
        ...base,
        description: join(r.desc),
        meta: compact({
          Category: r.equipment_category?.name,
          Cost: r.cost ? `${r.cost.quantity} ${r.cost.unit}` : undefined,
          Weight: r.weight != null ? `${r.weight} lb` : undefined,
          Damage: r.damage ? `${r.damage.damage_dice} ${r.damage.damage_type?.name ?? ""}` : undefined,
          AC: r.armor_class ? `${r.armor_class.base}${r.armor_class.dex_bonus ? " + Dex" : ""}` : undefined,
          Properties: r.properties?.map((p: any) => p.name).join(", ") || undefined,
        }),
      };
    case "race":
      return {
        ...base,
        description: [r.alignment, r.age, r.size_description, r.language_desc].filter(Boolean).join("\n\n"),
        meta: compact({
          Speed: r.speed ? `${r.speed} ft` : undefined,
          Size: r.size,
          "Ability Bonuses": r.ability_bonuses?.map((b: any) => `${b.ability_score.name} +${b.bonus}`).join(", "),
          Traits: r.traits?.map((t: any) => t.name).join(", "),
        }),
        effects: r.ability_bonuses?.map((b: any) => ({ kind: "ability", ability: b.ability_score.index, amount: b.bonus })),
      };
    case "background":
      return {
        ...base,
        description: [r.feature?.name && `**${r.feature.name}.** ${join(r.feature.desc)}`].filter(Boolean).join("\n\n"),
        meta: compact({ Proficiencies: r.starting_proficiencies?.map((p: any) => p.name).join(", ") }),
      };
    case "subclass":
      return { ...base, classes: [r.class?.index], description: join(r.desc), meta: { Flavor: r.subclass_flavor ?? "" } };
    default:
      return { ...base, description: join(r.desc), meta: {} };
  }
}

/** Class progression normalized for the level-up wizard. */
export async function getClassRules(index: string) {
  const [cls, levels] = await Promise.all([srd<any>(`classes/${index}`), srd<any[]>(`classes/${index}/levels`)]);
  return {
    source: "srd" as const,
    index: cls.index,
    name: cls.name,
    hitDie: cls.hit_die,
    savingThrows: cls.saving_throws?.map((s: any) => s.index) ?? [],
    spellcastingAbility: cls.spellcasting?.spellcasting_ability?.index ?? null,
    subclassLevel: SUBCLASS_LEVEL[index] ?? 3,
    subclasses: cls.subclasses?.map((s: any) => ({ key: s.index, name: s.name, source: "srd" })) ?? [],
    levels: levels
      .filter((l) => !l.subclass)
      .sort((a, b) => a.level - b.level)
      .map((l) => normalizeLevel(l)),
  };
}

export async function getSubclassLevels(index: string) {
  const levels = await srd<any[]>(`subclasses/${index}/levels`).catch(() => []);
  return levels.map((l) => ({
    level: l.level,
    features: (l.features ?? []).map((f: any) => ({ key: f.index, name: f.name, source: "srd" })),
  }));
}

export function normalizeLevel(l: any) {
  const sc = l.spellcasting;
  return {
    level: l.level,
    profBonus: l.prof_bonus,
    abilityScoreBonuses: l.ability_score_bonuses ?? 0,
    features: (l.features ?? []).map((f: any) => ({ key: f.index, name: f.name, source: "srd" })),
    spellcasting: sc
      ? {
          cantripsKnown: sc.cantrips_known ?? 0,
          spellsKnown: sc.spells_known ?? null,
          slots: Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0),
        }
      : null,
    classSpecific: l.class_specific ?? {},
  };
}

/** Level at which each SRD class picks its subclass (not exposed by the API). */
const SUBCLASS_LEVEL: Record<string, number> = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };

function compact(o: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Record<string, string>;
}
