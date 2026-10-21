import { createContext, useContext } from "react";
import type { ContentSummary, ContentType } from "./types";

/** Content a character is built from; the book filter applies to these, not to items or monsters. */
export const BOOK_FILTERED: ContentType[] = ["race", "class", "subclass", "background", "feat", "spell", "feature"];

export const PHB = "Player's Handbook (2014)";
/** The SRD is a free subset of the PHB, so allowing the PHB also allows SRD entries. */
const SRD = "SRD 5.1";

/** Books allowed for the character being built or edited; null = every enabled book. */
export const BooksContext = createContext<string[] | null>(null);

export const labelOf = (c: Pick<ContentSummary, "source" | "sourceLabel">) =>
  c.sourceLabel ?? (c.source === "homebrew" ? "Homebrew" : c.source);

/** Whether a piece of content passes the book filter. Your own homebrew always does. */
export function bookAllowed(books: string[] | null | undefined, c: Pick<ContentSummary, "source" | "sourceLabel" | "type">): boolean {
  if (!books?.length || c.source === "homebrew" || !BOOK_FILTERED.includes(c.type)) return true;
  const label = labelOf(c);
  return books.includes(label) || (label === SRD && books.includes(PHB));
}

/** The filter for the current character (from BooksContext). */
export function useBookFilter() {
  const books = useContext(BooksContext);
  return { books, allowed: (c: Pick<ContentSummary, "source" | "sourceLabel" | "type">) => bookAllowed(books, c) };
}
