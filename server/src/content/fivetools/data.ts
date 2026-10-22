import { pool } from "../../db.js";
import { cachedFetch } from "../http.js";
import { resolveCopies } from "./copy.js";

/**
 * 5etools has no API; its data ships as static JSON files. We load them from a mirror
 * (default: the community GitHub mirror) plus any 5etools-format homebrew files the user
 * enabled, and keep a merged in-memory dataset.
 */
export const DATA_URL =
  process.env.FIVETOOLS_DATA_URL ?? "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
export const BREW_URL =
  process.env.FIVETOOLS_BREW_URL ?? "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master";
/** Unearthed Arcana playtest content, kept by 5etools in its own repository (same format as homebrew). */
export const UA_URL =
  process.env.FIVETOOLS_UA_URL ?? "https://raw.githubusercontent.com/TheGiddyLimit/unearthed-arcana/master";

/** Library paths are "folder/File.json" (homebrew) or "ua:folder/File.json" (Unearthed Arcana). */
const libraryOf = (path: string) => (path.startsWith("ua:") ? { base: UA_URL, path: path.slice(3) } : { base: BREW_URL, path });

const ARRAYS = [
  "spell", "feat", "race", "subrace", "background", "item", "baseitem",
  "class", "subclass", "classFeature", "subclassFeature", "optionalfeature",
] as const;
type ArrayKey = (typeof ARRAYS)[number];

export interface Dataset {
  [k: string]: any;
  spell: any[]; feat: any[]; race: any[]; subrace: any[]; background: any[]; item: any[]; baseitem: any[];
  class: any[]; subclass: any[]; classFeature: any[]; subclassFeature: any[]; optionalfeature: any[];
  /** spell source → spell name → { class: [{name, source}], classVariant: [...] } */
  spellClasses: Record<string, Record<string, any>>;
  /** source code → full book / brew name */
  sourceNames: Record<string, string>;
  /** sources that came from homebrew files */
  brewSources: Set<string>;
  /** 2024-rules books (excluded) */
  modernSources: Set<string>;
  /** Files that couldn't be fetched (the rest still loads). */
  failures: string[];
}

let cache: { at: number; data: Promise<Dataset> } | null = null;
/** The last dataset that finished loading, served while a refresh runs. */
let ready: Dataset | null = null;
let lastError: string | null = null;
let failedAt = 0;
const TTL_MS = 60 * 60 * 1000;
/** After a failed first load, wait this long before trying again (searches answer at once meanwhile). */
const RETRY_MS = 60 * 1000;

export function getDataset(): Promise<Dataset> {
  if (!ready && !cache && lastError && Date.now() - failedAt < RETRY_MS) return Promise.reject(new Error(lastError));
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const started = Date.now();
    const data = load();
    cache = { at: started, data };
    data.then(
      (ds) => {
        ready = ds;
        lastError = null;
        console.log(`5etools data loaded in ${((Date.now() - started) / 1000).toFixed(1)}s${ds.failures.length ? ` (${ds.failures.length} files failed)` : ""}`);
      },
      (err) => {
        lastError = (err as Error).message;
        failedAt = Date.now();
        console.warn("5etools data failed to load:", lastError);
        // Keep serving the previous copy and retry in five minutes; with nothing loaded yet, retry on the next request.
        cache = ready ? { at: Date.now() - TTL_MS + 5 * 60_000, data: Promise.resolve(ready) } : null;
      },
    );
    // Stale-while-revalidate: keep answering from the previous copy during an hourly refresh.
    if (ready) return Promise.resolve(ready);
  }
  return ready && cache ? Promise.resolve(ready) : cache!.data;
}

/** Whether the dataset is loaded, still downloading, or failed (for status displays and search warnings). */
export const datasetState = () => ({ loaded: !!ready, loading: !!cache && !ready, error: lastError, failures: ready?.failures ?? [] });

/** Names of the books dropped by the 2014-rules filter (2024 PHB and everything after it). */
export async function modernBookNames(): Promise<string[]> {
  const books = await cachedFetch<{ book: any[] }>(`${DATA_URL}/books.json`);
  return books.book.filter((b) => b.published >= "2024-09-17").map((b) => b.name);
}

export function invalidateDataset() {
  cache = null;
  ready = null;
  lastError = null;
}

const EXTRA_SOURCE_NAMES: Record<string, string> = {
  PSA: "Plane Shift: Amonkhet", PSD: "Plane Shift: Dominaria", PSI: "Plane Shift: Innistrad", PSK: "Plane Shift: Kaladesh",
  PSX: "Plane Shift: Ixalan", PSZ: "Plane Shift: Zendikar", TftYP: "Tales from the Yawning Portal",
  RoTOS: "The Rise of Tiamat Online Supplement", EET: "Elemental Evil: Trinkets", EEPC: "Elemental Evil Player's Companion",
  MCV2DC: "Monstrous Compendium Vol. 2: Dragonlance Creatures", UATheMysticClass: "Unearthed Arcana: The Mystic Class",
  AWM: "Adventure with Muk", OGA: "One Grung Above", LR: "Locathah Rising", TTP: "The Tortle Package",
  MCV3MC: "Monstrous Compendium Vol. 3: Minecraft Creatures", MFF: "Mordenkainen's Fiendish Folio Vol. 1",
  MisMV1: "Misplaced Monsters: Volume One", SADS: "Sapphire Anniversary Dice Set", VD: "Vecna Dossier",
};

const get = <T = any>(path: string) => cachedFetch<T>(`${DATA_URL}/${path}`);

async function load(): Promise<Dataset> {
  const ds: Dataset = Object.assign(Object.fromEntries(ARRAYS.map((k) => [k, [] as any[]])), {
    spellClasses: {},
    sourceNames: {},
    brewSources: new Set<string>(),
    modernSources: new Set<string>(),
    failures: [] as string[],
  }) as unknown as Dataset;
  // One unreachable file shouldn't lose everything else: note it and carry on.
  const optional = <T>(path: string, fallback: T) =>
    get<T>(path).catch((err) => {
      ds.failures.push(`${path}: ${(err as Error).message}`);
      return fallback;
    });

  const [classIndex, spellIndex, books, adventures, spellSources, ...singles] = await Promise.all([
    get<Record<string, string>>("class/index.json"),
    get<Record<string, string>>("spells/index.json"),
    get<{ book: any[] }>("books.json"),
    optional<{ adventure: any[] }>("adventures.json", { adventure: [] }),
    optional("spells/sources.json", {}),
    optional("feats.json", {}),
    optional("races.json", {}),
    optional("backgrounds.json", {}),
    optional("items.json", {}),
    optional("items-base.json", {}),
    optional("optionalfeatures.json", {}),
  ]);

  // Only 2014-era rules: drop the 2024 core books and everything published after them.
  const modern = new Set(books.book.filter((b) => b.published >= "2024-09-17").map((b) => b.id));
  ds.modernSources = modern;
  for (const b of books.book) ds.sourceNames[b.id] = b.name;
  // Adventures and supplements (Curse of Strahd, Plane Shift…) so sources show names, not codes.
  for (const a of adventures.adventure) ds.sourceNames[a.id] ??= a.name;
  // Supplements that appear in neither index.
  for (const [id, name] of Object.entries(EXTRA_SOURCE_NAMES)) ds.sourceNames[id] ??= name;
  ds.spellClasses = spellSources;

  const files = await Promise.all([
    ...Object.values(classIndex).map((f) => optional(`class/${f}`, {})),
    ...Object.values(spellIndex).map((f) => optional(`spells/${f}`, {})),
  ]);
  for (const file of [...singles, ...files]) merge(ds, file, (e) => e.edition !== "one" && !modern.has(e.source) && !modern.has(e.classSource));

  resolveAllCopies(ds);

  // "+1 Longsword", "+2 Chain Mail"…: 5etools stores these as templates applied to base items.
  const variants = await optional<{ magicvariant: any[] }>("magicvariants.json", { magicvariant: [] });
  ds.item.push(...expandBonusVariants(variants.magicvariant, ds.baseitem, modern));

  for (const brew of await enabledBrews()) {
    try {
      const file = await cachedFetch<any>(brewFileUrl(brew.path));
      for (const s of file._meta?.sources ?? []) {
        ds.sourceNames[s.json] = s.full ?? s.json;
        ds.brewSources.add(s.json);
      }
      merge(ds, file, () => true);
      resolveAllCopies(ds);
    } catch (err) {
      console.warn(`Failed to load 5etools homebrew ${brew.path}:`, (err as Error).message);
    }
  }
  return ds;
}

/** Variants defined as copies of another entry (Variant Noble (Knight), Centaur (MOT)…) become full entries. */
function resolveAllCopies(ds: Dataset) {
  const named = (e: any) => `${e.name}|${e.source}`.toLowerCase();
  for (const k of ["race", "background", "feat", "optionalfeature"] as const) ds[k] = resolveCopies(ds[k], named) as any[];
  ds.subrace = resolveCopies(
    ds.subrace,
    (e) => `${e.name}|${e.source}|${e.raceName}|${e.raceSource}`.toLowerCase(),
    (c) => `${c.name}|${c.source}|${c.raceName}|${c.raceSource}`.toLowerCase(),
  ) as any[];
}

function merge(ds: Dataset, file: any, keep: (e: any) => boolean) {
  for (const k of ARRAYS) if (Array.isArray(file?.[k])) ds[k as ArrayKey].push(...file[k].filter(keep));
}

export const brewFileUrl = (path: string) => {
  const lib = libraryOf(path);
  return `${lib.base}/${lib.path.split("/").map(encodeURIComponent).join("/")}`;
};

export async function enabledBrews(): Promise<{ path: string }[]> {
  const { rows } = await pool.query<{ path: string }>("SELECT path FROM fivetools_brew WHERE enabled ORDER BY added_at");
  return rows;
}

/** Index of all files in the 5etools homebrew and Unearthed Arcana repositories, by folder (class, race, …). */
export async function brewCatalog(): Promise<{ path: string; folder: string; name: string; library: "homebrew" | "ua" }[]> {
  const [brew, ua] = await Promise.all([
    cachedFetch<Record<string, unknown>>(`${BREW_URL}/_generated/index-timestamps.json`),
    cachedFetch<Record<string, unknown>>(`${UA_URL}/_generated/index-timestamps.json`).catch(() => ({})),
  ]);
  const entries = (index: Record<string, unknown>, library: "homebrew" | "ua") =>
    Object.keys(index).map((path) => {
      const [folder, file] = path.split("/");
      return { path: library === "ua" ? `ua:${path}` : path, folder, name: file.replace(/\.json$/, ""), library };
    });
  return [...entries(ua, "ua"), ...entries(brew, "homebrew")];
}

/**
 * Build the numeric-bonus magic variants (+1/+2/+3 weapons, armor, shields, ammunition) for every
 * 2014 base item they apply to. Other templates (Flame Tongue, Vicious…) stay out to keep lists usable.
 */
function expandBonusVariants(variants: any[], bases: any[], modern: Set<string>): any[] {
  const baseType = (t?: string) => (t ?? "").split("|")[0];
  const matches = (base: any, cond: Record<string, unknown>) =>
    Object.entries(cond).every(([k, v]) => (k === "type" ? baseType(base.type) === baseType(String(v)) : base[k] === v));
  const out: any[] = [];
  for (const v of variants) {
    const inh = v.inherits ?? {};
    if (v.edition === "one" || modern.has(inh.source) || !/^\+\d /.test(inh.namePrefix ?? "")) continue;
    if (!inh.bonusWeapon && !inh.bonusAc) continue;
    for (const base of bases) {
      if (!(v.requires ?? []).some((r: any) => matches(base, r))) continue;
      if (v.excludes && Object.entries(v.excludes).some(([k, val]) => base[k] === val || (k === "name" && base.name === val))) continue;
      const fill = (s: string) => s.replace(/\{=bonusWeapon\}/g, inh.bonusWeapon ?? "").replace(/\{=bonusAc\}/g, inh.bonusAc ?? "");
      out.push({
        ...base,
        ...inh,
        name: `${inh.namePrefix}${base.name}${inh.nameSuffix ?? ""}`,
        source: inh.source ?? "DMG",
        baseItem: `${base.name}|${base.source}`,
        entries: [...(inh.entries ?? []).map((e: unknown) => (typeof e === "string" ? fill(e) : e))],
      });
    }
  }
  return out;
}
