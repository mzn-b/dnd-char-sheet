import { useState } from "react";
import { api } from "../../lib/api";
import { uid } from "../../lib/defaults";
import type { Character, ContentSummary, Feature } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ContentPicker, contentId } from "../ContentBrowser";
import { Markdown, NumberField, Pips, Section, TextField } from "../ui";

const GROUPS: { kind: Feature["kind"][]; title: string }[] = [
  { kind: ["class", "subclass"], title: "Class Features" },
  { kind: ["race"], title: "Racial Traits" },
  { kind: ["background"], title: "Background" },
  { kind: ["feat"], title: "Feats" },
  { kind: ["other"], title: "Other" },
];

export function FeaturesTab({ c, update }: { c: Character; update: Update }) {
  const [picking, setPicking] = useState<"feat" | null>(null);
  const owned = new Set(c.features.filter((f) => f.ref).map((f) => contentId(f.ref!)));

  const addFeats = async (picked: ContentSummary[]) => {
    const details = await Promise.all(picked.map((p) => api.detail("feat", p.source, p.key)));
    update((d) => {
      for (const det of details) {
        d.features.push({
          id: uid(), name: det.name, origin: "Feat", kind: "feat", description: det.description,
          ref: { source: det.source, key: det.key, name: det.name, type: "feat" },
        });
      }
    });
    setPicking(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={() => setPicking("feat")}>Add feat</button>
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
              {items.map((f) => <FeatureCard key={f.id} f={f} update={update} />)}
            </div>
          </Section>
        );
      })}
      {c.features.length === 0 && <p className="panel text-sm text-ink-400">Features from your class, race, background and feats will appear here as you level up.</p>}
      {picking && <ContentPicker title="Choose a feat" type="feat" disabledIds={owned} onClose={() => setPicking(null)} onConfirm={addFeats} />}
    </div>
  );
}

function FeatureCard({ f, update }: { f: Feature; update: Update }) {
  const [editing, setEditing] = useState(false);
  const edit = (patch: Partial<Feature>) => update((d) => void Object.assign(d.features.find((x) => x.id === f.id)!, patch));
  return (
    <details className="group rounded-lg border border-ink-800 bg-ink-850/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="text-ink-600 transition group-open:rotate-90">›</span>
        <span className="flex-1 font-semibold">{f.name}</span>
        {f.uses && (
          <span onClick={(e) => e.preventDefault()}>
            <Pips max={f.uses.max} used={f.uses.used} onChange={(u) => edit({ uses: { ...f.uses!, used: u } })} title={`Resets on ${f.uses.reset} rest`} />
          </span>
        )}
        {f.origin && <span className="chip">{f.origin}</span>}
      </summary>
      <div className="space-y-2 border-t border-ink-800 p-3">
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
        <div className="flex justify-end gap-2">
          <button className="btn-ghost py-0.5 text-xs" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
          <button className="btn-danger py-0.5 text-xs" onClick={() => update((d) => void (d.features = d.features.filter((x) => x.id !== f.id)))}>Remove</button>
        </div>
      </div>
    </details>
  );
}
