import type { ContentSummary, ContentType } from "./types";

/** How a facet is filtered: numbers by range, yes/no by a switch, text by picking values. */
export type FacetKind = "range" | "bool" | "enum" | "multi";

export interface FacetSpec {
  key: string;
  label: string;
  kind: FacetKind;
  unit?: string;
  /** enum/multi: values with how many results have each. */
  options?: { value: string; count: number }[];
  /** range: smallest and largest value present. */
  min?: number;
  max?: number;
}

export interface FacetFilter {
  values?: string[];
  /** multi: every picked value must be present (otherwise any). */
  all?: boolean;
  min?: number;
  max?: number;
  bool?: boolean;
}
export type FilterState = Record<string, FacetFilter>;

/** Labels, units and display order. Facets not listed still work, labelled from their key. */
const LABELS: Record<string, { label: string; unit?: string }> = {
  cr: { label: "Challenge rating" },
  castingTime: { label: "Casting time" },
  school: { label: "School" },
  concentration: { label: "Concentration" },
  ritual: { label: "Ritual" },
  components: { label: "Components" },
  costlyMaterial: { label: "Costly material" },
  damageTypes: { label: "Damage type" },
  save: { label: "Saving throw" },
  attack: { label: "Spell attack" },
  conditions: { label: "Inflicts condition" },
  healing: { label: "Healing" },
  range: { label: "Range", unit: "ft" },
  duration: { label: "Duration" },
  upcast: { label: "Scales when upcast" },
  abilityIncreases: { label: "Ability increases" },
  abilityIncrease: { label: "Ability increase" },
  size: { label: "Size" },
  speed: { label: "Walking speed", unit: "ft" },
  movement: { label: "Other movement" },
  darkvision: { label: "Darkvision", unit: "ft" },
  resistances: { label: "Resistances" },
  immunities: { label: "Damage immunities" },
  vulnerabilities: { label: "Vulnerabilities" },
  conditionImmunities: { label: "Condition immunities" },
  skills: { label: "Skill proficiencies" },
  innateSpells: { label: "Innate spells" },
  actions: { label: "Uses action / bonus / reaction" },
  prerequisite: { label: "Prerequisite" },
  grantsSpells: { label: "Grants spells" },
  toolProficiency: { label: "Tool proficiency" },
  languages: { label: "Languages" },
  startingGold: { label: "Starting gold", unit: "gp" },
  category: { label: "Category" },
  rarity: { label: "Rarity" },
  magic: { label: "Magic item" },
  attunement: { label: "Requires attunement" },
  cost: { label: "Cost", unit: "gp" },
  weight: { label: "Weight", unit: "lb" },
  ac: { label: "Armor class" },
  damage: { label: "Damage dice" },
  damageType: { label: "Damage type" },
  properties: { label: "Weapon properties" },
  weaponCategory: { label: "Weapon category" },
  bonus: { label: "Magic bonus (+N)" },
  charges: { label: "Charges" },
  stealthDisadvantage: { label: "Stealth disadvantage" },
  hitDie: { label: "Hit die", unit: "d" },
  caster: { label: "Spellcasting" },
  saves: { label: "Saving throw proficiencies" },
  spellAbility: { label: "Spellcasting ability" },
  featureType: { label: "Option type" },
  minLevel: { label: "Required level" },
  type: { label: "Creature type" },
  hp: { label: "Hit points" },
  fly: { label: "Fly speed", unit: "ft" },
  swim: { label: "Swim speed", unit: "ft" },
  climb: { label: "Climb speed", unit: "ft" },
  burrow: { label: "Burrow speed", unit: "ft" },
  str: { label: "STR" }, dex: { label: "DEX" }, con: { label: "CON" }, int: { label: "INT" }, wis: { label: "WIS" }, cha: { label: "CHA" },
  alignment: { label: "Alignment" },
  senses: { label: "Senses" },
  legendary: { label: "Legendary actions" },
  spellcaster: { label: "Spellcaster" },
  bonusActions: { label: "Has bonus actions" },
  reactions: { label: "Has reactions" },
  environment: { label: "Environment" },
};
const ORDER = Object.keys(LABELS);

const humanize = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/** Facet values of a result, with a monster's CR added as a number. */
export function facetValues(c: ContentSummary, type: ContentType): Record<string, unknown> {
  return type === "monster" ? { cr: c.level, ...c.facets } : c.facets ?? {};
}

/** Builds the available filters from the values present in a result list. */
export function deriveFacets(items: ContentSummary[], type: ContentType): FacetSpec[] {
  const seen = new Map<string, { kind: FacetKind; nums: number[]; counts: Map<string, number> }>();
  for (const c of items) {
    for (const [key, v] of Object.entries(facetValues(c, type))) {
      if (v === undefined || v === null) continue;
      const kind: FacetKind = typeof v === "number" ? "range" : typeof v === "boolean" ? "bool" : Array.isArray(v) ? "multi" : "enum";
      const s = seen.get(key) ?? { kind, nums: [] as number[], counts: new Map<string, number>() };
      if (kind === "range") s.nums.push(v as number);
      else if (kind !== "bool") for (const x of Array.isArray(v) ? (v as unknown[]).map(String) : [String(v)]) s.counts.set(x, (s.counts.get(x) ?? 0) + 1);
      seen.set(key, s);
    }
  }
  const specs: FacetSpec[] = [];
  for (const [key, s] of seen) {
    const meta = LABELS[key] ?? { label: humanize(key) };
    if (s.kind === "range") {
      const min = Math.min(...s.nums);
      const max = Math.max(...s.nums);
      if (min === max) continue; // nothing to filter
      specs.push({ key, label: meta.label, unit: meta.unit, kind: "range", min, max });
    } else if (s.kind === "bool") {
      specs.push({ key, label: meta.label, kind: "bool" });
    } else {
      const options = [...s.counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      if (options.length < 2 && s.kind === "enum") continue;
      specs.push({ key, label: meta.label, kind: s.kind, options });
    }
  }
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
  return specs.sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

/** Whether one result passes every active filter. Results without the value fail an active filter. */
export function matches(c: ContentSummary, type: ContentType, state: FilterState): boolean {
  const values = facetValues(c, type);
  for (const [key, f] of Object.entries(state)) {
    if (!isActive(f)) continue;
    const v = values[key];
    if (f.bool !== undefined) {
      if (Boolean(v) !== f.bool) return false;
      continue;
    }
    if (f.min !== undefined || f.max !== undefined) {
      if (typeof v !== "number") return false;
      if (f.min !== undefined && v < f.min) return false;
      if (f.max !== undefined && v > f.max) return false;
    }
    if (f.values?.length) {
      const have = Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
      const ok = f.all ? f.values.every((x) => have.includes(x)) : f.values.some((x) => have.includes(x));
      if (!ok) return false;
    }
  }
  return true;
}

export const isActive = (f?: FacetFilter) =>
  !!f && (f.bool !== undefined || f.min !== undefined || f.max !== undefined || !!f.values?.length);

export const activeCount = (state: FilterState) => Object.values(state).filter(isActive).length;

/** Sort keys: name, level/CR, and every numeric facet present. */
export function sortOptions(specs: FacetSpec[], type: ContentType): { key: string; label: string }[] {
  const base: { key: string; label: string }[] = [{ key: "name", label: "Name" }];
  if (type === "spell") base.push({ key: "level", label: "Spell level" });
  return [...base, ...specs.filter((s) => s.kind === "range").map((s) => ({ key: s.key, label: s.label }))];
}

export function sortBy(items: ContentSummary[], type: ContentType, key: string, desc: boolean): ContentSummary[] {
  if (key === "default") return items;
  const val = (c: ContentSummary) => (key === "name" ? c.name : key === "level" ? c.level ?? 0 : (facetValues(c, type)[key] as number | undefined));
  const sorted = [...items].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    return typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number);
  });
  return desc ? sorted.reverse() : sorted;
}

/** Short text for an active filter chip, e.g. "AC ≥ 15", "School: Evocation, Abjuration". */
export function describeFilter(spec: FacetSpec, f: FacetFilter): string {
  if (f.bool !== undefined) return `${spec.label}: ${f.bool ? "yes" : "no"}`;
  if (f.min !== undefined || f.max !== undefined) {
    const u = spec.unit && spec.unit !== "d" ? ` ${spec.unit}` : "";
    if (f.min !== undefined && f.max !== undefined) return `${spec.label} ${f.min}–${f.max}${u}`;
    return f.min !== undefined ? `${spec.label} ≥ ${f.min}${u}` : `${spec.label} ≤ ${f.max}${u}`;
  }
  return `${spec.label}: ${f.values!.join(f.all ? " + " : ", ")}`;
}
