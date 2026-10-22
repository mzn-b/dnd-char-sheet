import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Character, ContentDetail, ContentSummary, ContentType, ExpandedSpell } from "../lib/types";
import { spellLevelLabel } from "../lib/rules";
import { Markdown, Modal, SourceBadge, Spinner } from "./ui";
import { BOOK_FILTERED, useBookFilter } from "../lib/books";
import { FacetFilters } from "./FacetFilters";
import { matches as matchesFacets, sortBy, type FilterState } from "../lib/facets";
import { RollList, SpellRollBreakdown } from "./rolls";
import { extractRolls } from "../lib/rollText";
import { featureSections } from "../lib/featureSections";
import { ordinal } from "../lib/rules";

export const contentId = (c: { source: string; key: string }) => `${c.source}:${c.key}`;

export interface BrowserFilters {
  class?: string;
  level?: number;
  minLevel?: number;
  maxLevel?: number;
  /** Leveled spells only from these schools (Eldritch Knight, Arcane Trickster). */
  schools?: string[];
}

/**
 * Searchable list of rules content (SRD + Open5e + homebrew) with a detail pane.
 * Used inline by the level-up wizard and inside ContentPicker modals.
 */
/** Extra entries merged into the list behind a toggle, e.g. a warlock patron's expanded spells. */
export interface ExtraEntries {
  label: string;
  items: ContentSummary[];
}

export function ContentBrowser({
  type, filters = {}, selected, onToggle, disabledIds = new Set(), limit, classLabel, allowAnyClass = true, extra, blocked,
}: {
  /** Why an entry can't be picked (unmet feat prerequisite), shown on its row. */
  blocked?: (c: ContentSummary) => string | undefined;
  extra?: ExtraEntries;
  type: ContentType;
  filters?: BrowserFilters;
  selected: ContentSummary[];
  onToggle: (c: ContentSummary) => void;
  /** Already-owned content: shown but not selectable. */
  disabledIds?: Set<string>;
  limit?: number;
  classLabel?: string;
  allowAnyClass?: boolean;
}) {
  const [q, setQ] = useState("");
  const [classOnly, setClassOnly] = useState(true);
  const [levelFilter, setLevelFilter] = useState<number | null>(filters.level ?? null);
  const [focused, setFocused] = useState<ContentSummary | null>(null);
  // Remembered per browser: whether expanded (patron) spells are shown in pickers.
  const [includeExtra, setIncludeExtraState] = useState(() => {
    try {
      return localStorage.getItem("showExpandedSpells") !== "false";
    } catch {
      return true;
    }
  });
  const setIncludeExtra = (on: boolean) => {
    setIncludeExtraState(on);
    try {
      localStorage.setItem("showExpandedSpells", String(on));
    } catch {
      /* storage unavailable */
    }
  };
  const [sourceFilter, setSourceFilter] = useState("");
  const cls = classOnly ? filters.class : undefined;

  const query = useQuery({
    queryKey: ["content", type, cls, filters.maxLevel],
    queryFn: () => api.searchFull(type, { class: cls, maxLevel: filters.maxLevel }),
    // A partial answer (a provider still loading) is refreshed sooner.
    staleTime: (q) => (q.state.data?.warnings.length ? 15_000 : 5 * 60_000),
  });
  const { isLoading, error } = query;
  const data = query.data?.results;
  const warnings = query.data?.warnings ?? [];

  const bookFilter = useBookFilter();
  const [allBooks, setAllBooks] = useState(false);
  const filtering = !!bookFilter.books?.length && BOOK_FILTERED.includes(type) && !allBooks;
  const extraIds = useMemo(() => new Set((extra?.items ?? []).map(contentId)), [extra]);
  const merged = useMemo(() => {
    const base = (data ?? []).filter((c) => !filtering || bookFilter.allowed(c));
    if (!extra?.items.length || !includeExtra) return base;
    const have = new Set(base.map(contentId));
    const extras = extra.items.filter(
      (c) => !have.has(contentId(c)) && (filters.maxLevel == null || (c.level ?? 0) <= filters.maxLevel),
    );
    return [...base, ...extras].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
  }, [data, extra, includeExtra, filters.maxLevel, filtering, bookFilter]);
  const hiddenByBooks = filtering ? (data ?? []).length - (data ?? []).filter(bookFilter.allowed).length : 0;
  const sources = useMemo(() => [...new Set(merged.map((c) => c.sourceLabel ?? c.source))].sort(), [merged]);

  const [facetState, setFacetState] = useState<FilterState>({});
  const [sort, setSort] = useState({ key: "default", desc: false });
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = merged.filter(
      (c) => (!term || c.name.toLowerCase().includes(term)) &&
        (levelFilter == null || c.level === levelFilter) &&
        (filters.minLevel == null || (c.level ?? 0) >= filters.minLevel) &&
        (!filters.schools || (c.level ?? 0) === 0 || filters.schools.includes(String(c.facets?.school ?? ""))) &&
        (!sourceFilter || (c.sourceLabel ?? c.source) === sourceFilter) &&
        matchesFacets(c, type, facetState),
    );
    return sortBy(list, type, sort.key, sort.desc);
  }, [merged, q, levelFilter, filters.minLevel, filters.schools, sourceFilter, facetState, type, sort]);

  const levels = useMemo(
    () =>
      type === "spell"
        ? [...new Set(merged.map((c) => c.level ?? 0))].filter((l) => l >= (filters.minLevel ?? 0)).sort((a, b) => a - b)
        : [],
    [merged, type, filters.minLevel],
  );
  const selectedIds = new Set(selected.map(contentId));
  const full = limit != null && selected.length >= limit;

  return (
    <div className="grid min-h-[320px] gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="flex min-h-0 flex-col gap-2">
        <input className="field-boxed" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.class && allowAnyClass && (
            <button className={`chip ${classOnly ? "border-accent-600 text-accent-400" : ""}`} onClick={() => setClassOnly(!classOnly)}>
              {classOnly ? `${classLabel ?? filters.class} list only` : "All classes"}
            </button>
          )}
          {levels.length > 1 && filters.level == null && (
            <>
              <button className={`chip ${levelFilter == null ? "border-accent-600 text-accent-400" : ""}`} onClick={() => setLevelFilter(null)}>All</button>
              {levels.map((l) => (
                <button key={l} className={`chip ${levelFilter === l ? "border-accent-600 text-accent-400" : ""}`} onClick={() => setLevelFilter(l)}>
                  {l === 0 ? "Cantrip" : l}
                </button>
              ))}
            </>
          )}
          {extra && extra.items.length > 0 && (
            <button
              className={`chip ${includeExtra ? "border-fuchsia-700 text-fuchsia-300" : ""}`}
              title={includeExtra ? "Click to hide these spells" : "Click to include these spells"}
              onClick={() => setIncludeExtra(!includeExtra)}
            >
              {includeExtra ? "✓ " : ""}{extra.label}
            </button>
          )}
          {(filtering || allBooks) && !!bookFilter.books?.length && BOOK_FILTERED.includes(type) && (
            <button
              className={`chip ${allBooks ? "" : "border-arcane-500/60 text-arcane-400"}`}
              title={allBooks ? "Only show your chosen books again" : `${hiddenByBooks} entries from other books hidden (${bookFilter.books.join(", ")})`}
              onClick={() => setAllBooks(!allBooks)}
            >
              {allBooks ? "Showing all books" : `📚 ${bookFilter.books.length} book${bookFilter.books.length > 1 ? "s" : ""}`}
            </button>
          )}
          {sources.length > 1 && (
            <select className="field-boxed w-auto max-w-[12rem] py-0.5 text-xs" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} title="Filter by book">
              <option value="">All sources ({sources.length})</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {limit != null && (
            <span className={`ml-auto text-xs ${full ? "text-accent-400" : "text-ink-400"}`}>{selected.length} / {limit} chosen</span>
          )}
        </div>
        <FacetFilters items={merged} type={type} state={facetState} onChange={setFacetState} sort={sort} onSort={setSort} />
        <div className="max-h-[50vh] min-h-0 flex-1 overflow-y-auto rounded-lg border border-ink-800">
          {isLoading && <div className="p-3"><Spinner label="Loading… (the first search of a source can take a few seconds)" /></div>}
          {warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 border-b border-ink-800 bg-accent-500/5 p-2 text-xs text-accent-400">
              <span className="flex-1">⚠ {w}</span>
              <button className="underline" onClick={() => query.refetch()}>Retry</button>
            </div>
          ))}
          {error && <div className="p-3 text-sm text-blood-500">{(error as Error).message}</div>}
          {!isLoading && results.length === 0 && <div className="p-3 text-sm text-ink-400">Nothing found. You can add it as homebrew.</div>}
          {results.map((c) => {
            const id = contentId(c);
            const owned = disabledIds.has(id);
            const isSel = selectedIds.has(id);
            const reason = isSel ? undefined : blocked?.(c);
            return (
              <div
                key={id}
                onClick={() => setFocused(c)}
                className={`flex cursor-pointer items-center gap-2 border-b border-ink-800 px-3 py-2 text-sm last:border-0 hover:bg-ink-850 ${focused && contentId(focused) === id ? "bg-ink-850" : ""}`}
              >
                <input
                  type="checkbox"
                  className="accent-accent-500"
                  checked={isSel || owned}
                  disabled={owned || !!reason || (!isSel && full)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(c)}
                />
                {/* The name wraps rather than truncating; race ability increases go on their own line below it. */}
                <span className="min-w-0 flex-1">
                  <span className={`block break-words ${owned ? "text-ink-400" : ""}`}>{c.name}</span>
                  {c.abilities && <span className="block text-xs text-accent-400">{c.abilities}</span>}
                  {reason && <span className="block text-xs text-blood-500">{reason}</span>}
                </span>
                {extraIds.has(id) && <span className="chip border-fuchsia-800 text-fuchsia-300" title={extra?.label}>expanded</span>}
                {type === "spell" && <span className="text-xs text-ink-400">{c.level === 0 ? "C" : c.level}</span>}
                <SourceBadge source={c.source} label={c.sourceLabel} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto rounded-lg border border-ink-800 bg-ink-950/40 p-4">
        {focused ? (
          <ContentDetailView type={type} item={focused}>
            {!disabledIds.has(contentId(focused)) && (
              <button
                className={selectedIds.has(contentId(focused)) ? "btn" : "btn-primary"}
                disabled={!selectedIds.has(contentId(focused)) && full}
                onClick={() => onToggle(focused)}
              >
                {selectedIds.has(contentId(focused)) ? "Remove selection" : "Choose"}
              </button>
            )}
          </ContentDetailView>
        ) : (
          <p className="text-sm text-ink-400">Select an entry to read its details.</p>
        )}
      </div>
    </div>
  );
}

export function useContentDetail(type: ContentType, item: { source: ContentSummary["source"]; key: string } | null) {
  return useQuery({
    queryKey: ["detail", type, item?.source, item?.key],
    queryFn: () => api.detail(type, item!.source, item!.key),
    enabled: !!item,
    staleTime: Infinity,
  });
}

/** Character context for showing rolls resolved for this character (level, spellcasting modifier). */
export interface RollContext {
  characterLevel: number;
  mod?: number;
}

export function ContentDetailView({
  type, item, children, rollContext,
}: { type: ContentType; item: { source: ContentSummary["source"]; key: string; name: string; abilities?: string }; children?: React.ReactNode; rollContext?: RollContext }) {
  const { data, isLoading, error } = useContentDetail(type, item);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl text-ink-200">{item.name}</h3>
          {data?.type === "spell" && (
            <p className="text-sm italic text-ink-400">
              {data.level === 0 ? `${data.spell?.school ?? ""} cantrip` : `${spellLevelLabel(data.level ?? 0)} ${data.spell?.school ?? ""}`.toLowerCase()}
              {data.spell?.ritual ? " (ritual)" : ""}
            </p>
          )}
          {item.abilities && <p className="text-sm text-accent-400"><span className="label mr-2">Ability scores</span>{item.abilities}</p>}
        </div>
        {data && <SourceBadge source={data.source} label={data.sourceLabel} />}
      </div>
      {isLoading && <Spinner />}
      {error && <p className="text-sm text-blood-500">{(error as Error).message}</p>}
      {data && <DetailBody detail={data} rollContext={rollContext} />}
      {type === "subclass" && <SubclassFeatures item={item} intro={data?.description} />}
      {children}
    </div>
  );
}

/** Every feature a subclass grants, level by level, with its rules text. */
function SubclassFeatures({ item, intro }: { item: { source: ContentSummary["source"]; key: string }; intro?: string }) {
  const rules = useQuery({ queryKey: ["subclassRules", item.source, item.key], queryFn: () => api.subclassRules(item.source, item.key), staleTime: Infinity });
  const refs = (rules.data?.levels ?? []).flatMap((l) => l.features.filter((f) => !f.optional).map((f) => ({ ...f, level: l.level })));
  const details = useQueries({
    queries: refs.map((f) => ({ queryKey: ["detail", "feature", f.source, f.key], queryFn: () => api.detail("feature", f.source, f.key), staleTime: Infinity })),
  });
  // Choice features (Hunter's Prey) list option names; fetch what each option does.
  const optionRefs = details.flatMap((q) => (q.data?.choices ?? []).flatMap((ch) => ch.options)).filter((o) => o.source && !o.description);
  const optionDetails = useQueries({
    queries: optionRefs.map((o) => ({ queryKey: ["detail", o.type ?? "feature", o.source, o.key], queryFn: () => api.detail(o.type ?? "feature", o.source!, o.key), staleTime: Infinity })),
  });
  const optionText = new Map(optionRefs.map((o, i) => [o.key, optionDetails[i].data?.description]));
  if (rules.isLoading) return <Spinner />;
  if (!refs.length) return null;
  // A feature that bundles several ("Gloom Stalker" → Gloom Stalker Magic, Dread Ambusher, Umbral Sight) is shown section by section.
  const entries = refs.flatMap((f, i) => {
    const det = details[i].data;
    if (!det) return [{ level: f.level, name: f.name, text: details[i].isLoading ? null : "_No description._" }];
    const [head, ...parts] = featureSections({ name: det.name, description: det.description, kind: "subclass" });
    const own = head.text.trim();
    const headShown = parts.length ? own && own !== intro?.trim() && !intro?.trim().startsWith(own) : true;
    // Choice features (Hunter's Prey) list option names; spell out what each option does, in the
    // section that lists it (or the feature itself), in place of the bare list of names.
    const options = (det.choices ?? []).flatMap((ch) => ch.options);
    const listed = (text: string, name: string) => new RegExp(`^(?:- )?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
    const sections = [{ ...head, text: own }, ...parts.map((p) => ({ ...p, text: p.text.replace(FEATURE_MARK_LINE, "").trim() }))];
    const home = (o: (typeof options)[number]) => sections.find((x) => listed(x.text, o.name).test(x.text)) ?? sections[0];
    const filled = sections.map((x) => {
      const mine = options.filter((o) => home(o) === x && !x.text.includes(`**${o.name}.**`));
      const lines = mine.flatMap((o) => {
        const t = o.description ?? optionText.get(o.key);
        return t ? [`**${o.name}.** ${t.trim()}`] : [];
      });
      if (!lines.length) return x;
      const bare = mine.reduce((t, o) => t.replace(listed(t, o.name), ""), x.text).replace(/\n{3,}/g, "\n\n").trim();
      return { ...x, text: [bare, ...lines].filter(Boolean).join("\n\n") };
    });
    return [
      ...(headShown ? [{ level: f.level, name: det.name, text: filled[0].text || "_No description._" }] : []),
      ...filled.slice(1).map((p) => ({ level: f.level, name: p.name, text: p.text })),
    ];
  });
  return (
    <div className="space-y-2 border-t border-ink-800 pt-3">
      <h4 className="label">Features by level</h4>
      {entries.map((e, i) => (
        <details key={i} open className="rounded-lg border border-ink-800 bg-ink-850/40 px-3 py-2">
          <summary className="cursor-pointer select-none">
            <span className="mr-2 text-xs text-ink-400">{ordinal(e.level)} level</span>
            <span className="font-semibold text-ink-200">{e.name}</span>
          </summary>
          <div className="mt-1 text-sm">{e.text === null ? <Spinner /> : <Markdown text={e.text} />}</div>
        </details>
      ))}
    </div>
  );
}

/** "*3rd-level Gloom Stalker feature*" at the start of a section. */
const FEATURE_MARK_LINE = /^\*\d+(?:st|nd|rd|th)-level [^*]+ feature\*\s*/i;

export function DetailBody({ detail, rollContext }: { detail: ContentDetail; rollContext?: RollContext }) {
  const otherRolls = detail.type !== "spell" ? extractRolls(detail.description) : [];
  const meta = Object.entries(detail.meta ?? {}).filter(([k, v]) => v && k !== "Level" && k !== "School");
  return (
    <>
      {detail.prerequisite && <p className="text-sm"><span className="label mr-2">Prerequisite</span>{detail.prerequisite}</p>}
      {meta.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-ink-850 p-3 text-sm">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="label">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {detail.type === "spell" ? (
        <SpellRollBreakdown description={detail.description} spellLevel={detail.level ?? 0} characterLevel={rollContext?.characterLevel ?? 1} mod={rollContext?.mod} source={detail.name} />
      ) : otherRolls.length > 0 ? (
        <div className="rounded-lg border border-ink-800 bg-ink-850/40 p-3">
          <div className="label mb-1">What to roll</div>
          <RollList rolls={otherRolls} at={{ characterLevel: rollContext?.characterLevel ?? 1 }} mod={rollContext?.mod} source={detail.name} />
        </div>
      ) : null}
      {detail.classes?.length ? <p className="text-xs text-ink-400">Classes: {detail.classes.join(", ")}</p> : null}
      <Markdown text={detail.description || "_No description._"} />
    </>
  );
}

/** Modal wrapper around ContentBrowser for picking content outside the level-up flow. */
export function ContentPicker({
  title, type, filters, disabledIds, limit, classLabel, onClose, onConfirm, confirmLabel = "Add", extra,
}: {
  extra?: ExtraEntries;
  title: string;
  type: ContentType;
  filters?: BrowserFilters;
  disabledIds?: Set<string>;
  limit?: number;
  classLabel?: string;
  onClose: () => void;
  onConfirm: (picked: ContentSummary[]) => void;
  confirmLabel?: string;
}) {
  const [selected, setSelected] = useState<ContentSummary[]>([]);
  const toggle = (c: ContentSummary) =>
    setSelected((s) => (s.some((x) => contentId(x) === contentId(c)) ? s.filter((x) => contentId(x) !== contentId(c)) : [...s, c]));
  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!selected.length} onClick={() => onConfirm(selected)}>
            {confirmLabel} {selected.length > 0 && `(${selected.length})`}
          </button>
        </>
      }
    >
      <ContentBrowser
        type={type}
        filters={filters}
        selected={selected}
        onToggle={toggle}
        disabledIds={disabledIds}
        limit={limit}
        classLabel={classLabel}
        extra={extra}
      />
    </Modal>
  );
}

/**
 * Every expanded list that applies to a class's spell picks: the subclass's (patron, Divine Soul) and
 * the race's or background's ("added to the spell list of your spellcasting class").
 */
export function allExpandedEntries(c: Character, subclass?: { name: string; spells?: ExpandedSpell[] }): ExtraEntries | undefined {
  const lists = [
    subclass && expandedEntries(subclass.name, subclass.spells),
    ...c.features.filter((f) => f.expandedSpells?.length).map((f) => expandedEntries(f.name, f.expandedSpells)),
  ].filter(Boolean) as ExtraEntries[];
  if (!lists.length) return undefined;
  if (lists.length === 1) return lists[0];
  return { label: `Expanded spells (${lists.map((l) => l.label.replace(/ expanded spells$/, "")).join(", ")})`, items: lists.flatMap((l) => l.items) };
}

/** A subclass's expanded spells as picker entries. */
export function expandedEntries(subclassName: string, spells: { spellLevel: number; spell: { source: ContentSummary["source"]; key: string; name: string } }[] | undefined): ExtraEntries | undefined {
  if (!spells?.length) return undefined;
  return {
    label: `${subclassName} expanded spells`,
    items: spells.map((e) => ({ ...e.spell, type: "spell", level: e.spellLevel, sourceLabel: `${subclassName} (expanded)` })),
  };
}
