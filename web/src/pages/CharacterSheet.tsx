import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCharacter } from "../lib/useCharacter";
import { SheetHeader } from "../components/sheet/SheetHeader";
import { AbilitiesPanel } from "../components/sheet/AbilitiesPanel";
import { CombatPanel } from "../components/sheet/CombatPanel";
import { AttacksPanel } from "../components/sheet/AttacksPanel";
import { SpellsTab } from "../components/sheet/SpellsTab";
import { InventoryTab } from "../components/sheet/InventoryTab";
import { FeaturesTab } from "../components/sheet/FeaturesTab";
import { BioTab } from "../components/sheet/BioTab";
import { HistoryTab } from "../components/sheet/HistoryTab";
import { LevelUpWizard } from "../components/levelup/LevelUpWizard";
import { Markdown, Section, Spinner, TextArea } from "../components/ui";
import type { Character } from "../lib/types";
import type { Update } from "../lib/useCharacter";

const TABS = ["Overview", "Spells", "Inventory", "Features", "Bio & Notes", "History"] as const;
type Tab = (typeof TABS)[number];

export default function CharacterSheet() {
  const { id } = useParams<{ id: string }>();
  const { character: c, update, saveState, isLoading, error } = useCharacter(id!);
  const [tab, setTab] = useState<Tab>("Overview");
  const [levelingUp, setLevelingUp] = useState(false);

  if (isLoading || (!c && !error)) return <Spinner label="Opening character sheet…" />;
  if (error || !c) return <p className="text-blood-500">Couldn't load character. <Link to="/" className="underline">Back to list</Link></p>;

  return (
    <div className="space-y-4">
      <SheetHeader c={c} update={update} saveState={saveState} onLevelUp={() => setLevelingUp(true)} />

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
          <RestButtons update={update} />
          <button className="btn-ghost text-xs" onClick={() => exportJson(c)}>Export</button>
        </div>
      </div>

      {tab === "Overview" && <Overview c={c} update={update} />}
      {tab === "Spells" && <SpellsTab c={c} update={update} />}
      {tab === "Inventory" && <InventoryTab c={c} update={update} />}
      {tab === "Features" && <FeaturesTab c={c} update={update} />}
      {tab === "Bio & Notes" && <BioTab c={c} update={update} />}
      {tab === "History" && <HistoryTab c={c} />}

      {levelingUp && <LevelUpWizard c={c} update={update} onClose={() => setLevelingUp(false)} />}
    </div>
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
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function RestButtons({ update }: { update: Update }) {
  const shortRest = () =>
    update((d) => {
      for (const f of d.features) if (f.uses?.reset === "short") f.uses.used = 0;
      d.spellcasting.pactSlots.used = 0;
    });
  const longRest = () =>
    update((d) => {
      d.hp.current = d.hp.max;
      d.hp.temp = 0;
      d.deathSaves = { successes: 0, failures: 0 };
      d.exhaustion = Math.max(0, d.exhaustion - 1);
      for (const s of d.spellcasting.slots) s.used = 0;
      d.spellcasting.pactSlots.used = 0;
      for (const f of d.features) if (f.uses) f.uses.used = 0;
      // Regain spent hit dice up to half your total (minimum 1), largest dice first.
      let regain = Math.max(1, Math.floor(d.classes.reduce((s, k) => s + k.level, 0) / 2));
      for (const die of Object.keys(d.hitDiceUsed).sort((a, b) => Number(b) - Number(a))) {
        const back = Math.min(regain, d.hitDiceUsed[die]);
        d.hitDiceUsed[die] -= back;
        regain -= back;
      }
    });
  return (
    <>
      <button className="btn-ghost text-xs" onClick={shortRest} title="Reset short-rest features and pact slots">☾ Short rest</button>
      <button className="btn-ghost text-xs" onClick={() => confirm("Take a long rest? HP, slots and features reset.") && longRest()}>☀ Long rest</button>
    </>
  );
}

function exportJson(c: Character) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${c.name.replace(/\W+/g, "_") || "character"}.json` });
  a.click();
  URL.revokeObjectURL(url);
}
