import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ContentDetail, ContentSummary, ContentType } from "../lib/types";
import { spellLevelLabel } from "../lib/rules";
import { Markdown, Modal, SourceBadge, Spinner } from "./ui";

export const contentId = (c: { source: string; key: string }) => `${c.source}:${c.key}`;

export interface BrowserFilters {
  class?: string;
  level?: number;
  minLevel?: number;
  maxLevel?: number;
}

/**
 * Searchable list of rules content (SRD + Open5e + homebrew) with a detail pane.
 * Used inline by the level-up wizard and inside ContentPicker modals.
 */
export function ContentBrowser({
  type, filters = {}, selected, onToggle, disabledIds = new Set(), limit, classLabel, allowAnyClass = true,
}: {
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
  const cls = classOnly ? filters.class : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["content", type, cls, filters.maxLevel],
    queryFn: () => api.search(type, { class: cls, maxLevel: filters.maxLevel }),
    staleTime: 5 * 60_000,
  });

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (c) => (!term || c.name.toLowerCase().includes(term)) &&
        (levelFilter == null || c.level === levelFilter) &&
        (filters.minLevel == null || (c.level ?? 0) >= filters.minLevel),
    );
  }, [data, q, levelFilter, filters.minLevel]);

  const levels = useMemo(
    () =>
      type === "spell"
        ? [...new Set((data ?? []).map((c) => c.level ?? 0))].filter((l) => l >= (filters.minLevel ?? 0)).sort((a, b) => a - b)
        : [],
    [data, type, filters.minLevel],
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
          {limit != null && (
            <span className={`ml-auto text-xs ${full ? "text-accent-400" : "text-ink-400"}`}>{selected.length} / {limit} chosen</span>
          )}
        </div>
        <div className="max-h-[50vh] min-h-0 flex-1 overflow-y-auto rounded-lg border border-ink-800">
          {isLoading && <div className="p-3"><Spinner /></div>}
          {error && <div className="p-3 text-sm text-blood-500">{(error as Error).message}</div>}
          {!isLoading && results.length === 0 && <div className="p-3 text-sm text-ink-400">Nothing found. You can add it as homebrew.</div>}
          {results.map((c) => {
            const id = contentId(c);
            const owned = disabledIds.has(id);
            const isSel = selectedIds.has(id);
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
                  disabled={owned || (!isSel && full)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(c)}
                />
                <span className={`flex-1 truncate ${owned ? "text-ink-400" : ""}`}>{c.name}</span>
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

export function ContentDetailView({
  type, item, children,
}: { type: ContentType; item: { source: ContentSummary["source"]; key: string; name: string }; children?: React.ReactNode }) {
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
        </div>
        {data && <SourceBadge source={data.source} label={data.sourceLabel} />}
      </div>
      {isLoading && <Spinner />}
      {error && <p className="text-sm text-blood-500">{(error as Error).message}</p>}
      {data && <DetailBody detail={data} />}
      {children}
    </div>
  );
}

export function DetailBody({ detail }: { detail: ContentDetail }) {
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
      {detail.classes?.length ? <p className="text-xs text-ink-400">Classes: {detail.classes.join(", ")}</p> : null}
      <Markdown text={detail.description || "_No description._"} />
    </>
  );
}

/** Modal wrapper around ContentBrowser for picking content outside the level-up flow. */
export function ContentPicker({
  title, type, filters, disabledIds, limit, classLabel, onClose, onConfirm, confirmLabel = "Add",
}: {
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
      />
    </Modal>
  );
}
