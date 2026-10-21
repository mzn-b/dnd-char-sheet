import { cachedFetch } from "./http.js";
import type { ContentDetail, ContentSummary } from "./types.js";

/**
 * Open5e supplements the SRD with community/OGL feats (the SRD itself only ships one feat).
 * Only feats are pulled from here; everything else comes from the SRD API or homebrew.
 */
const BASE = (process.env.OPEN5E_API_URL ?? "https://api.open5e.com") + "/v1";

async function allFeats(): Promise<any[]> {
  const { results } = await cachedFetch<{ results: any[] }>(`${BASE}/feats/?limit=500`);
  return results;
}

export async function listOpen5eFeats(): Promise<ContentSummary[]> {
  const feats = await allFeats().catch(() => []);
  return feats.map((f) => ({
    source: "open5e",
    key: f.slug,
    type: "feat",
    name: f.name,
    sourceLabel: f.document__title,
  }));
}

export async function getOpen5eFeat(key: string): Promise<ContentDetail | undefined> {
  const f = (await allFeats()).find((x) => x.slug === key);
  if (!f) return undefined;
  return {
    source: "open5e",
    key: f.slug,
    type: "feat",
    name: f.name,
    sourceLabel: f.document__title,
    prerequisite: f.prerequisite?.replace(/^Prerequisite:\s*/i, "") || undefined,
    description: [f.desc, ...(f.effects_desc ?? []).map((e: string) => `- ${e}`)].filter(Boolean).join("\n\n"),
    meta: {},
  };
}
