import { ActionBadge } from "../ActionBadge";
import { featureKind } from "../../lib/economy";
import { classResources } from "../../lib/resources";
import { formulaLabel, usesMax } from "../../lib/uses";
import { spellLevelLabel } from "../../lib/rules";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Pips, Section } from "../ui";

/** "☾ short rest" / "☀ long rest": when something comes back. */
export function ResetTag({ reset }: { reset: "short" | "long" }) {
  return <span className="whitespace-nowrap text-xs text-ink-600">{reset === "short" ? "☾ short rest" : "☀ long rest"}</span>;
}

/** Class resources (derived), spell slots, limited-use features and innate spells. */
export function ResourcesPanel({ c, update }: { c: Character; update: Update }) {
  const resources = classResources(c);
  const limited = c.features.filter((f) => f.uses);
  const spellUses = c.spellcasting.spells.filter((s) => s.uses && parseInt(s.uses, 10));
  const slots = c.spellcasting.slots.map((x, i) => ({ ...x, level: i + 1 })).filter((x) => x.max > 0);
  const pact = c.spellcasting.pactSlots;
  if (!resources.length && !limited.length && !spellUses.length && !slots.length && !pact.max) return null;
  const used = (id: string) => c.resourcesUsed?.[id] ?? 0;
  const setUsed = (id: string, n: number) => update((d) => void (d.resourcesUsed = { ...d.resourcesUsed, [id]: n }));
  return (
    <Section title="Resources">
      <ul className="space-y-2">
        {pact.max > 0 && (
          <li className="flex items-center gap-2 text-sm">
            <span className="flex-1">Pact slots <span className="text-xs text-ink-400">({spellLevelLabel(pact.level)})</span> <ResetTag reset="short" /></span>
            <Pips max={pact.max} used={pact.used} color="bg-arcane-400" onChange={(u) => update((d) => void (d.spellcasting.pactSlots.used = u))} title={`${pact.max - pact.used} of ${pact.max} left`} />
          </li>
        )}
        {slots.map((x) => (
          <li key={x.level} className="flex items-center gap-2 text-sm">
            <span className="flex-1">Spell slots <span className="text-xs text-ink-400">({spellLevelLabel(x.level)})</span> <ResetTag reset="long" /></span>
            <Pips max={x.max} used={x.used} color="bg-arcane-500" onChange={(u) => update((d) => void (d.spellcasting.slots[x.level - 1].used = u))} title={`${x.max - x.used} of ${x.max} left`} />
          </li>
        ))}
        {resources.map((r) => {
          const left = Math.max(0, r.max - used(r.id));
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                <ActionBadge kind={featureKind(c, c.features.find((f) => f.name.toLowerCase() === r.name.toLowerCase()) ?? { name: r.name, description: "" })} /> {r.name} {r.die && <span className="text-xs text-ink-400">{r.die}</span>} <ResetTag reset={r.reset === "short" ? "short" : "long"} />
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
                <ActionBadge kind={featureKind(c, f)} /> {f.name} {f.uses!.formula && typeof f.uses!.formula !== "number" && <span className="text-xs text-ink-400">{formulaLabel(f.uses!.formula)}</span>} <ResetTag reset={f.uses!.reset === "short" ? "short" : "long"} />
              </span>
              <Pips max={max} used={Math.min(f.uses!.used, max)} onChange={(u) => update((d) => void (d.features.find((x) => x.id === f.id)!.uses!.used = u))} />
            </li>
          );
        })}
        {spellUses.map((s) => {
          const max = parseInt(s.uses!, 10) || 1;
          return (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{s.ref.name} <span className="text-xs text-ink-400">free cast</span> <ResetTag reset={/short/.test(s.uses!) ? "short" : "long"} /></span>
              <Pips max={max} used={Math.min(s.usesSpent ?? 0, max)} color="bg-arcane-500" onChange={(u) => update((d) => void (d.spellcasting.spells.find((x) => x.id === s.id)!.usesSpent = u))} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
