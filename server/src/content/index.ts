import { getOpen5eFeat, listOpen5eFeats } from "./open5e.js";
import { getHomebrew, listHomebrew } from "./homebrew.js";
import { getSrd, listSrd } from "./srd.js";
import { HttpError } from "./http.js";
import type { ContentDetail, ContentSource, ContentSummary, ContentType } from "./types.js";

export interface SearchOptions {
  q?: string;
  cls?: string;
  maxLevel?: number;
  level?: number;
}

/** Search every content source and merge the results into one sorted list. */
export async function searchContent(type: ContentType, opts: SearchOptions): Promise<ContentSummary[]> {
  const sources = await Promise.allSettled([
    listSrd(type, opts),
    type === "feat" ? listOpen5eFeats() : Promise.resolve([]),
    listHomebrew(type, opts),
  ]);
  const q = opts.q?.trim().toLowerCase();
  return sources
    .flatMap((s) => (s.status === "fulfilled" ? s.value : []))
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .filter((c) => opts.level == null || c.level === opts.level)
    .filter((c) => opts.maxLevel == null || c.level == null || c.level <= opts.maxLevel)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
}

export async function getContent(type: ContentType, source: ContentSource, key: string): Promise<ContentDetail> {
  const detail =
    source === "srd" ? await getSrd(type, key)
    : source === "open5e" ? await getOpen5eFeat(key)
    : await getHomebrew(key);
  if (!detail) throw new HttpError(404, `No ${type} '${key}' in ${source}`);
  return detail;
}
