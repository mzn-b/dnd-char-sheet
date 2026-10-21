import { ActionBadge } from "../ActionBadge";
import { featureKind } from "../../lib/economy";
import { classResources } from "../../lib/resources";
import { formulaLabel, usesMax } from "../../lib/uses";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Pips, Section } from "../ui";

/** Class resources (derived) plus limited-use features and innate spells. */
export function ResourcesPanel({ c, update }: { c: Character; update: Update }) {
  const resources = classResources(c);
  const limited = c.features.filter((f) => f.uses);
  const spellUses = c.spellcasting.spells.filter((s) => s.uses && parseInt(s.uses, 10));
  if (!resources.length && !limited.length && !spellUses.length) return null;
  const used = (id: string) => c.resourcesUsed?.[id] ?? 0;
  const setUsed = (id: string, n: number) => update((d) => void (d.resourcesUsed = { ...d.resourcesUsed, [id]: n }));
  return (
    <Section title="Resources" action={<span className="text-[10px] text-ink-600">reset by short ☾ / long ☀ rest</span>}>
      <ul className="space-y-2">
        {resources.map((r) => {
          const left = Math.max(0, r.max - used(r.id));
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <ActionBadge kind={featureKind(c, c.features.find((f) => f.name.toLowerCase() === r.name.toLowerCase()) ?? { name: r.name, description: "" })} /> {r.name} <span className="text-xs text-ink-600">{r.reset === "short" ? "☾" : "☀"}{r.die ? ` · ${r.die}` : ""}</span>
              </span>
              {r.max >= 99 ? (
                <span className="text-xs text-emerald-400">unlimited</span>
              ) : r.pool || r.max > 8 ? (
                <span className="flex items-center gap-1">
                  <button className="btn px-1.5 py-0 text-xs" disabled={!left} onClick={() => setUsed(r.id, used(r.id) + 1)}>−</button>
                  <NumberField className="field w-10 text-center" value={left} min={0} max={r.max} onChange={(n) => setUsed(r.id, r.max - n)} />
                  <span className="text-xs text-ink-400">/ {r.max}</span>
                  <button className="btn px-1.5 py-0 text-xs" disabled={!used(r.id)} onClick={() => setUsed(r.id, used(r.id) - 1)}>+</button>
                </span>
              ) : (
                <Pips max={r.max} used={used(r.id)} onChange={(u) => setUsed(r.id, u)} title={`${left} of ${r.max} left`} />
              )}
            </li>
          );
        })}
        {limited.map((f) => {
          const max = usesMax(c, f.uses!.formula, f.uses!.max);
          return (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">
                <ActionBadge kind={featureKind(c, f)} /> {f.name} <span className="text-xs text-ink-600">{f.uses!.reset === "short" ? "☾" : "☀"}{f.uses!.formula && typeof f.uses!.formula !== "number" ? ` · ${formulaLabel(f.uses!.formula)}` : ""}</span>
              </span>
              <Pips max={max} used={Math.min(f.uses!.used, max)} onChange={(u) => update((d) => void (d.features.find((x) => x.id === f.id)!.uses!.used = u))} />
            </li>
          );
        })}
        {spellUses.map((s) => {
          const max = parseInt(s.uses!, 10) || 1;
          return (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{s.ref.name} <span className="text-xs text-ink-600">{/short/.test(s.uses!) ? "☾" : "☀"} · free cast</span></span>
              <Pips max={max} used={Math.min(s.usesSpent ?? 0, max)} color="bg-arcane-500" onChange={(u) => update((d) => void (d.spellcasting.spells.find((x) => x.id === s.id)!.usesSpent = u))} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
