import { getOpen5e, listOpen5e } from "./open5e.js";
import { getHomebrew, listHomebrew } from "./homebrew.js";
import { getSrd, listSrd } from "./srd.js";
import { get5etools, list5etools } from "./fivetools/index.js";
import { getProviders } from "./settings.js";
import { get5etoolsMonster, getOpen5eMonster, getSrdMonster, list5etoolsMonsters, listOpen5eMonsters, listSrdMonsters } from "./monsters.js";
import { HttpError, within } from "./http.js";
import { datasetState } from "./fivetools/data.js";
import type { ContentDetail, ContentSource, ContentSummary, ContentType } from "./types.js";

export interface SearchOptions {
  q?: string;
  /** Class to filter by: an SRD index ("wizard"), a 5etools key ("Wizard|PHB") or a plain name. */
  cls?: string;
  maxLevel?: number;
  level?: number;
}

/** How long a search waits for one provider before answering without it (it keeps loading in the background). */
const PROVIDER_WAIT_MS = Number(process.env.PROVIDER_WAIT_MS ?? 20_000);

/** Search every enabled content source and merge the results into one sorted list. */
export async function searchContent(type: ContentType, opts: SearchOptions): Promise<ContentSummary[]> {
  return (await searchWithWarnings(type, opts)).results;
}

/**
 * Like searchContent, but also says which providers failed or are still loading, so the UI can
 * show what's missing instead of spinning. A slow provider never blocks the others.
 */
export async function searchWithWarnings(type: ContentType, opts: SearchOptions): Promise<{ results: ContentSummary[]; warnings: string[] }> {
  const providers = await getProviders();
  const className = opts.cls?.split("|")[0].toLowerCase();
  const monster = type === "monster";
  const warnings: string[] = [];
  const run = async (name: string, enabled: boolean, fn: () => Promise<ContentSummary[]>): Promise<ContentSummary[]> => {
    if (!enabled) return [];
    try {
      const r = await within(fn(), PROVIDER_WAIT_MS);
      if (r.timedOut) {
        warnings.push(
          name === "5etools" && datasetState().loading
            ? "5etools is still downloading its data (the first load can take a minute or two). Results from it will appear when you search again."
            : `${name} didn't answer within ${PROVIDER_WAIT_MS / 1000}s; showing the other sources.`,
        );
        return [];
      }
      return r.value ?? [];
    } catch (err) {
      console.warn(`content source ${name} failed for ${type}:`, (err as Error).message);
      warnings.push(`${name} couldn't be loaded: ${(err as Error).message}`);
      return [];
    }
  };
  const lists = await Promise.all([
    run("SRD", providers.srd, () => (monster ? listSrdMonsters() : listSrd(type, { cls: className }))),
    run("Open5e", providers.open5e, () => (monster ? listOpen5eMonsters() : listOpen5e(type, { cls: className }))),
    run("5etools", providers["5etools"], () => (monster ? list5etoolsMonsters() : list5etools(type, { cls: className }))),
    run("Homebrew", true, () => listHomebrew(type, { cls: className })),
  ]);
  const q = opts.q?.trim().toLowerCase();
  const all = lists.flat();
  // 5etools contains the full PHB text of everything in the SRD, so prefer it over the SRD copy.
  // (Other publishers' same-named variants, e.g. Level Up's Fireball, are kept and labelled.)
  const fromFivetools = new Set(all.filter((c) => c.source === "5etools").map((c) => `${c.type}:${c.name.toLowerCase()}`));
  const results = all
    .filter((c) => !(c.source === "srd" && fromFivetools.has(`${c.type}:${c.name.toLowerCase()}`)))
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .filter((c) => opts.level == null || c.level === opts.level)
    .filter((c) => opts.maxLevel == null || c.level == null || c.level <= opts.maxLevel)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  return { results, warnings };
}

export async function getContent(type: ContentType, source: ContentSource, key: string): Promise<ContentDetail> {
  const detail = type === "monster" && source !== "homebrew"
    ? source === "srd" ? await getSrdMonster(key) : source === "open5e" ? await getOpen5eMonster(key) : await get5etoolsMonster(key)
    :
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
