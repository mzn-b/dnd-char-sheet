import { pool } from "../../db.js";
import { cachedFetch } from "../http.js";

/**
 * 5etools has no API; its data ships as static JSON files. We load them from a mirror
 * (default: the community GitHub mirror) plus any 5etools-format homebrew files the user
 * enabled, and keep a merged in-memory dataset.
 */
export const DATA_URL =
  process.env.FIVETOOLS_DATA_URL ?? "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
export const BREW_URL =
  process.env.FIVETOOLS_BREW_URL ?? "https://raw.githubusercontent.com/TheGiddyLimit/homebrew/master";

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
}

let cache: { at: number; data: Promise<Dataset> } | null = null;
const TTL_MS = 60 * 60 * 1000;

export function getDataset(): Promise<Dataset> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const data = load();
    cache = { at: Date.now(), data };
    data.catch(() => (cache = null));
  }
  return cache.data;
}

export function invalidateDataset() {
  cache = null;
}

const get = <T = any>(path: string) => cachedFetch<T>(`${DATA_URL}/${path}`);

async function load(): Promise<Dataset> {
  const ds: Dataset = Object.assign(Object.fromEntries(ARRAYS.map((k) => [k, [] as any[]])), {
    spellClasses: {},
    sourceNames: {},
    brewSources: new Set<string>(),
  }) as Dataset;

  const [classIndex, spellIndex, books, spellSources, ...singles] = await Promise.all([
    get<Record<string, string>>("class/index.json"),
    get<Record<string, string>>("spells/index.json"),
    get<{ book: any[] }>("books.json"),
    get("spells/sources.json"),
    get("feats.json"),
    get("races.json"),
    get("backgrounds.json"),
    get("items.json"),
    get("items-base.json"),
    get("optionalfeatures.json"),
  ]);

  // Only 2014-era rules: drop the 2024 core books and everything published after them.
  const modern = new Set(books.book.filter((b) => b.published >= "2024-09-17").map((b) => b.id));
  for (const b of books.book) ds.sourceNames[b.id] = b.name;
  ds.spellClasses = spellSources;

  const files = await Promise.all([
    ...Object.values(classIndex).map((f) => get(`class/${f}`)),
    ...Object.values(spellIndex).map((f) => get(`spells/${f}`)),
  ]);
  for (const file of [...singles, ...files]) merge(ds, file, (e) => e.edition !== "one" && !modern.has(e.source) && !modern.has(e.classSource));

  for (const brew of await enabledBrews()) {
    try {
      const file = await cachedFetch<any>(brewFileUrl(brew.path));
      for (const s of file._meta?.sources ?? []) {
        ds.sourceNames[s.json] = s.full ?? s.json;
        ds.brewSources.add(s.json);
      }
      merge(ds, file, () => true);
    } catch (err) {
      console.warn(`Failed to load 5etools homebrew ${brew.path}:`, (err as Error).message);
    }
  }
  return ds;
}

function merge(ds: Dataset, file: any, keep: (e: any) => boolean) {
  for (const k of ARRAYS) if (Array.isArray(file?.[k])) ds[k as ArrayKey].push(...file[k].filter(keep));
}

export const brewFileUrl = (path: string) => `${BREW_URL}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function enabledBrews(): Promise<{ path: string }[]> {
  const { rows } = await pool.query<{ path: string }>("SELECT path FROM fivetools_brew WHERE enabled ORDER BY added_at");
  return rows;
}

/** Index of all homebrew files in the 5etools homebrew repository, grouped by folder (class, race, …). */
export async function brewCatalog(): Promise<{ path: string; folder: string; name: string }[]> {
  const index = await cachedFetch<Record<string, unknown>>(`${BREW_URL}/_generated/index-timestamps.json`);
  return Object.keys(index).map((path) => {
    const [folder, file] = path.split("/");
    return { path, folder, name: file.replace(/\.json$/, "") };
  });
}
