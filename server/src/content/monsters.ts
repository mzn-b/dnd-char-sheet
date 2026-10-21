import { cachedFetch } from "./http.js";
import { excludedDocuments } from "./open5e.js";
import { DATA_URL, brewFileUrl, enabledBrews, getDataset } from "./fivetools/data.js";
import { renderEntries, renderTags } from "./fivetools/render.js";
import { ABILITIES, type Ability, type ContentDetail, type ContentSummary, type MonsterData, type MonsterEntry } from "./types.js";

/**
 * Monster stat blocks for Wild Shape, familiars, summons and companions. Each source is fetched
 * the first time monsters are needed and then served from the Postgres cache.
 */

const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));
const crValue = (s: string | number | undefined) => {
  if (typeof s === "number") return s;
  if (!s) return 0;
  const [a, b] = s.split("/").map(Number);
  return b ? a / b : a;
};
const movementOf = (speed: Record<string, number>) => Object.keys(speed).filter((k) => k !== "walk" && speed[k] > 0);
const feet = (v: unknown) => (typeof v === "number" ? v : parseInt(String(v ?? ""), 10) || 0);
const ABILITY_NAME: Record<Ability, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" };

function summaryOf(source: ContentSummary["source"], key: string, name: string, sourceLabel: string, m: Pick<MonsterData, "type" | "cr" | "speed">): ContentSummary {
  return { source, key, type: "monster", name, sourceLabel, level: crValue(m.cr), cr: m.cr, creatureType: m.type.toLowerCase().split(/[\s(]/)[0], movement: movementOf(m.speed) };
}

const detailOf = (s: ContentSummary, monster: MonsterData, description = ""): ContentDetail => ({
  ...s,
  description,
  meta: {
    "Challenge": monster.cr,
    "Type": `${monster.size} ${monster.type}`,
  },
  monster,
});

// ---------------------------------------------------------------------------
// 5etools bestiary

const SIZE: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
const ALIGN: Record<string, string> = { L: "lawful", N: "neutral", C: "chaotic", G: "good", E: "evil", U: "unaligned", A: "any alignment" };

let bestiary: { at: number; list: Promise<any[]> } | null = null;

/** Every 2014-era monster in the 5etools bestiary plus enabled homebrew, loaded on first use. */
async function loadBestiary(): Promise<any[]> {
  if (bestiary && Date.now() - bestiary.at < 24 * 60 * 60 * 1000) return bestiary.list;
  const list = (async () => {
    const ds = await getDataset();
    const index = await cachedFetch<Record<string, string>>(`${DATA_URL}/bestiary/index.json`);
    const modern = ds.modernSources;
    const files = await Promise.all(
      Object.entries(index)
        .filter(([src]) => !modern.has(src))
        .map(([, f]) => cachedFetch<{ monster?: any[] }>(`${DATA_URL}/bestiary/${f}`).catch(() => ({ monster: [] }))),
    );
    const brews = await Promise.all((await enabledBrews()).map((b) => cachedFetch<any>(brewFileUrl(b.path)).catch(() => ({}))));
    const all = [...files, ...brews].flatMap((f) => f.monster ?? []).filter((m: any) => m.edition !== "one" && !modern.has(m.source));
    // "_copy" entries are variants of another monster: start from the original.
    const byKey = new Map(all.map((m: any) => [`${m.name}|${m.source}`.toLowerCase(), m]));
    return all
      .map((m: any) => {
        if (!m._copy) return m;
        const base = byKey.get(`${m._copy.name}|${m._copy.source}`.toLowerCase());
        return base && !base._copy ? { ...base, ...m, _copy: undefined } : null;
      })
      .filter((m: any) => m && m.cr != null && m.str != null);
  })();
  bestiary = { at: Date.now(), list };
  list.catch(() => (bestiary = null));
  return list;
}

function fivetoolsMonster(m: any): MonsterData {
  const type = typeof m.type === "string" ? m.type : `${m.type?.type?.choose?.join(" or ") ?? m.type?.type ?? ""}${m.type?.tags?.length ? ` (${m.type.tags.map((t: any) => t.tag ?? t).join(", ")})` : ""}`;
  const ac0 = m.ac?.[0];
  const speed: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.speed ?? {})) if (k !== "canHover") speed[k] = feet((v as any)?.number ?? v);
  const list = (x: any[] | undefined) =>
    (x ?? []).map((e: any) => (typeof e === "string" ? e : e.special ?? `${(e.resist ?? e.immune ?? e.vulnerable ?? e.conditionImmune ?? []).join(", ")} ${e.note ?? ""}`.trim())).join("; ");
  const entries = (x: any[] | undefined): MonsterEntry[] => (x ?? []).map((e: any) => ({ name: renderTags(e.name ?? ""), text: renderEntries(e.entries ?? e.entry) }));
  const num = (o: Record<string, string> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, parseInt(v, 10)]));
  return {
    size: (m.size ?? []).map((s: string) => SIZE[s] ?? s).join(" or "),
    type,
    alignment: (m.alignment ?? []).map((a: any) => (typeof a === "string" ? ALIGN[a] ?? a : a.special ?? "")).join(" ") || "unaligned",
    ac: typeof ac0 === "number" ? ac0 : ac0?.ac ?? 10,
    acNote: typeof ac0 === "object" ? renderTags((ac0.from ?? []).join(", ")) || undefined : undefined,
    hp: m.hp?.average ?? 0,
    hpFormula: m.hp?.formula ?? m.hp?.special,
    speed,
    speedNote: m.speed?.canHover ? "hover" : undefined,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, m[a] ?? 10])) as Record<Ability, number>,
    saves: num(m.save) as Partial<Record<Ability, number>>,
    skills: num(m.skill),
    senses: [...(m.senses ?? []).map((s: string) => renderTags(s)), `passive Perception ${m.passive ?? 10}`].join(", "),
    languages: (m.languages ?? []).map((l: string) => renderTags(l)).join(", ") || "—",
    cr: typeof m.cr === "string" ? m.cr : m.cr?.cr ?? "0",
    vulnerabilities: list(m.vulnerable) || undefined,
    resistances: list(m.resist) || undefined,
    immunities: list(m.immune) || undefined,
    conditionImmunities: list(m.conditionImmune) || undefined,
    traits: [...entries(m.trait), ...(m.spellcasting ?? []).map((s: any) => ({ name: s.name, text: renderEntries([...(s.headerEntries ?? []), ...spellcastingLines(s)]) }))],
    actions: entries(m.action),
    bonusActions: entries(m.bonus),
    reactions: entries(m.reaction),
    legendary: entries(m.legendary),
  };
}

function spellcastingLines(s: any): string[] {
  const out: string[] = [];
  if (s.will) out.push(`At will: ${s.will.join(", ")}`);
  for (const [n, spells] of Object.entries(s.daily ?? {})) out.push(`${n.replace("e", "")}/day${n.endsWith("e") ? " each" : ""}: ${(spells as string[]).join(", ")}`);
  for (const [lvl, v] of Object.entries(s.spells ?? {}) as [string, any][])
    out.push(`${lvl === "0" ? "Cantrips (at will)" : `Level ${lvl}${v.slots ? ` (${v.slots} slots)` : ""}`}: ${(v.spells ?? []).join(", ")}`);
  return out.map((l) => renderTags(l));
}

export async function list5etoolsMonsters(): Promise<ContentSummary[]> {
  const ds = await getDataset();
  return (await loadBestiary()).map((m) => {
    const data = { type: typeof m.type === "string" ? m.type : m.type?.type?.choose?.[0] ?? m.type?.type ?? "", cr: typeof m.cr === "string" ? m.cr : m.cr?.cr ?? "0", speed: {} as Record<string, number> };
    for (const [k, v] of Object.entries(m.speed ?? {})) if (k !== "canHover") data.speed[k] = feet((v as any)?.number ?? v);
    return summaryOf("5etools", `${m.name}|${m.source}`, m.name, ds.sourceNames[m.source] ?? m.source, data);
  });
}

export async function get5etoolsMonster(key: string): Promise<ContentDetail | undefined> {
  const [name, source] = key.split("|");
  const m = (await loadBestiary()).find((x) => x.name === name && x.source === source);
  if (!m) return undefined;
  const ds = await getDataset();
  const data = fivetoolsMonster(m);
  return detailOf(summaryOf("5etools", key, m.name, ds.sourceNames[m.source] ?? m.source, data), data);
}

// ---------------------------------------------------------------------------
// SRD API (dnd5eapi.co)

const SRD = process.env.SRD_API_URL ?? "https://www.dnd5eapi.co";

export async function listSrdMonsters(): Promise<ContentSummary[]> {
  const q = { query: "{ monsters(limit: 1000) { index name challenge_rating type speed { walk fly swim climb burrow } } }" };
  const { data } = await cachedFetch<{ data: { monsters: any[] } }>(`${SRD}/graphql/2014`, q);
  return data.monsters.map((m) => {
    const speed: Record<string, number> = {};
    for (const [k, v] of Object.entries(m.speed ?? {})) if (v) speed[k] = feet(v);
    return summaryOf("srd", m.index, m.name, "SRD 5.1", { type: m.type, cr: crText(m.challenge_rating), speed });
  });
}

export async function getSrdMonster(index: string): Promise<ContentDetail> {
  const m = await cachedFetch<any>(`${SRD}/api/2014/monsters/${index}`);
  const speed: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.speed ?? {})) if (k !== "hover") speed[k] = feet(v);
  const prof = (prefix: string) =>
    Object.fromEntries((m.proficiencies ?? []).filter((p: any) => p.proficiency.index.startsWith(prefix)).map((p: any) => [p.proficiency.index.slice(prefix.length), p.value]));
  const entries = (x: any[] | undefined): MonsterEntry[] => (x ?? []).map((e) => ({ name: e.name, text: e.desc ?? "" }));
  const senses = Object.entries(m.senses ?? {}).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
  const data: MonsterData = {
    size: m.size,
    type: `${m.type}${m.subtype ? ` (${m.subtype})` : ""}`,
    alignment: m.alignment,
    ac: m.armor_class?.[0]?.value ?? 10,
    acNote: m.armor_class?.[0]?.type !== "dex" ? m.armor_class?.[0]?.armor?.map((a: any) => a.name).join(", ") || m.armor_class?.[0]?.type : undefined,
    hp: m.hit_points,
    hpFormula: m.hit_points_roll ?? m.hit_dice,
    speed,
    speedNote: m.speed?.hover ? "hover" : undefined,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, m[ABILITY_NAME[a]]])) as Record<Ability, number>,
    saves: prof("saving-throw-") as Partial<Record<Ability, number>>,
    skills: prof("skill-"),
    senses,
    languages: m.languages || "—",
    cr: crText(m.challenge_rating),
    vulnerabilities: m.damage_vulnerabilities?.join(", ") || undefined,
    resistances: m.damage_resistances?.join(", ") || undefined,
    immunities: m.damage_immunities?.join(", ") || undefined,
    conditionImmunities: m.condition_immunities?.map((c: any) => c.name).join(", ") || undefined,
    traits: entries(m.special_abilities),
    actions: entries(m.actions),
    bonusActions: [],
    reactions: entries(m.reactions),
    legendary: entries(m.legendary_actions),
  };
  return detailOf(summaryOf("srd", index, m.name, "SRD 5.1", data), data);
}

// ---------------------------------------------------------------------------
// Open5e (Tome of Beasts, Creature Codex, Level Up monsters…)

const OPEN5E = (process.env.OPEN5E_API_URL ?? "https://api.open5e.com") + "/v1";
const open5eAll = () => cachedFetch<{ results: any[] }>(`${OPEN5E}/monsters/?limit=5000`).then((r) => r.results);

function open5eMonster(m: any): MonsterData {
  const speed: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.speed ?? {})) if (typeof v === "number") speed[k] = v;
  const md = (t: string) => t.replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,:;)]|$)/g, "$1*$2*").replace(/\*\*\*(.+?)\*\*\*/g, "**$1**");
  const entries = (x: any[] | null | undefined): MonsterEntry[] => (x ?? []).map((e) => ({ name: e.name, text: md(e.desc ?? "") }));
  return {
    size: m.size,
    type: `${m.type}${m.subtype ? ` (${m.subtype})` : ""}`.toLowerCase(),
    alignment: m.alignment,
    ac: m.armor_class,
    acNote: m.armor_desc || undefined,
    hp: m.hit_points,
    hpFormula: m.hit_dice,
    speed,
    speedNote: m.speed?.hover ? "hover" : undefined,
    abilities: Object.fromEntries(ABILITIES.map((a) => [a, m[ABILITY_NAME[a]]])) as Record<Ability, number>,
    // Some books list every save; keep only proficient ones (different from the plain modifier).
    saves: Object.fromEntries(
      ABILITIES.flatMap((a) => {
        const v = m[`${ABILITY_NAME[a]}_save`];
        return v != null && v !== Math.floor((m[ABILITY_NAME[a]] - 10) / 2) ? [[a, v]] : [];
      }),
    ),
    skills: m.skills ?? {},
    senses: m.senses ?? "",
    languages: m.languages || "—",
    cr: m.challenge_rating,
    vulnerabilities: m.damage_vulnerabilities || undefined,
    resistances: m.damage_resistances || undefined,
    immunities: m.damage_immunities || undefined,
    conditionImmunities: m.condition_immunities || undefined,
    traits: entries(m.special_abilities),
    actions: entries(m.actions),
    bonusActions: entries(m.bonus_actions),
    reactions: entries(m.reactions),
    legendary: m.legendary_actions?.length ? [...(m.legendary_desc ? [{ name: "", text: m.legendary_desc }] : []), ...entries(m.legendary_actions)] : [],
  };
}

export async function listOpen5eMonsters(): Promise<ContentSummary[]> {
  const excluded = new Set(await excludedDocuments());
  return (await open5eAll())
    .filter((m) => !excluded.has(m.document__slug))
    .map((m) => {
      const speed: Record<string, number> = {};
      for (const [k, v] of Object.entries(m.speed ?? {})) if (typeof v === "number") speed[k] = v;
      return summaryOf("open5e", m.slug, m.name, m.document__title, { type: m.type, cr: m.challenge_rating, speed });
    });
}

export async function getOpen5eMonster(slug: string): Promise<ContentDetail | undefined> {
  const m = (await open5eAll()).find((x) => x.slug === slug);
  if (!m) return undefined;
  const data = open5eMonster(m);
  return detailOf(summaryOf("open5e", slug, m.name, m.document__title, data), data, m.desc ?? "");
}
