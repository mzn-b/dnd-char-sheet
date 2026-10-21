import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Character, Choice, ChoiceOption, ContentDetail, ContentSummary, ContentType, Selections } from "../lib/types";
import { ContentBrowser, ContentDetailView, contentId } from "./ContentBrowser";
import { Markdown, Modal, Spinner } from "./ui";

/** Pick option(s) for one choice. Feature options get a list + detail pane; simple ones are chips. */
export function ChoicePicker({
  choice, selected, onChange, character, taken = [],
}: {
  choice: Choice;
  selected: string[];
  onChange: (keys: string[]) => void;
  character?: Character;
  /** Keys already owned elsewhere (e.g. invocations known), shown but not selectable. */
  taken?: string[];
}) {
  const [focused, setFocused] = useState<ChoiceOption | null>(null);
  const full = selected.length >= choice.count;
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : full && choice.count === 1 ? [key] : full ? selected : [...selected, key]);

  const header = (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <span className="text-sm font-semibold text-ink-200">{choice.label}</span>
      <span className={`text-xs ${full ? "text-emerald-400" : "text-accent-400"}`}>{selected.length} / {choice.count}</span>
    </div>
  );

  // Point-style choices (+2/+1 or +1/+1/+1): a stepper per option; repeated keys add up.
  if (choice.maxPerOption && choice.maxPerOption > 1) {
    const times = (key: string) => selected.filter((k) => k === key).length;
    const add = (key: string) => !full && times(key) < choice.maxPerOption! && onChange([...selected, key]);
    const remove = (key: string) => {
      const i = selected.lastIndexOf(key);
      if (i >= 0) onChange(selected.filter((_, j) => j !== i));
    };
    const amount = choice.amount ?? 1;
    return (
      <div>
        {header}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {choice.options.map((o) => {
            const n = times(o.key);
            return (
              <div key={o.key} className={`flex flex-col items-center rounded-lg border p-1.5 ${n ? "border-accent-500 bg-accent-500/10" : "border-ink-700"}`}>
                <span className="text-xs font-semibold">{o.name}</span>
                <span className={`font-display text-lg ${n ? "text-accent-400" : "text-ink-600"}`}>+{n * amount}</span>
                <span className="flex gap-1">
                  <button type="button" className="btn px-1.5 py-0 text-xs" disabled={!n} onClick={() => remove(o.key)} aria-label={`Lower ${o.name}`}>−</button>
                  <button type="button" className="btn px-1.5 py-0 text-xs" disabled={full || n >= choice.maxPerOption!} onClick={() => add(o.key)} aria-label={`Raise ${o.name}`}>+</button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (choice.kind !== "feature") {
    return (
      <div>
        {header}
        <div className="flex flex-wrap gap-1.5">
          {choice.options.map((o) => {
            const on = selected.includes(o.key);
            const hint =
              character && choice.kind === "expertise" && character.skills[o.key] != null && character.skills[o.key] < 1 ? " (not proficient)"
              : character && choice.kind === "skill" && (character.skills[o.key] ?? 0) >= 1 ? " (already proficient)"
              : "";
            return (
              <button
                key={o.key}
                type="button"
                disabled={taken.includes(o.key) || (!on && full && choice.count > 1)}
                onClick={() => toggle(o.key)}
                className={`rounded-lg border px-2.5 py-1 text-sm transition disabled:opacity-40 ${on ? "border-accent-500 bg-accent-500/15 text-accent-400" : "border-ink-700 hover:border-ink-600"}`}
              >
                {o.name}<span className="text-xs text-ink-600">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-800">
          {choice.options.map((o) => {
            const on = selected.includes(o.key);
            const isTaken = taken.includes(o.key);
            return (
              <div
                key={o.key}
                onClick={() => setFocused(o)}
                className={`flex cursor-pointer items-center gap-2 border-b border-ink-800 px-3 py-1.5 text-sm last:border-0 hover:bg-ink-850 ${focused?.key === o.key ? "bg-ink-850" : ""}`}
              >
                <input
                  type={choice.count === 1 ? "radio" : "checkbox"}
                  className="accent-accent-500"
                  checked={on || isTaken}
                  disabled={isTaken || (!on && full && choice.count > 1)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(o.key)}
                />
                <span className={`flex-1 ${isTaken ? "text-ink-400" : ""}`}>{o.name}</span>
                {o.prerequisite && <span className="max-w-[45%] truncate text-[11px] text-ink-600" title={o.prerequisite}>{o.prerequisite}</span>}
              </div>
            );
          })}
        </div>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-ink-800 bg-ink-950/40 p-3">
          {focused ? <OptionDetail option={focused} /> : <p className="text-sm text-ink-400">Select an option to read it.</p>}
        </div>
      </div>
    </div>
  );
}

function OptionDetail({ option }: { option: ChoiceOption }) {
  const fetchable = !option.description && option.source && option.type;
  const { data, isLoading } = useQuery({
    queryKey: ["detail", option.type, option.source, option.key],
    queryFn: () => api.detail(option.type!, option.source!, option.key),
    enabled: !!fetchable,
    staleTime: Infinity,
  });
  return (
    <div className="space-y-2">
      <h4 className="font-display text-lg">{option.name}</h4>
      {option.prerequisite && <p className="text-xs"><span className="label mr-1">Prerequisite</span>{option.prerequisite}</p>}
      {isLoading && <Spinner />}
      <Markdown text={option.description || data?.description || (fetchable ? "" : "_No description._")} />
    </div>
  );
}

/** All choices of one piece of content, with a shared selections object. */
export function ChoiceList({
  choices, selections, onChange, character,
}: { choices: Choice[]; selections: Selections; onChange: (s: Selections) => void; character?: Character }) {
  return (
    <div className="space-y-4">
      {choices.map((ch) => (
        <ChoicePicker key={ch.id} choice={ch} character={character} selected={selections[ch.id] ?? []} onChange={(keys) => onChange({ ...selections, [ch.id]: keys })} />
      ))}
    </div>
  );
}

export const unfinishedChoices = (choices: Choice[] | undefined, selections: Selections) =>
  (choices ?? []).filter((ch) => (selections[ch.id]?.length ?? 0) < Math.min(ch.count, ch.options.length));

/**
 * Two-step modal: browse content (race, background, feat…), then make its choices, then apply.
 */
export function ContentApplyDialog({
  type, title, onClose, onApply, disabledIds, character, filters,
}: {
  type: ContentType;
  title: string;
  onClose: () => void;
  onApply: (detail: ContentDetail, selections: Selections) => Promise<void> | void;
  disabledIds?: Set<string>;
  character?: Character;
  filters?: { class?: string };
}) {
  const [picked, setPicked] = useState<ContentSummary | null>(null);
  const [step, setStep] = useState<"browse" | "choices">("browse");
  const [selections, setSelections] = useState<Selections>({});
  const [busy, setBusy] = useState(false);
  const { data: detail } = useQuery({
    queryKey: ["detail", type, picked?.source, picked?.key],
    queryFn: () => api.detail(type, picked!.source, picked!.key),
    enabled: !!picked,
    staleTime: Infinity,
  });
  const hasChoices = !!detail?.choices?.length;
  const apply = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await onApply(detail, selections);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      wide
      title={step === "choices" && detail ? `${title}: ${detail.name}` : title}
      onClose={onClose}
      footer={
        <>
          <button className="btn mr-auto" onClick={onClose}>Cancel</button>
          {step === "choices" && <button className="btn" onClick={() => setStep("browse")}>Back</button>}
          {step === "browse" && hasChoices ? (
            <button className="btn-primary" disabled={!detail} onClick={() => setStep("choices")}>Next: choices</button>
          ) : (
            <button className="btn-primary" disabled={!detail || busy} onClick={apply}>{busy ? "Applying…" : "Apply"}</button>
          )}
        </>
      }
    >
      {step === "browse" ? (
        <ContentBrowser
          type={type}
          filters={filters}
          limit={1}
          disabledIds={disabledIds}
          selected={picked ? [picked] : []}
          onToggle={(c) => { setPicked(picked && contentId(picked) === contentId(c) ? null : c); setSelections({}); }}
        />
      ) : (
        detail && (
          <div className="space-y-5">
            <details className="rounded-lg border border-ink-800 p-3">
              <summary className="cursor-pointer text-sm text-ink-400">Show {detail.name} description</summary>
              <div className="mt-2"><ContentDetailView type={type} item={detail} /></div>
            </details>
            <ChoiceList choices={detail.choices ?? []} selections={selections} onChange={setSelections} character={character} />
          </div>
        )
      )}
    </Modal>
  );
}
