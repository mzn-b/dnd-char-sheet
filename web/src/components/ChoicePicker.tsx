import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { withRequired } from "../lib/apply";
import { FEAT_ID, FEAT_PREFIX, choiceShown, featSelections } from "../lib/grants";
import { alreadyOwned, mergeOwned, ownedFrom, ownedFromSelections, type Owned } from "../lib/proficiencies";
import { featPrereqProblem } from "../lib/prereqs";
import { SKILLS, totalLevel } from "../lib/rules";
import type { Character, Choice, ChoiceOption, ContentDetail, ContentSummary, ContentType, Selections } from "../lib/types";
import { ContentBrowser, ContentDetailView, contentId } from "./ContentBrowser";
import { Markdown, Modal, Spinner } from "./ui";

/** Pick option(s) for one choice. Feature options get a list + detail pane; simple ones are chips. */
export function ChoicePicker({
  choice: choiceIn, selected: selectedIn, onChange, character, taken = [], blocked, owned: ownedIn,
}: {
  choice: Choice;
  selected: string[];
  onChange: (keys: string[]) => void;
  /** Why an option can't be picked (unmet prerequisite), if so. */
  blocked?: (o: ChoiceOption) => string | undefined;
  character?: Character;
  /** Keys already owned elsewhere (e.g. invocations known), shown but not selectable. */
  taken?: string[];
  /** Skills and proficiencies already had (defaults to the character's): not offered again. */
  owned?: Owned;
}) {
  // Languages, tools, weapons and armor already had aren't offered again (a race's Common in its language
  // pick); skills already had are shown but can't be taken twice.
  const owned = ownedIn ?? (character ? ownedFrom(character) : undefined);
  const has = (o: ChoiceOption) => !selectedIn.includes(o.key) && alreadyOwned(owned, choiceIn, o);
  const choice = choiceIn.kind === "proficiency" ? { ...choiceIn, options: choiceIn.options.filter((o) => !has(o)) } : choiceIn;
  const [focused, setFocused] = useState<ChoiceOption | null>(null);
  const required = choice.required ?? [];
  // Point-style choices repeat keys (+2 = the same score twice), so only merge when there are required options.
  const selected = withRequired(choice, selectedIn);
  const full = selected.length >= choice.count;
  const toggle = (key: string) =>
    required.includes(key) ? undefined
      : onChange(selected.includes(key) ? selected.filter((k) => k !== key) : full && choice.count === 1 ? [key] : full ? selected : [...selected, key]);

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
            const known = has(o);
            const hint =
              character && choice.kind === "expertise" && character.skills[o.key] != null && character.skills[o.key] < 1 ? " (not proficient)"
              : known ? " (already proficient)"
              : "";
            return (
              <button
                key={o.key}
                type="button"
                // Expertise needs proficiency in the skill first.
                disabled={taken.includes(o.key) || known || (!on && full && choice.count > 1) || (!on && choice.kind === "expertise" && !choice.grantsProficiency && !!character && character.skills[o.key] != null && character.skills[o.key] < 1)}
                onClick={() => toggle(o.key)}
                className={`rounded-lg border px-2.5 py-1 text-sm transition disabled:opacity-40 ${on ? "border-accent-500 bg-accent-500/15 text-accent-400" : "border-ink-700 hover:border-ink-600"}`}
              >
                {o.name}{skillAbility(choice, o.key) && <span className="ml-1 text-xs text-ink-400">({skillAbility(choice, o.key)})</span>}<span className="text-xs text-ink-600">{hint}</span>
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
            // Replicate Magic Item can be learned more than once (Tasha's).
            const isTaken = taken.includes(o.key) && !/^replicate magic item/i.test(o.name);
            // Feats offered as a pick (Variant Human): their prerequisites; without a character only the level counts.
            const featReason = o.prereqs && (character ? featPrereqProblem(character, o.prereqs, Math.max(1, totalLevel(character))) : o.prereqs.every((p) => (p.level ?? 0) > 1) ? `Needs level ${Math.min(...o.prereqs.map((p) => p.level ?? 1))}` : undefined);
            const reason = on ? undefined : blocked?.(o) ?? featReason;
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
                  disabled={isTaken || !!reason || required.includes(o.key) || (!on && full && choice.count > 1)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(o.key)}
                />
                <span className={`flex-1 ${isTaken || reason ? "text-ink-400" : ""}`}>{o.name}</span>
                {(reason || o.prerequisite) && <span className={`max-w-[45%] truncate text-[11px] ${reason ? "text-blood-500" : "text-ink-600"}`} title={reason ?? o.prerequisite}>{reason ?? o.prerequisite}</span>}
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

/** "WIS" for a skill option (Perception), so the player sees which ability it uses. */
function skillAbility(choice: Choice, key: string): string | undefined {
  const skill = choice.kind === "skill" || choice.kind === "expertise" ? key : key.startsWith("skill:") ? key.slice(6) : undefined;
  const ability = skill && SKILLS.find((s) => s.key === skill)?.ability;
  return ability ? ability.toUpperCase() : undefined;
}

/** All choices of one piece of content, with a shared selections object. */
export function ChoiceList({
  choices, selections, onChange, character, blocked, owned,
}: {
  choices: Choice[]; selections: Selections; onChange: (s: Selections) => void; character?: Character; blocked?: (o: ChoiceOption) => string | undefined;
  /** What's already had besides the character's own (the other origin step's grants and picks). */
  owned?: Owned;
}) {
  const base = mergeOwned(ownedFrom(character), ...(owned ? [owned] : []));
  return (
    <div className="space-y-4">
      {choices.filter((ch) => choiceShown(ch, selections)).map((ch) => (
        <div key={ch.id}>
          {/* What the other choices here picked counts as had too, so the same language isn't taken twice. */}
          <ChoicePicker choice={ch} character={character} owned={mergeOwned(base, ownedFromSelections(choices, selections, ch.id))} blocked={blocked} selected={selections[ch.id] ?? []} onChange={(keys) => onChange({ ...selections, [ch.id]: keys })} />
          {ch.id === FEAT_ID && withRequired(ch, selections[ch.id] ?? []).map((key) => (
            <GrantedFeatChoices key={key} option={ch.options.find((o) => o.key === key)} selections={selections} onChange={onChange} character={character} owned={mergeOwned(base, ownedFromSelections(choices, selections))} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The choices of a feat granted by a race or background (Variant Human's feat), stored with a prefix. */
function GrantedFeatChoices({ option, selections, onChange, character, owned }: { option?: ChoiceOption; selections: Selections; onChange: (s: Selections) => void; character?: Character; owned?: Owned }) {
  const { data } = useQuery({
    queryKey: ["detail", "feat", option?.source, option?.key],
    queryFn: () => api.detail("feat", option!.source!, option!.key),
    enabled: !!option?.source,
    staleTime: Infinity,
  });
  if (!data?.choices?.length) return null;
  const nested = featSelections(selections);
  return (
    <div className="ml-4 mt-3 border-l border-ink-800 pl-3">
      <div className="label mb-2">{data.name}</div>
      <ChoiceList
        choices={data.choices}
        selections={nested}
        character={character}
        owned={owned}
        onChange={(s) => onChange({ ...Object.fromEntries(Object.entries(selections).filter(([k]) => !k.startsWith(FEAT_PREFIX))), ...Object.fromEntries(Object.entries(s).map(([k, v]) => [FEAT_PREFIX + k, v])) })}
      />
    </div>
  );
}

export const unfinishedChoices = (choices: Choice[] | undefined, selections: Selections) =>
  (choices ?? []).filter((ch) => choiceShown(ch, selections) && withRequired(ch, selections[ch.id] ?? []).length < (ch.maxPerOption ? ch.count : Math.min(ch.count, ch.options.length)));

/**
 * Two-step modal: browse content (race, background, feat…), then make its choices, then apply.
 */
export function ContentApplyDialog({
  type, title, onClose, onApply, disabledIds, character, filters, blocked,
}: {
  blocked?: (c: ContentSummary) => string | undefined;
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
          blocked={blocked}
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
