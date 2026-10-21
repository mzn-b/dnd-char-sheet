import { abilityMod, fmt, profBonus } from "../../lib/rules";
import { ABILITIES, type Attack, type Character } from "../../lib/types";
import { uid } from "../../lib/defaults";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Section, TextField } from "../ui";

export const attackBonus = (c: Character, a: Attack) =>
  (a.ability === "none" ? 0 : abilityMod(c, a.ability)) + (a.proficient ? profBonus(c) : 0) + a.bonus;

export const blankAttack = (): Attack => ({
  id: uid(), name: "", ability: "str", proficient: true, bonus: 0, damage: "", damageType: "", notes: "",
});

export function AttacksPanel({ c, update }: { c: Character; update: Update }) {
  const edit = (id: string, patch: Partial<Attack>) =>
    update((d) => void Object.assign(d.attacks.find((a) => a.id === id)!, patch));

  return (
    <Section
      title="Attacks & Spellcasting"
      action={<button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => update((d) => void d.attacks.push(blankAttack()))}>+ Add</button>}
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
                <span className="text-center font-semibold text-accent-400">{fmt(attackBonus(c, a))}</span>
                <span className="truncate text-sm">
                  {a.damage}
                  {a.damage && a.ability !== "none" && <span className="text-ink-400"> {fmt(abilityMod(c, a.ability))}</span>}
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
