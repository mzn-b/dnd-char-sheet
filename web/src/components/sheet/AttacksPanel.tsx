import { abilityMod, fmt, profBonus } from "../../lib/rules";
import { ABILITIES, type Attack, type Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Section, TextField } from "../ui";
import { d20, withBonus } from "../../lib/dice";
import { blankAttackFields } from "../../lib/attacks";
import { activeRollBonus } from "../../lib/combat";
import { RollButton, useRoll } from "../dice";

export const attackBonus = (c: Character, a: Attack) =>
  (a.ability === "none" ? 0 : abilityMod(c, a.ability)) + (a.proficient ? profBonus(c) : 0) + a.bonus;

export const damageBonus = (c: Character, a: Attack) => (a.ability === "none" ? 0 : abilityMod(c, a.ability));

/** To-hit and damage roll buttons. Damage doubles its dice if the last roll was a crit with this attack. */
export function AttackRolls({ c, a, size = "text-sm" }: { c: Character; a: Attack; size?: string }) {
  const { log } = useRoll();
  const last = log[0];
  const crit = !!last && last.label.startsWith(`${a.name || "Attack"}: to hit`) && !!last.crit && Date.now() - last.at < 120_000;
  const extra = activeRollBonus(c, "attack");
  return (
    <span className="inline-flex items-center gap-1">
      <RollButton
        expression={d20(attackBonus(c, a)) + (extra ? `+${extra.dice}` : "")}
        label={`${a.name || "Attack"}: to hit${extra ? ` (+${extra.names.join(", ")})` : ""}`}
        kind="attack"
        className={`font-semibold text-accent-400 ${size}`}
      >
        {fmt(attackBonus(c, a))}{extra && <span className="text-xs text-arcane-400"> +{extra.dice}</span>}
      </RollButton>
      {a.damage && (
        <RollButton
          expression={withBonus(a.damage, damageBonus(c, a))}
          label={`${a.name || "Attack"}: ${crit ? "critical " : ""}damage${a.damageType ? ` (${a.damageType})` : ""}`}
          kind="damage"
          critical={crit}
          className={`${size} ${crit ? "text-emerald-400" : "text-blood-500"}`}
        >
          {crit ? "💥 " : ""}{withBonus(a.damage, damageBonus(c, a))}
        </RollButton>
      )}
    </span>
  );
}

export { blankAttackFields as blankAttack } from "../../lib/attacks";

export function AttacksPanel({ c, update }: { c: Character; update: Update }) {
  const edit = (id: string, patch: Partial<Attack>) =>
    update((d) => void Object.assign(d.attacks.find((a) => a.id === id)!, patch));

  return (
    <Section
      title="Attacks & Spellcasting"
      action={<button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => update((d) => void d.attacks.push(blankAttackFields()))}>+ Add</button>}
    >
      {c.attacks.length === 0 ? (
        <p className="text-sm text-ink-600">No attacks yet. Add one, or create one from a weapon in your inventory.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_4.5rem_3rem_1fr_1.5rem] gap-1 px-1 text-[10px] uppercase tracking-wider text-ink-600">
            <span>Name</span><span>Ability</span><span>Bonus</span><span>Damage / Type</span><span />
          </div>
          {c.attacks.map((a) => (
            <details key={a.id} className="group rounded-lg border border-ink-800 bg-ink-850/50">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_4.5rem_3rem_1fr_1.5rem] items-center gap-1 p-1">
                <TextField value={a.name} placeholder="Longsword" onChange={(v) => edit(a.id, { name: v })} onClick={(e) => e.preventDefault()} />
                <select
                  className="field bg-ink-850 text-xs uppercase"
                  value={a.ability}
                  onClick={(e) => e.preventDefault()}
                  onChange={(e) => edit(a.id, { ability: e.target.value as Attack["ability"] })}
                >
                  {ABILITIES.map((x) => <option key={x} value={x}>{x}</option>)}
                  <option value="none">—</option>
                </select>
                <span className="text-center" onClick={(e) => e.preventDefault()}>
                  <RollButton expression={d20(attackBonus(c, a))} label={`${a.name || "Attack"}: to hit`} kind="attack" className="font-semibold text-accent-400">{fmt(attackBonus(c, a))}</RollButton>
                </span>
                <span className="truncate text-sm" onClick={(e) => e.preventDefault()}>
                  {a.damage ? (
                    <RollButton expression={withBonus(a.damage, damageBonus(c, a))} label={`${a.name || "Attack"}: damage`} kind="damage">
                      {withBonus(a.damage, damageBonus(c, a))}
                    </RollButton>
                  ) : null}
                  {a.damageType && <span className="text-ink-400"> {a.damageType}</span>}
                </span>
                <span className="text-center text-ink-600 transition group-open:rotate-90">›</span>
              </summary>
              <div className="grid grid-cols-2 gap-2 border-t border-ink-800 p-2 text-sm sm:grid-cols-4">
                <label className="space-y-0.5"><span className="label">Damage dice</span><TextField className="field-boxed" value={a.damage} placeholder="1d8" onChange={(v) => edit(a.id, { damage: v })} /></label>
                <label className="space-y-0.5"><span className="label">Damage type</span><TextField className="field-boxed" value={a.damageType} placeholder="slashing" onChange={(v) => edit(a.id, { damageType: v })} /></label>
                <label className="space-y-0.5"><span className="label">Extra bonus</span><NumberField className="field-boxed" value={a.bonus} onChange={(n) => edit(a.id, { bonus: n })} /></label>
                <label className="flex items-end gap-2 pb-2"><input type="checkbox" className="accent-accent-500" checked={a.proficient} onChange={(e) => edit(a.id, { proficient: e.target.checked })} />Proficient</label>
                <label className="col-span-full space-y-0.5"><span className="label">Notes</span><TextField className="field-boxed" value={a.notes} placeholder="Versatile (1d10), finesse…" onChange={(v) => edit(a.id, { notes: v })} /></label>
                <button className="btn-danger col-span-full justify-self-end py-0.5 text-xs" onClick={() => update((d) => void (d.attacks = d.attacks.filter((x) => x.id !== a.id)))}>Remove</button>
              </div>
            </details>
          ))}
        </div>
      )}
    </Section>
  );
}
