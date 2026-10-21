import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCharacter } from "../lib/useCharacter";
import { SheetHeader } from "../components/sheet/SheetHeader";
import { AbilitiesPanel } from "../components/sheet/AbilitiesPanel";
import { CombatPanel } from "../components/sheet/CombatPanel";
import { AttacksPanel } from "../components/sheet/AttacksPanel";
import { SpellsTab } from "../components/sheet/SpellsTab";
import { ActionsTab } from "../components/sheet/ActionsTab";
import { CombatBar } from "../components/sheet/CombatTracker";
import { InventoryTab } from "../components/sheet/InventoryTab";
import { FeaturesTab, SubFeatureRow } from "../components/sheet/FeaturesTab";
import { BioTab } from "../components/sheet/BioTab";
import { ExtrasTab, WildShapeBanner } from "../components/sheet/ExtrasTab";
import { BooksContext } from "../lib/books";
import { DecisionProvider } from "../components/decisions";
import { HistoryTab } from "../components/sheet/HistoryTab";
import { RestDialog } from "../components/sheet/RestDialog";
import { LevelUpWizard } from "../components/levelup/LevelUpWizard";
import { Markdown, Section, Spinner, TextArea } from "../components/ui";
import type { Character } from "../lib/types";
import type { Update } from "../lib/useCharacter";

const TABS = ["Overview", "Actions", "Spells", "Inventory", "Features", "Extras", "Bio & Notes", "History"] as const;
type Tab = (typeof TABS)[number];

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const { character: c, update, saveState, isLoading, error, undo, redo, canUndo, canRedo } = useCharacter(id!);
  const [tab, setTab] = useState<Tab>("Overview");
  const [levelingUp, setLevelingUp] = useState(false);
  const [building, setBuilding] = useState(false);
  const [endedEffects, setEndedEffects] = useState<string[]>([]);
  const justApplied = useRef(false);
  const pending = c?.pendingLevelUps ?? [];

  // Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) undo sheet changes; text fields keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        (e.shiftKey ? redo : undo)();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // A character fresh from the creator opens straight into its queued level-ups.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (c && !autoOpened.current) {
      autoOpened.current = true;
      if (c.pendingLevelUps?.length) setBuilding(true);
    }
  }, [c]);

  if (isLoading || (!c && !error)) return <Spinner label="Opening character sheet…" />;
  if (error || !c) return <p className="text-blood-500">Couldn't load character. <Link to="/" className="underline">Back to list</Link></p>;

  return (
    <BooksContext.Provider value={c.options?.books?.length ? c.options.books : null}>
    <DecisionProvider c={c} update={update}>
    <div className="space-y-4">
      <SheetHeader
        c={c}
        update={update}
        saveState={saveState}
        onLevelUp={() => (pending.length ? setBuilding(true) : setLevelingUp(true))}
        restButtons={<RestButtons c={c} update={update} />}
      />

      {pending.length > 0 && !building && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent-600/50 bg-accent-500/10 px-4 py-3 text-sm">
          <span>
            Your build has <b>{pending.length}</b> level-up{pending.length > 1 ? "s" : ""} left
            ({pending.map((p) => p.name).join(", ")}).
          </span>
          <div className="flex gap-2">
            <button className="btn-ghost text-xs" onClick={() => update((d) => void (d.pendingLevelUps = []))}>Discard plan</button>
            <button className="btn-primary" onClick={() => setBuilding(true)}>Continue build</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-ink-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${tab === t ? "border-accent-500 text-accent-400" : "border-transparent text-ink-400 hover:text-ink-200"}`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto flex gap-1 pb-1">
          <button className="btn-ghost px-2 text-xs" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">↶</button>
          <button className="btn-ghost px-2 text-xs" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
          <Link to={`/characters/${c.id}/print`} className="btn-ghost text-xs" title="Printable sheet / save as PDF">Print</Link>
          <button className="btn-ghost text-xs" onClick={() => exportJson(c)}>Export</button>
        </div>
      </div>

      <CombatBar c={c} update={update} onEnded={setEndedEffects} />
      {tab !== "Extras" && <WildShapeBanner c={c} update={update} />}

      {tab === "Overview" && <Overview c={c} update={update} />}
      {tab === "Actions" && <ActionsTab c={c} update={update} endedEffects={endedEffects} />}
      {tab === "Spells" && <SpellsTab c={c} update={update} />}
      {tab === "Inventory" && <InventoryTab c={c} update={update} />}
      {tab === "Features" && <FeaturesTab c={c} update={update} />}
      {tab === "Extras" && <ExtrasTab c={c} update={update} />}
      {tab === "Bio & Notes" && <BioTab c={c} update={update} />}
      {tab === "History" && <HistoryTab c={c} />}

      {levelingUp && <LevelUpWizard c={c} update={update} onClose={() => setLevelingUp(false)} />}
      {building && pending[0] && (
        <LevelUpWizard
          key={pending.length}
          c={c}
          update={update}
          queue={{ cls: pending[0], index: c.classes.reduce((s, k) => s + k.level, 0) + 1, total: c.classes.reduce((s, k) => s + k.level, 0) + pending.length }}
          onApplied={(d) => {
            justApplied.current = true;
            d.pendingLevelUps = (d.pendingLevelUps ?? []).slice(1);
          }}
          onClose={() => {
            // After an applied level the next queued one opens; "Pause build" closes the wizard.
            if (justApplied.current && pending.length > 1) justApplied.current = false;
            else {
              justApplied.current = false;
              setBuilding(false);
            }
          }}
        />
      )}
    </div>
    </DecisionProvider>
    </BooksContext.Provider>
  );
}

/** Page one of the paper sheet, in three columns. */
function Overview({ c, update }: { c: Character; update: Update }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr_20rem]">
      <AbilitiesPanel c={c} update={update} />
      <div className="space-y-4">
        <CombatPanel c={c} update={update} />
        <AttacksPanel c={c} update={update} />
      </div>
      <div className="space-y-4">
        {(["traits", "ideals", "bonds", "flaws"] as const).map((k) => (
          <Section key={k} title={k === "traits" ? "Personality Traits" : k}>
            <TextArea rows={2} className="field resize-y text-sm" placeholder="—" value={c.personality[k]} onChange={(v) => update((d) => void (d.personality[k] = v))} />
          </Section>
        ))}
        <Section title="Features & Traits">
          {c.features.length === 0 && <p className="text-sm text-ink-600">Gained through race, class, background and feats.</p>}
          <ul className="space-y-1">
            {c.features.map((f) => (
              <li key={f.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm hover:text-accent-400">
                    <span className="text-ink-600 transition group-open:rotate-90">›</span>
                    <span className="flex-1 truncate">{f.name}</span>
                    {f.uses && <span className="text-xs text-ink-400">{f.uses.max - f.uses.used}/{f.uses.max}</span>}
                  </summary>
                  <div className="mt-1 max-h-60 overflow-y-auto pl-4"><Markdown text={f.description || "_No description._"} /></div>
                </details>
                {(f.subfeatures?.length ?? 0) > 0 && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-accent-600/40 pl-2">
                    {f.subfeatures!.map((s) => <SubFeatureRow key={s.id} s={s} />)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function RestButtons({ c, update }: { c: Character; update: Update }) {
  const [rest, setRest] = useState<"short" | "long" | null>(null);
  return (
    <>
      <button className="btn" onClick={() => setRest("short")} title="Spend hit dice; reset short-rest features, resources, spell uses and pact slots">☾ Short rest</button>
      <button className="btn" onClick={() => setRest("long")} title="Reset HP, all spell slots, features, resources and spell uses">☀ Long rest</button>
      {rest && <RestDialog c={c} update={update} kind={rest} onClose={() => setRest(null)} />}
    </>
  );
}

function exportJson(c: Character) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${c.name.replace(/\W+/g, "_") || "character"}.json` });
  a.click();
  URL.revokeObjectURL(url);
}
