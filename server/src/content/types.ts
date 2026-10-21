export const CONTENT_TYPES = [
  "spell",
  "feat",
  "item",
  "race",
  "background",
  "feature",
  "subclass",
  "class",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentSource = "srd" | "open5e" | "homebrew";

/** Lightweight entry used in search results / pickers. */
export interface ContentSummary {
  source: ContentSource;
  key: string;
  type: ContentType;
  name: string;
  /** Spell level (0 = cantrip). */
  level?: number;
  /** Classes that can use this (spells, subclasses). Lowercase class indexes. */
  classes?: string[];
  /** Short label for where it came from, e.g. "SRD 5.1" or "Tome of Heroes". */
  sourceLabel?: string;
}

/** Full entry, normalized across all sources so the UI renders one shape. */
export interface ContentDetail extends ContentSummary {
  description: string;
  prerequisite?: string;
  /** Display facts, e.g. { "Casting Time": "1 action", "Range": "60 feet" }. */
  meta: Record<string, string>;
  /** Spell-specific fields used by the sheet. */
  spell?: { school?: string; ritual?: boolean; concentration?: boolean };
  /** Structured, machine-applicable effects (mostly from homebrew), e.g. ability score increases. */
  effects?: Effect[];
}

export type Effect =
  | { kind: "ability"; ability: string; amount: number }
  | { kind: "speed"; amount: number }
  | { kind: "hp-per-level"; amount: number }
  | { kind: "ac"; amount: number }
  | { kind: "proficiency"; value: string };
