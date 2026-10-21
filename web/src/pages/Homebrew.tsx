import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ABILITY_NAMES, SKILLS } from "../lib/rules";
import { ABILITIES, type Ability, type Choice, type ContentDetail, type ContentType, type Effect } from "../lib/types";
import { DetailBody } from "../components/ContentBrowser";
import { Modal, NumberField, Spinner, TextField } from "../components/ui";

const TYPES: { type: ContentType; label: string }[] = [
  { type: "spell", label: "Spells" },
  { type: "feat", label: "Feats" },
  { type: "item", label: "Items" },
  { type: "feature", label: "Features" },
  { type: "subclass", label: "Subclasses" },
  { type: "class", label: "Classes" },
  { type: "race", label: "Races" },
  { type: "background", label: "Backgrounds" },
];

const SRD_CLASSES = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];

/** Homebrew entries share the normalized content shape, plus a few type-specific fields. */
type Draft = Partial<ContentDetail> & {
  featureLevels?: { level: number; key: string; name: string }[];
  asiLevels?: number[];
  spellProgressionFrom?: string;
  savingThrows?: Ability[];
};

const blank = (type: ContentType): Draft => ({ type, name: "", description: "", meta: {}, effects: [], classes: [] });

export default function Homebrew() {
  const qc = useQueryClient();
  const [type, setType] = useState<ContentType>("spell");
  const [editing, setEditing] = useState<Draft | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["homebrew", type], queryFn: () => api.listHomebrew(type) });
  const del = useMutation({
    mutationFn: api.deleteHomebrew,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homebrew"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Homebrew Workshop</h1>
          <p className="text-sm text-ink-400">Anything you create here shows up next to official content in every picker and in the level-up wizard.</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(blank(type))}>+ New {type}</button>
      </div>

      <div className="flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <button key={t.type} onClick={() => setType(t.type)} className={`rounded-lg px-3 py-1.5 text-sm ${type === t.type ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Spinner />}
      {data?.length === 0 && <div className="panel py-10 text-center text-sm text-ink-400">No homebrew {type}s yet.</div>}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((d) => (
          <div key={d.key} className="panel space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-lg">{d.name}</h3>
              <div className="flex gap-1">
                <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setEditing(d as Draft)}>Edit</button>
                <button className="btn-ghost px-2 py-0.5 text-xs hover:text-blood-500" onClick={() => confirm(`Delete ${d.name}?`) && del.mutate(d.key)}>Delete</button>
              </div>
            </div>
            <div className="max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
              <DetailBody detail={d} />
            </div>
          </div>
        ))}
      </div>

      {editing && <HomebrewEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HomebrewEditor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(structuredClone(initial));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setMeta = (k: string, v: string) => set({ meta: { ...d.meta, [k]: v } });
  const save = useMutation({
    mutationFn: () => api.saveHomebrew(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homebrew"] });
      qc.invalidateQueries({ queryKey: ["content"] });
      qc.invalidateQueries({ queryKey: ["detail"] });
      qc.invalidateQueries({ queryKey: ["classRules"] });
      onClose();
    },
  });
  const homebrewFeatures = useQuery({ queryKey: ["homebrew", "feature"], queryFn: () => api.listHomebrew("feature"), enabled: d.type === "class" || d.type === "subclass" });

  const field = (label: string, el: React.ReactNode, wide = false) => (
    <label className={`space-y-1 ${wide ? "col-span-full" : ""}`}><span className="label">{label}</span>{el}</label>
  );
  const metaField = (k: string, placeholder = "") =>
    field(k, <TextField className="field-boxed" placeholder={placeholder} value={d.meta?.[k] ?? ""} onChange={(v) => setMeta(k, v)} />);

  return (
    <Modal
      wide
      title={`${initial.key ? "Edit" : "New"} homebrew ${d.type}`}
      onClose={onClose}
      footer={
        <>
          {save.error && <span className="mr-auto text-sm text-blood-500">{(save.error as Error).message}</span>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!d.name?.trim() || save.isPending} onClick={() => save.mutate()}>Save</button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field("Name", <TextField className="field-boxed" value={d.name ?? ""} onChange={(v) => set({ name: v })} autoFocus />)}

        {d.type === "spell" && (
          <>
            {field("Level", <select className="field-boxed" value={d.level ?? 0} onChange={(e) => set({ level: Number(e.target.value), meta: { ...d.meta, Level: e.target.value === "0" ? "Cantrip" : e.target.value } })}>
              {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i === 0 ? "Cantrip" : `Level ${i}`}</option>)}
            </select>)}
            {field("School", <TextField className="field-boxed" placeholder="Evocation" value={d.spell?.school ?? ""} onChange={(v) => set({ spell: { ...d.spell, school: v } })} />)}
            {metaField("Casting Time", "1 action")}
            {metaField("Range", "60 feet")}
            {metaField("Components", "V, S, M (a pinch of salt)")}
            {metaField("Duration", "Instantaneous")}
            <div className="col-span-full flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent-500" checked={!!d.spell?.concentration} onChange={(e) => set({ spell: { ...d.spell, concentration: e.target.checked } })} />Concentration</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-accent-500" checked={!!d.spell?.ritual} onChange={(e) => set({ spell: { ...d.spell, ritual: e.target.checked } })} />Ritual</label>
            </div>
            <ClassChecklist label="Available to classes" value={d.classes ?? []} onChange={(classes) => set({ classes })} />
          </>
        )}

        {d.type === "feat" && field("Prerequisite", <TextField className="field-boxed" placeholder="Dexterity 13 or higher" value={d.prerequisite ?? ""} onChange={(v) => set({ prerequisite: v })} />)}

        {d.type === "item" && (
          <>
            {metaField("Category", "Weapon, Armor, Wondrous item…")}
            {metaField("Weight", "3 lb")}
            {metaField("Damage", "1d8 Slashing")}
            {metaField("Properties", "Finesse, Light")}
            {metaField("Cost", "50 gp")}
            {metaField("Rarity", "Uncommon")}
          </>
        )}

        {d.type === "race" && (
          <>
            {metaField("Speed", "30 ft")}
            {metaField("Size", "Medium")}
          </>
        )}

        {d.type === "subclass" && (
          <ClassChecklist label="Parent class" value={d.classes ?? []} onChange={(classes) => set({ classes })} />
        )}

        {d.type === "class" && (
          <>
            {field("Hit die", <select className="field-boxed" value={d.hitDie ?? 8} onChange={(e) => set({ hitDie: Number(e.target.value) })}>{[6, 8, 10, 12].map((n) => <option key={n} value={n}>d{n}</option>)}</select>)}
            {field("Subclass at level", <NumberField className="field-boxed" value={d.subclassLevel ?? 3} min={1} max={20} onChange={(n) => set({ subclassLevel: n })} />)}
            {field("Spellcasting ability", <select className="field-boxed" value={d.spellcastingAbility ?? ""} onChange={(e) => set({ spellcastingAbility: (e.target.value || null) as Ability | null })}>
              <option value="">None</option>
              {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}
            </select>)}
            {field("Spell slot progression", <select className="field-boxed" value={d.spellProgressionFrom ?? ""} onChange={(e) => set({ spellProgressionFrom: e.target.value || undefined, casterType: ({ "": "none", paladin: "half", ranger: "half", warlock: "pact" } as Record<string, any>)[e.target.value] ?? "full" })}>
              <option value="">None / track manually</option>
              {["wizard", "cleric", "bard", "sorcerer", "druid", "paladin", "ranger", "warlock"].map((k) => <option key={k} value={k}>Same as {k}</option>)}
            </select>)}
            {field("ASI levels", <TextField className="field-boxed" value={(d.asiLevels ?? [4, 8, 12, 16, 19]).join(", ")} onChange={(v) => set({ asiLevels: v.split(/[,\s]+/).map(Number).filter(Boolean) })} />)}
            <div className="space-y-1">
              <span className="label">Saving throw proficiencies</span>
              <div className="flex flex-wrap gap-2 text-sm">
                {ABILITIES.map((a) => (
                  <label key={a} className="flex items-center gap-1 uppercase">
                    <input type="checkbox" className="accent-accent-500" checked={d.savingThrows?.includes(a) ?? false} onChange={(e) => set({ savingThrows: e.target.checked ? [...(d.savingThrows ?? []), a] : d.savingThrows?.filter((x) => x !== a) })} />
                    {a}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {(d.type === "class" || d.type === "subclass") && (
          <div className="col-span-full space-y-2">
            <span className="label">Features by level</span>
            <p className="text-xs text-ink-400">Create the features under <em>Features</em> first, then attach them to levels here.</p>
            {(d.featureLevels ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <NumberField className="field-boxed w-20" value={f.level} min={1} max={20} onChange={(n) => set({ featureLevels: d.featureLevels!.map((x, j) => (j === i ? { ...x, level: n } : x)) })} />
                <select className="field-boxed" value={f.key} onChange={(e) => { const hf = homebrewFeatures.data?.find((x) => x.key === e.target.value); if (hf) set({ featureLevels: d.featureLevels!.map((x, j) => (j === i ? { ...x, key: hf.key, name: hf.name } : x)) }); }}>
                  <option value="">Select a feature…</option>
                  {homebrewFeatures.data?.map((hf) => <option key={hf.key} value={hf.key}>{hf.name}</option>)}
                </select>
                <button className="btn-ghost px-2" onClick={() => set({ featureLevels: d.featureLevels!.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn text-xs" onClick={() => set({ featureLevels: [...(d.featureLevels ?? []), { level: 1, key: "", name: "" }] })}>+ Feature at level</button>
          </div>
        )}

        {field("Description (supports **bold**, *italic* and - bullet lists)", (
          <textarea className="field-boxed resize-y font-mono text-sm" rows={10} value={d.description ?? ""} onChange={(e) => set({ description: e.target.value })} />
        ), true)}

        {(d.type === "feat" || d.type === "race") && (
          <EffectsEditor effects={d.effects ?? []} onChange={(effects) => set({ effects })} />
        )}

        {["feat", "feature", "race", "background"].includes(d.type ?? "") && (
          <ChoicesEditor choices={d.choices ?? []} onChange={(choices) => set({ choices })} />
        )}
      </div>
    </Modal>
  );
}

function ClassChecklist({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="col-span-full space-y-1">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {SRD_CLASSES.map((k) => {
          const on = value.includes(k);
          return (
            <button key={k} type="button" className={`chip capitalize ${on ? "border-accent-600 text-accent-400" : ""}`} onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}>
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Machine-applied effects: ability score bonuses are applied automatically when picked. */
function EffectsEditor({ effects, onChange }: { effects: Effect[]; onChange: (e: Effect[]) => void }) {
  const abilityEffects = effects.filter((e): e is Extract<Effect, { kind: "ability" }> => e.kind === "ability");
  return (
    <div className="col-span-full space-y-2">
      <span className="label">Ability score increases (applied automatically)</span>
      <div className="flex flex-wrap gap-2">
        {abilityEffects.map((e, i) => (
          <div key={i} className="flex items-center gap-1 rounded-lg border border-ink-700 p-1">
            <select className="field bg-ink-900 uppercase" value={e.ability} onChange={(ev) => onChange(effects.map((x) => (x === e ? { ...e, ability: ev.target.value as Ability } : x)))}>
              {ABILITIES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <NumberField className="field w-10 text-center" value={e.amount} onChange={(n) => onChange(effects.map((x) => (x === e ? { ...e, amount: n } : x)))} />
            <button className="btn-ghost px-1.5 py-0 text-xs" onClick={() => onChange(effects.filter((x) => x !== e))}>✕</button>
          </div>
        ))}
        <button className="btn text-xs" onClick={() => onChange([...effects, { kind: "ability", ability: "str", amount: 1 }])}>+ Ability bonus</button>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<Choice["kind"], string> = {
  feature: "Options with their own text (like Fighting Styles)",
  text: "Simple labels (like a favored enemy type)",
  skill: "Skill proficiencies",
  expertise: "Skill expertise",
  ability: "Ability score increases",
  save: "Saving throw proficiency",
};

/** Built-in choices: picks become sub-features on the character sheet. */
function ChoicesEditor({ choices, onChange }: { choices: Choice[]; onChange: (c: Choice[]) => void }) {
  const edit = (i: number, patch: Partial<Choice>) => onChange(choices.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const withDefaults = (kind: Choice["kind"]): Choice["options"] =>
    kind === "skill" || kind === "expertise" ? SKILLS.map((s) => ({ key: s.key, name: s.name }))
    : kind === "ability" || kind === "save" ? ABILITIES.map((a) => ({ key: a, name: a.toUpperCase() }))
    : [];
  return (
    <div className="col-span-full space-y-2">
      <span className="label">Choices (picked when this is gained; shown as sub-features)</span>
      {choices.map((ch, i) => (
        <div key={ch.id} className="space-y-2 rounded-lg border border-ink-700 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_5rem_auto]">
            <TextField className="field-boxed" placeholder="Choose a combat technique" value={ch.label} onChange={(v) => edit(i, { label: v })} />
            <select className="field-boxed w-auto" value={ch.kind} onChange={(e) => { const kind = e.target.value as Choice["kind"]; edit(i, { kind, options: withDefaults(kind).length ? withDefaults(kind) : ch.options }); }}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label className="flex items-center gap-1 text-xs text-ink-400">pick<NumberField className="field-boxed text-center" value={ch.count} min={1} onChange={(n) => edit(i, { count: n })} /></label>
            <button className="btn-ghost px-2" onClick={() => onChange(choices.filter((_, j) => j !== i))}>✕</button>
          </div>
          {ch.kind === "ability" && (
            <label className="flex items-center gap-2 text-sm">Increase by<NumberField className="field-boxed w-14 text-center" value={ch.amount ?? 1} min={1} onChange={(n) => edit(i, { amount: n })} /></label>
          )}
          {(ch.kind === "feature" || ch.kind === "text") && (
            <div className="space-y-2">
              {ch.options.map((o, oi) => (
                <div key={o.key} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
                  <TextField className="field-boxed" placeholder="Option name" value={o.name} onChange={(v) => edit(i, { options: ch.options.map((x, j) => (j === oi ? { ...x, name: v } : x)) })} />
                  {ch.kind === "feature" ? (
                    <textarea className="field-boxed resize-y text-sm" rows={2} placeholder="What it does" value={o.description ?? ""} onChange={(e) => edit(i, { options: ch.options.map((x, j) => (j === oi ? { ...x, description: e.target.value } : x)) })} />
                  ) : <span />}
                  <button className="btn-ghost px-2" onClick={() => edit(i, { options: ch.options.filter((_, j) => j !== oi) })}>✕</button>
                </div>
              ))}
              <button className="btn text-xs" onClick={() => edit(i, { options: [...ch.options, { key: crypto.randomUUID(), name: "" }] })}>+ Option</button>
            </div>
          )}
        </div>
      ))}
      <button className="btn text-xs" onClick={() => onChange([...choices, { id: crypto.randomUUID(), label: "Choose one", kind: "feature", count: 1, options: [] }])}>+ Choice</button>
    </div>
  );
}
