import type {
  Character, CharacterSummary, ClassRules, ContentDetail, ContentSource, ContentSummary, ContentType, SubclassRules,
} from "./types";
import { normalizeCharacter } from "./defaults";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const qs = (params: Record<string, string | number | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length ? "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])) : "";
};

export const api = {
  listCharacters: () => request<CharacterSummary[]>("/characters"),
  getCharacter: async (id: string) => normalizeCharacter(await request<Character>(`/characters/${id}`)),
  createCharacter: (c: Character) => request<Character>("/characters", { method: "POST", body: JSON.stringify(c) }),
  saveCharacter: (c: Character) =>
    request<Character>(`/characters/${c.id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCharacter: (id: string) => request<void>(`/characters/${id}`, { method: "DELETE" }),

  search: (type: ContentType, params: { q?: string; class?: string; level?: number; maxLevel?: number } = {}) =>
    request<ContentSummary[]>(`/content/${type}${qs(params)}`),
  /** Search plus warnings about providers that failed or are still loading. */
  searchFull: async (type: ContentType, params: { q?: string; class?: string; level?: number; maxLevel?: number } = {}) => {
    const res = await fetch(`/api/content/${type}${qs(params)}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
    const header = res.headers.get("X-Content-Warnings");
    let warnings: string[] = [];
    try {
      warnings = header ? JSON.parse(decodeURIComponent(header)) : [];
    } catch {
      /* ignore a malformed header */
    }
    return { results: (await res.json()) as ContentSummary[], warnings };
  },
  detail: (type: ContentType, source: ContentSource, key: string) =>
    request<ContentDetail>(`/content/${type}/${source}/${encodeURIComponent(key)}`),
  classRules: (source: ContentSource, key: string) =>
    request<ClassRules>(`/rules/classes/${source}/${encodeURIComponent(key)}`),
  subclassRules: (source: ContentSource, key: string) =>
    request<SubclassRules>(`/rules/subclasses/${source}/${encodeURIComponent(key)}/levels`),

  providers: () => request<Providers>("/sources/providers"),
  setProviders: (p: Partial<Providers>) => request<Providers>("/sources/providers", { method: "PUT", body: JSON.stringify(p) }),
  fivetoolsStatus: () => request<FivetoolsStatus>("/sources/5etools/status"),
  books: () =>
    request<{
      books: BookInfo[];
      warnings: string[];
      fivetools: { enabled: boolean; loaded: boolean; loading: boolean; error: string | null; failures: string[] };
    }>("/sources/books"),
  retryFivetools: () => request<FivetoolsStatus>("/sources/5etools/status?retry=1"),
  brewCatalog: (q: string, folder?: string, library?: string) => request<BrewFile[]>(`/sources/5etools/brew/catalog${qs({ q, folder, library })}`),
  open5eDocuments: () => request<{ slug: string; title: string; organization: string; enabled: boolean }[]>("/sources/open5e/documents"),
  setOpen5eExcluded: (excluded: string[]) => request<void>("/sources/open5e/documents", { method: "PUT", body: JSON.stringify({ excluded }) }),
  corrections: () => request<Corrections>("/sources/corrections"),
  saveCorrections: (c: Corrections) => request<Corrections>("/sources/corrections", { method: "PUT", body: JSON.stringify(c) }),
  brews: () => request<{ path: string; enabled: boolean }[]>("/sources/5etools/brew"),
  addBrew: (path: string) => request<void>("/sources/5etools/brew", { method: "POST", body: JSON.stringify({ path }) }),
  removeBrew: (path: string) => request<void>(`/sources/5etools/brew${qs({ path })}`, { method: "DELETE" }),

  listHomebrew: (type?: ContentType) => request<ContentDetail[]>(`/homebrew${qs({ type })}`),
  saveHomebrew: (entry: Partial<ContentDetail>) =>
    entry.key
      ? request<ContentDetail>(`/homebrew/${entry.key}`, { method: "PUT", body: JSON.stringify(entry) })
      : request<ContentDetail>("/homebrew", { method: "POST", body: JSON.stringify(entry) }),
  deleteHomebrew: (key: string) => request<void>(`/homebrew/${key}`, { method: "DELETE" }),
};

export interface Providers {
  srd: boolean;
  open5e: boolean;
  "5etools": boolean;
  fivetoolsDataUrl?: string;
}

export interface BrewFile {
  path: string;
  folder: string;
  name: string;
  library: "homebrew" | "ua";
}

/** Rolls and reminders marked as incorrect (hidden everywhere). */
export interface Corrections {
  hiddenRolls: string[];
  hiddenReminders: string[];
}

export interface FivetoolsStatus {
  loading: boolean;
  error?: string | null;
  spells?: number;
  feats?: number;
  classes?: number;
  subclasses?: number;
  races?: number;
  items?: number;
  brewSources?: string[];
  failures?: string[];
}

export interface BookInfo {
  label: string;
  provider: "srd" | "open5e" | "5etools" | "homebrew";
  counts: Record<string, number>;
}
