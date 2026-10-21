import { useState } from "react";
import { applySubfeatureMechanics, buildFeature, grantFeature, resolveSubfeatures } from "../../lib/apply";
import { uid } from "../../lib/defaults";
import type { Character, ContentDetail, Feature, Selections, SubFeature } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ChoiceList, ContentApplyDialog } from "../ChoicePicker";
import { contentId } from "../ContentBrowser";
import { Markdown, Modal, NumberField, Pips, Section, TextField } from "../ui";

const GROUPS: { kind: Feature["kind"][]; title: string }[] = [
  { kind: ["class", "subclass"], title: "Class Features" },
  { kind: ["race"], title: "Racial Traits" },
  { kind: ["background"], title: "Background" },
  { kind: ["feat"], title: "Feats" },
  { kind: ["other"], title: "Other" },
];

export function FeaturesTab({ c, update }: { c: Character; update: Update }) {
  const [addingFeat, setAddingFeat] = useState(false);
  const owned = new Set(c.features.filter((f) => f.ref).map((f) => contentId(f.ref!)));

  const addFeat = async (det: ContentDetail, selections: Selections) => {
    const feature = await buildFeature(det, selections, "Feat", "feat");
    update((d) => grantFeature(d, feature, det));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={() => setAddingFeat(true)}>Add feat</button>
        <button
          className="btn"
          onClick={() => update((d) => void d.features.push({ id: uid(), name: "New feature", origin: "", kind: "other", description: "" }))}
        >
          + Custom feature
        </button>
      </div>
      {GROUPS.map((g) => {
        const items = c.features.filter((f) => g.kind.includes(f.kind));
        if (!items.length) return null;
        return (
          <Section key={g.title} title={g.title}>
            <div className="space-y-2">
              {items.map((f) => <FeatureCard key={f.id} f={f} c={c} update={update} />)}
            </div>
          </Section>
        );
      })}
      {c.features.length === 0 && <p className="panel text-sm text-ink-400">Features from your class, race, background and feats will appear here as you level up.</p>}
      {addingFeat && <ContentApplyDialog title="Add a feat" type="feat" character={c} disabledIds={owned} onClose={() => setAddingFeat(false)} onApply={addFeat} />}
    </div>
  );
}

function FeatureCard({ f, c, update }: { f: Feature; c: Character; update: Update }) {
  const [editing, setEditing] = useState(false);
  const [rechoosing, setRechoosing] = useState(false);
  const edit = (patch: Partial<Feature>) => update((d) => void Object.assign(d.features.find((x) => x.id === f.id)!, patch));
  const pending = (f.choices ?? []).filter((ch) => (f.subfeatures ?? []).filter((s) => s.choiceId === ch.id).length < Math.min(ch.count, ch.options.length));
  return (
    <details className="group rounded-lg border border-ink-800 bg-ink-850/40" open={pending.length > 0 || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="text-ink-600 transition group-open:rotate-90">›</span>
        <span className="flex-1 font-semibold">{f.name}</span>
        {pending.length > 0 && <span className="chip border-accent-600 text-accent-400">choice needed</span>}
        {f.uses && (
          <span onClick={(e) => e.preventDefault()}>
            <Pips max={f.uses.max} used={f.uses.used} onChange={(u) => edit({ uses: { ...f.uses!, used: u } })} title={`Resets on ${f.uses.reset} rest`} />
          </span>
        )}
        {f.origin && <span className="chip">{f.origin}</span>}
      </summary>
      <div className="space-y-3 border-t border-ink-800 p-3">
        {editing ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className="label">Name</span><TextField className="field-boxed" value={f.name} onChange={(v) => edit({ name: v })} /></label>
              <label><span className="label">Origin</span><TextField className="field-boxed" value={f.origin} onChange={(v) => edit({ origin: v })} /></label>
            </div>
            <textarea className="field-boxed resize-y" rows={6} value={f.description} onChange={(e) => edit({ description: e.target.value })} />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-accent-500" checked={!!f.uses} onChange={(e) => edit({ uses: e.target.checked ? { max: 1, used: 0, reset: "long" } : undefined })} />
                Limited uses
              </label>
              {f.uses && (
                <>
                  <NumberField className="field-boxed w-16" value={f.uses.max} min={1} onChange={(n) => edit({ uses: { ...f.uses!, max: n } })} />
                  <select className="field-boxed w-auto" value={f.uses.reset} onChange={(e) => edit({ uses: { ...f.uses!, reset: e.target.value as "short" | "long" } })}>
                    <option value="short">per short rest</option>
                    <option value="long">per long rest</option>
                  </select>
                </>
              )}
            </div>
          </>
        ) : (
          <Markdown text={f.description || "_No description._"} />
        )}

        {(f.subfeatures?.length ?? 0) > 0 && (
          <div className="space-y-1.5 border-l-2 border-accent-600/50 pl-3">
            {f.subfeatures!.map((s) => <SubFeatureRow key={s.id} s={s} onRemove={() => update((d) => removeSubfeature(d, f.id, s.id))} />)}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {(f.choices?.length ?? 0) > 0 && (
            <button className={pending.length ? "btn-primary py-0.5 text-xs" : "btn-ghost py-0.5 text-xs"} onClick={() => setRechoosing(true)}>
              {pending.length ? "Make choices" : "Change choices"}
            </button>
          )}
          <button className="btn-ghost py-0.5 text-xs" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
          <button
            className="btn-danger py-0.5 text-xs"
            onClick={() =>
              update((d) => {
                applySubfeatureMechanics(d, f.choices ?? [], f.subfeatures ?? [], -1);
                d.features = d.features.filter((x) => x.id !== f.id);
              })
            }
          >
            Remove
          </button>
        </div>
      </div>
      {rechoosing && <RechooseDialog f={f} c={c} update={update} onClose={() => setRechoosing(false)} />}
    </details>
  );
}

export function SubFeatureRow({ s, onRemove }: { s: SubFeature; onRemove?: () => void }) {
  return (
    <details className="group/sub">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
        <span className="text-accent-500">◆</span>
        <span className="flex-1 hover:text-accent-400">{s.name}</span>
        {onRemove && (
          <button className="btn-ghost px-1.5 py-0 text-xs opacity-0 hover:text-blood-500 group-hover/sub:opacity-100" title="Remove choice" onClick={(e) => { e.preventDefault(); onRemove(); }}>✕</button>
        )}
      </summary>
      {s.description && <div className="mt-1 pl-5"><Markdown text={s.description} /></div>}
    </details>
  );
}

function removeSubfeature(d: Character, featureId: string, subId: string) {
  const feat = d.features.find((x) => x.id === featureId);
  const sub = feat?.subfeatures?.find((s) => s.id === subId);
  if (!feat || !sub) return;
  applySubfeatureMechanics(d, feat.choices ?? [], [sub], -1);
  feat.subfeatures = feat.subfeatures!.filter((s) => s.id !== subId);
}

/** Re-pick a feature's choices at any time (e.g. retraining a Fighting Style). */
function RechooseDialog({ f, c, update, onClose }: { f: Feature; c: Character; update: Update; onClose: () => void }) {
  const initial: Selections = Object.fromEntries((f.choices ?? []).map((ch) => [ch.id, (f.subfeatures ?? []).filter((s) => s.choiceId === ch.id).map((s) => s.key)]));
  const [selections, setSelections] = useState<Selections>(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const kept = (f.subfeatures ?? []).filter((s) => selections[s.choiceId]?.includes(s.key));
    const removed = (f.subfeatures ?? []).filter((s) => !kept.includes(s));
    const added = Object.fromEntries(Object.entries(selections).map(([id, keys]) => [id, keys.filter((k) => !kept.some((s) => s.choiceId === id && s.key === k))]));
    const newSubs = await resolveSubfeatures(f.choices ?? [], added);
    update((d) => {
      const feat = d.features.find((x) => x.id === f.id)!;
      applySubfeatureMechanics(d, f.choices ?? [], removed, -1);
      applySubfeatureMechanics(d, f.choices ?? [], newSubs, 1);
      feat.subfeatures = [...kept, ...newSubs];
    });
    setBusy(false);
    onClose();
  };
  return (
    <Modal wide title={`${f.name}: choices`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <ChoiceList choices={f.choices ?? []} selections={selections} onChange={setSelections} character={c} />
    </Modal>
  );
}
