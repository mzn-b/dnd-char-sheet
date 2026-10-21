import { getOpen5e, listOpen5e } from "./open5e.js";
import { getHomebrew, listHomebrew } from "./homebrew.js";
import { getSrd, listSrd } from "./srd.js";
import { get5etools, list5etools } from "./fivetools/index.js";
import { getProviders } from "./settings.js";
import { HttpError } from "./http.js";
import type { ContentDetail, ContentSource, ContentSummary, ContentType } from "./types.js";

export interface SearchOptions {
  q?: string;
  /** Class to filter by: an SRD index ("wizard"), a 5etools key ("Wizard|PHB") or a plain name. */
  cls?: string;
  maxLevel?: number;
  level?: number;
}

/** Search every enabled content source and merge the results into one sorted list. */
export async function searchContent(type: ContentType, opts: SearchOptions): Promise<ContentSummary[]> {
  const providers = await getProviders();
  const className = opts.cls?.split("|")[0].toLowerCase();
  const sources = await Promise.allSettled([
    providers.srd ? listSrd(type, { cls: className }) : [],
    providers.open5e ? listOpen5e(type, { cls: className }) : [],
    providers["5etools"] ? list5etools(type, { cls: className }) : [],
    listHomebrew(type, { cls: className }),
  ]);
  for (const s of sources) if (s.status === "rejected") console.warn(`content source failed for ${type}:`, s.reason?.message);
  const q = opts.q?.trim().toLowerCase();
  const all = sources.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  // 5etools contains the full PHB text of everything in the SRD, so prefer it over the SRD copy.
  // (Other publishers' same-named variants, e.g. Level Up's Fireball, are kept and labelled.)
  const fromFivetools = new Set(all.filter((c) => c.source === "5etools").map((c) => `${c.type}:${c.name.toLowerCase()}`));
  return all
    .filter((c) => !(c.source === "srd" && fromFivetools.has(`${c.type}:${c.name.toLowerCase()}`)))
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .filter((c) => opts.level == null || c.level === opts.level)
    .filter((c) => opts.maxLevel == null || c.level == null || c.level <= opts.maxLevel)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
}

export async function getContent(type: ContentType, source: ContentSource, key: string): Promise<ContentDetail> {
  const detail =
    source === "srd" ? await getSrd(type, key)
    : source === "open5e" ? await getOpen5e(type, key)
    : source === "5etools" ? await get5etools(type, key)
    : await getHomebrew(key);
  if (!detail) throw new HttpError(404, `No ${type} '${key}' in ${source}`);
  return detail;
}

const SOURCE_PREFERENCE: ContentSource[] = ["5etools", "srd", "homebrew", "open5e"];

/** Find a spell by name across enabled sources (used for expanded-spell tables given as text). */
export async function resolveSpellByName(name: string) {
  const results = await searchContent("spell", { q: name });
  const exact = results.filter((r) => r.name.toLowerCase() === name.toLowerCase());
  exact.sort((a, b) => SOURCE_PREFERENCE.indexOf(a.source) - SOURCE_PREFERENCE.indexOf(b.source));
  const r = exact[0];
  return r ? { source: r.source, key: r.key, name: r.name } : undefined;
}
