import { useState } from "react";
import { addGrantedSpells, buildFeature, grantFeature, prepareGrantedSpells, replaceOrigin, sensesFromRace } from "../../lib/apply";
import { ALIGNMENTS, classSummary, totalLevel, xpForNextLevel, XP_THRESHOLDS } from "../../lib/rules";
import type { Character, ContentDetail, Selections } from "../../lib/types";
import type { SaveState, Update } from "../../lib/useCharacter";
import { ContentApplyDialog } from "../ChoicePicker";
import { Modal, NumberField, TextField } from "../ui";

export function SheetHeader({
  c, update, saveState, onLevelUp,
}: { c: Character; update: Update; saveState: SaveState; onLevelUp: () => void }) {
  const [picking, setPicking] = useState<"race" | "background" | null>(null);
  const [editingClasses, setEditingClasses] = useState(false);
  const level = totalLevel(c);
  const milestone = c.progression === "milestone";
  const [xpGain, setXpGain] = useState("");
  const canLevel = !milestone && level > 0 && level < 20 && c.xp >= XP_THRESHOLDS[level];

  const applyOrigin = async (det: ContentDetail, selections: Selections) => {
    const kind = picking!;
    const feature = await buildFeature(det, selections, kind === "race" ? "Race" : "Background", kind);
    const spells = await prepareGrantedSpells(det.grantedSpells, Math.max(1, level), kind);
    update((d) => {
      replaceOrigin(d, kind);
      const ref = { source: det.source, key: det.key, name: det.name };
      if (kind === "race") Object.assign(d, { race: det.name, raceRef: ref, senses: sensesFromRace(det) || d.senses });
      else Object.assign(d, { background: det.name, backgroundRef: ref });
      grantFeature(d, feature, det);
      addGrantedSpells(d, spells);
    });
  };

  return (
    <div className="panel grid items-start gap-x-6 gap-y-3 lg:grid-cols-[minmax(14rem,1fr)_2fr_auto]">
      <div className="min-w-0">
        <TextField
          className="field -ml-1.5 font-display text-2xl font-bold text-ink-200 sm:text-3xl"
          value={c.name}
          aria-label="Character name"
          onChange={(v) => update((d) => void (d.name = v))}
        />
        <button className="mt-0.5 text-left text-sm text-accent-400 hover:underline" onClick={() => setEditingClasses(true)} title="Edit classes manually">
          {classSummary(c.classes)} {level > 0 && <span className="text-ink-400">· Level {level}</span>}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <Labeled label="Race">
          <PickableText value={c.race} onChange={(v) => update((d) => void (d.race = v))} onPick={() => setPicking("race")} />
        </Labeled>
        <Labeled label="Background">
          <PickableText value={c.background} onChange={(v) => update((d) => void (d.background = v))} onPick={() => setPicking("background")} />
        </Labeled>
        <Labeled label="Alignment">
          <select className="field bg-ink-900" value={c.alignment} onChange={(e) => update((d) => void (d.alignment = e.target.value))}>
            <option value="">—</option>
            {ALIGNMENTS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Labeled>
        <Labeled label="Player">
          <TextField value={c.playerName} placeholder="—" onChange={(v) => update((d) => void (d.playerName = v))} />
        </Labeled>
        <div className="col-span-2 block">
          <span className="label flex items-center gap-2">
            {milestone ? "Milestone leveling" : `Experience${level < 20 && level > 0 ? ` (next: ${xpForNextLevel(c).toLocaleString()})` : ""}`}
            <button className="normal-case tracking-normal text-ink-600 hover:text-accent-400" onClick={() => update((d) => void (d.progression = milestone ? "xp" : "milestone"))}>
              switch to {milestone ? "XP" : "milestone"}
            </button>
          </span>
          {!milestone && (
            <div className="flex items-center gap-2">
              <NumberField className="field w-28" value={c.xp} min={0} onChange={(n) => update((d) => void (d.xp = n))} />
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); const n = parseInt(xpGain, 10); if (n) update((d) => void (d.xp = Math.max(0, d.xp + n))); setXpGain(""); }}>
                <input className="field-boxed w-20 py-0.5 text-xs" placeholder="+ XP" inputMode="numeric" value={xpGain} onChange={(e) => setXpGain(e.target.value.replace(/[^\d-]/g, ""))} />
              </form>
              {level > 0 && level < 20 && (
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800" title={`${c.xp} / ${xpForNextLevel(c)} XP`}>
                  <div className="h-full bg-accent-500" style={{ width: `${Math.min(100, ((c.xp - XP_THRESHOLDS[level - 1]) / (XP_THRESHOLDS[level] - XP_THRESHOLDS[level - 1])) * 100)}%` }} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 lg:flex-col lg:items-end">
        <button className={`btn-primary ${canLevel ? "animate-pulse" : ""}`} onClick={onLevelUp}>
          {level === 0 ? "Choose a class" : "▲ Level up"}
        </button>
        <span className="text-xs text-ink-600">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "All changes saved" : saveState === "error" ? <span className="text-blood-500">Save failed — retrying on next edit</span> : ""}
        </span>
      </div>

      {picking && (
        <ContentApplyDialog title={`Choose ${picking}`} type={picking} character={c} onClose={() => setPicking(null)} onApply={applyOrigin} />
      )}
      {editingClasses && <ClassesEditor c={c} update={update} onClose={() => setEditingClasses(false)} />}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function PickableText({ value, onChange, onPick }: { value: string; onChange: (v: string) => void; onPick: () => void }) {
  return (
    <div className="flex items-center">
      <TextField value={value} placeholder="—" onChange={onChange} />
      <button type="button" className="btn-ghost shrink-0 px-1.5 py-0.5 text-xs text-ink-400" title="Choose from rules" onClick={onPick}>📖</button>
    </div>
  );
}

/** Manual escape hatch: fix levels or subclasses without going through the wizard. */
function ClassesEditor({ c, update, onClose }: { c: Character; update: Update; onClose: () => void }) {
  return (
    <Modal title="Classes" onClose={onClose} footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <p className="mb-3 text-sm text-ink-400">
        Use <em>Level up</em> for guided choices. Here you can correct levels directly; features and HP won't be changed automatically.
      </p>
      {c.classes.length === 0 && <p className="text-sm text-ink-600">No classes yet.</p>}
      <div className="space-y-2">
        {c.classes.map((k, i) => (
          <div key={k.key} className="grid grid-cols-[1fr_4rem_5rem_1fr_auto] items-center gap-2">
            <span className="font-semibold">{k.name}</span>
            <NumberField className="field-boxed" value={k.level} min={1} max={20} onChange={(n) => update((d) => void (d.classes[i].level = n))} />
            <label className="flex items-center gap-1 text-xs text-ink-400">d<NumberField className="field-boxed" value={k.hitDie} min={4} max={12} onChange={(n) => update((d) => void (d.classes[i].hitDie = n))} /></label>
            <TextField
              className="field-boxed"
              placeholder="Subclass"
              value={k.subclass?.name ?? ""}
              onChange={(v) => update((d) => void (d.classes[i].subclass = v ? { source: "homebrew", key: v.toLowerCase(), ...d.classes[i].subclass, name: v } : undefined))}
            />
            <button className="btn-danger px-2" onClick={() => confirm(`Remove ${k.name}?`) && update((d) => void d.classes.splice(i, 1))}>✕</button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
