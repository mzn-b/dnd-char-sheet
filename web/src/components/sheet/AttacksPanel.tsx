import { useState } from "react";
import { abilityMod, critRange, fmt, profBonus, wildShapeForm } from "../../lib/rules";
import { attackFromItem } from "../../lib/items";
import { genericOptions } from "../../lib/genericItems";
import { EntryRow } from "../StatBlock";
import { attackModifiers, describe, isRangedAttack } from "../../lib/modifiers";
import { multiattackCount, spendEconomy, type ActionKind } from "../../lib/economy";
import { ActionBadge } from "../ActionBadge";
import { ABILITIES, type Attack, type Character, type Item } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Section, TextField } from "../ui";
import { d20, withBonus } from "../../lib/dice";
import { attackAbility, blankAttackFields } from "../../lib/attacks";
import { activeRollBonus } from "../../lib/combat";
import { RollButton, useRoll } from "../dice";

const sum = (mods: { value: number }[]) => mods.reduce((s, m) => s + m.value, 0);

/** To-hit: ability + proficiency + typed bonus + magic weapon, Archery and other modifiers. */
const abilityPart = (c: Character, a: Attack) => {
  const ab = attackAbility(c, a).ability;
  return ab === "none" ? 0 : abilityMod(c, ab);
};

export const attackBonus = (c: Character, a: Attack) =>
  abilityPart(c, a) + (a.proficient ? profBonus(c) : 0) + a.bonus + sum(attackModifiers(c, a).attack);

export const damageBonus = (c: Character, a: Attack) => abilityPart(c, a) + sum(attackModifiers(c, a).damage);

/** Tooltip text naming the automatic bonuses on an attack. */
export const attackHint = (c: Character, a: Attack) => {
  const m = attackModifiers(c, a);
  return [attackAbility(c, a).reason ?? "", m.attack.length ? `To hit: ${describe(m.attack)}` : "", m.damage.length ? `Damage: ${describe(m.damage)}` : ""].filter(Boolean).join("\n") || undefined;
};

/** To-hit and damage roll buttons. Damage doubles its dice if the last roll was a crit with this attack. */
/** Weapon attacks use the Attack action unless set otherwise (an off-hand attack is a bonus action). */
export const attackKind = (a: Attack): ActionKind => a.actionType ?? "action";

export function AttackRolls({ c, a, size = "text-sm", update }: { c: Character; a: Attack; size?: string; update?: Update }) {
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
        critOn={critRange(c)}
        className={`font-semibold text-accent-400 ${size}`}
        onRoll={update && (() => update((d) => void spendEconomy(d, attackKind(a), a.name || "Attack", { attack: attackKind(a) === "action" })))}
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

/** In Wild Shape your attacks are the beast's; rolling one uses your action (or bonus action/reaction). */
export function BeastAttacks({ c, update }: { c: Character; update: Update }) {
  const form = wildShapeForm(c);
  if (!form) return null;
  const list = [
    ...(form.monster?.actions ?? []).map((e) => ({ e, kind: "action" as const })),
    ...(form.monster?.bonusActions ?? []).map((e) => ({ e, kind: "bonus" as const })),
    ...(form.monster?.reactions ?? []).map((e) => ({ e, kind: "reaction" as const })),
  ];
  return (
    <div className="space-y-2">
      <p className="rounded-lg border border-emerald-700/60 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-400">
        🐾 Wild Shape: you attack with {form.name}'s actions. Your own weapon attacks and spells return when you revert.
      </p>
      {list.length === 0 && <p className="text-sm text-ink-600">This form has no stat block; add its attacks in its notes on the Extras tab.</p>}
      {list.map(({ e, kind }, i) => (
        <EntryRow
          key={i}
          e={e}
          name={form.name}
          kind={kind}
          onUse={(k, entry) => update((d) => void spendEconomy(d, k, `${form.name}: ${entry.name}`, { attack: k === "action" && !/^multiattack$/i.test(entry.name), attacksPerAction: multiattackCount(form.monster?.actions ?? []) }))}
        />
      ))}
    </div>
  );
}

/** "+ Add": an attack from a weapon in your inventory, or a blank one to fill in. */
export function AddAttackMenu({ c, update }: { c: Character; update: Update }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Weapons first (they carry damage and properties), then everything else you could swing or throw.
  const items = [...c.equipment].filter((i) => !genericOptions(i.name)).sort((a, b) => Number(!!b.data?.weapon) - Number(!!a.data?.weapon) || a.name.localeCompare(b.name));
  const add = async (item: Item) => {
    setBusy(true);
    try {
      const attack = await attackFromItem(c, item);
      update((d) => void d.attacks.push(attack));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="relative">
      <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>+ Add</button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 p-1 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-600">From your inventory</div>
          {items.length === 0 && <p className="px-2 py-1 text-xs text-ink-600">No items yet: add weapons on the Inventory tab.</p>}
          {items.map((i) => (
            <button key={i.id} disabled={busy} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-ink-800 disabled:opacity-50" onClick={() => add(i)}>
              <span className="flex-1 truncate">{i.name}{i.qty > 1 ? ` ×${i.qty}` : ""}</span>
              {i.data?.weapon ? <span className="text-[10px] text-ink-400">{i.data.weapon.damage} {i.data.weapon.damageType}</span> : <span className="text-[10px] text-ink-600">improvised</span>}
              {c.attacks.some((a) => a.itemId === i.id || a.name === i.name) && <span className="text-[10px] text-emerald-400">✓</span>}
            </button>
          ))}
          <div className="my-1 border-t border-ink-800" />
          <button className="w-full rounded px-2 py-1 text-left text-sm hover:bg-ink-800" onClick={() => { update((d) => void d.attacks.push(blankAttackFields())); setOpen(false); }}>
            Custom attack…
          </button>
        </div>
      )}
    </span>
  );
}

export function AttacksPanel({ c, update }: { c: Character; update: Update }) {
  const edit = (id: string, patch: Partial<Attack>) =>
    update((d) => void Object.assign(d.attacks.find((a) => a.id === id)!, patch));

  return (
    <Section
      title="Attacks & Spellcasting"
      action={<AddAttackMenu c={c} update={update} />}
    >
      {wildShapeForm(c) ? (
        <BeastAttacks c={c} update={update} />
      ) : c.attacks.length === 0 ? (
        <p className="text-sm text-ink-600">No attacks yet. Add one, or create one from a weapon in your inventory.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_4.5rem_3rem_1fr_1.5rem] gap-1 px-1 text-[10px] uppercase tracking-wider text-ink-600">
            <span>Name</span><span>Ability</span><span>Bonus</span><span>Damage / Type</span><span />
          </div>
          {c.attacks.map((a) => (
            <details key={a.id} className="group rounded-lg border border-ink-800 bg-ink-850/50">
              <summary className="grid cursor-pointer list-none grid-cols-[1fr_4.5rem_3rem_1fr_1.5rem] items-center gap-1 p-1">
                <span className="flex min-w-0 items-center gap-1">
                  <ActionBadge kind={attackKind(a)} detail={attackKind(a) === "action" ? "part of the Attack action" : undefined} />
                  <TextField value={a.name} placeholder="Longsword" onChange={(v) => edit(a.id, { name: v })} onClick={(e) => e.preventDefault()} />
                </span>
                <select
                  className={`field bg-ink-850 text-xs uppercase ${attackAbility(c, a).reason ? "text-arcane-400" : ""}`}
                  title={attackAbility(c, a).reason}
                  value={attackAbility(c, a).ability}
                  onClick={(e) => e.preventDefault()}
                  onChange={(e) => edit(a.id, { ability: e.target.value as Attack["ability"] })}
                >
                  {ABILITIES.map((x) => <option key={x} value={x}>{x}</option>)}
                  <option value="none">—</option>
                </select>
                <span className="text-center" onClick={(e) => e.preventDefault()}>
                  <RollButton expression={d20(attackBonus(c, a))} label={`${a.name || "Attack"}: to hit`} kind="attack" className="font-semibold text-accent-400" onRoll={() => update((d) => void spendEconomy(d, attackKind(a), a.name || "Attack", { attack: attackKind(a) === "action" }))}>{fmt(attackBonus(c, a))}</RollButton>
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
                <label className="space-y-0.5"><span className="label">Uses</span>
                  <select className="field-boxed" value={attackKind(a)} onChange={(e) => edit(a.id, { actionType: e.target.value as Attack["actionType"] })}>
                    <option value="action">Action (Attack action)</option>
                    <option value="bonus">Bonus action (off-hand…)</option>
                    <option value="reaction">Reaction (opportunity attack…)</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2"><input type="checkbox" className="accent-accent-500" checked={isRangedAttack(c, a)} onChange={(e) => edit(a.id, { ranged: e.target.checked })} />Ranged</label>
                {attackHint(c, a) && <p className="col-span-full whitespace-pre-line text-xs text-emerald-400">Automatic: {attackHint(c, a)}</p>}
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
