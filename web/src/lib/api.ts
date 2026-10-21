import type {
  Character, CharacterSummary, ClassRules, ContentDetail, ContentSource, ContentSummary, ContentType, LevelRules,
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
  detail: (type: ContentType, source: ContentSource, key: string) =>
    request<ContentDetail>(`/content/${type}/${source}/${encodeURIComponent(key)}`),
  classRules: (source: ContentSource, key: string) => request<ClassRules>(`/rules/classes/${source}/${key}`),
  subclassLevels: (source: ContentSource, key: string) =>
    request<Pick<LevelRules, "level" | "features">[]>(`/rules/subclasses/${source}/${key}/levels`),

  listHomebrew: (type?: ContentType) => request<ContentDetail[]>(`/homebrew${qs({ type })}`),
  saveHomebrew: (entry: Partial<ContentDetail>) =>
    entry.key
      ? request<ContentDetail>(`/homebrew/${entry.key}`, { method: "PUT", body: JSON.stringify(entry) })
      : request<ContentDetail>("/homebrew", { method: "POST", body: JSON.stringify(entry) }),
  deleteHomebrew: (key: string) => request<void>(`/homebrew/${key}`, { method: "DELETE" }),
};
