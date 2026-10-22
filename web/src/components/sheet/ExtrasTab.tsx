import { useState } from "react";
import { wildShapeInto } from "../../lib/featureUse";
import { addCompanion } from "../../lib/combat";
import { multiattackCount, spendEconomy } from "../../lib/economy";
import { uid } from "../../lib/defaults";
import { ROLE_LABEL, damageCreature, damageWildShape, revertWildShape, wildShapeLimits } from "../../lib/extras";
import { MonsterPicker } from "../MonsterPicker";
import { useDecision } from "../decisions";
import type { Character, Companion, CreatureRole } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { StatBlock, EntryRow } from "../StatBlock";
import { NumberField, Section, TextField } from "../ui";

const ROLES = Object.keys(ROLE_LABEL) as CreatureRole[];

/** Wild Shape forms, familiars, steeds, companions and summons, with stat blocks and HP tracking. */
export function ExtrasTab({ c, update }: { c: Character; update: Update }) {
  const [adding, setAdding] = useState(false);
  const list = c.companions ?? [];
  const limits = wildShapeLimits(c);
  const ask = useDecision();
  const grouped = ROLES.map((r) => ({ role: r, items: list.filter((p) => (p.role ?? "other") === r) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {limits && <span className="chip border-emerald-700 text-emerald-400">Wild Shape: {limits.label}</span>}
        {limits && !c.wildShape && <button className="btn" onClick={() => ask({ kind: "wildshape" })}>🐾 Wild Shape…</button>}
        <span className="ml-auto" />
        <button
          className="btn"
          onClick={() => update((d) => addCompanion(d, { id: uid(), name: "New creature", kind: "", ac: 10, hp: { max: 1, current: 1 }, speed: "30 ft", notes: "", role: "other" }))}
        >
          + Custom creature
        </button>
        <button className="btn-primary" onClick={() => setAdding(true)}>+ Add from bestiary</button>
      </div>
      <WildShapeBanner c={c} update={update} />
      {list.length === 0 && (
        <Section title="Extras">
          <p className="text-sm text-ink-600">
            Add Wild Shape forms, a familiar, a steed, an animal companion or a summon. Each keeps its own stat block with roll buttons and hit points.
          </p>
        </Section>
      )}
      {grouped.map((g) => (
        <Section key={g.role} title={`${ROLE_LABEL[g.role]}${g.items.length > 1 ? "s" : ""}`}>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.items.map((p) => <CreatureCard key={p.id} c={c} p={p} update={update} />)}
          </div>
        </Section>
      ))}
      {adding && <MonsterPicker c={c} onClose={() => setAdding(false)} onAdd={(p) => update((d) => addCompanion(d, p))} />}
    </div>
  );
}

/** Shown while wild shaped: the beast's HP with damage that carries over on reverting. */
export function WildShapeBanner({ c, update }: { c: Character; update: Update }) {
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  const form = c.companions?.find((p) => p.id === c.wildShape?.companionId);
  if (!form) return notice ? <p className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-ink-400">{notice}</p> : null;
  const apply = (kind: "damage" | "heal") => {
    const n = Math.abs(parseInt(amount, 10));
    if (!n) return;
    update((d) => {
      if (kind === "heal") {
        const f = d.companions!.find((p) => p.id === form.id)!;
        f.hp.current = Math.min(f.hp.max, f.hp.current + n);
        return;
      }
      const r = damageWildShape(d, n);
      if (r.reverted) setNotice(`Reverted from ${form.name}${r.carried ? `: ${r.carried} damage carried over to you` : ""}.`);
    });
    setAmount("");
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-500/5 px-3 py-2 text-sm">
      <span className="font-display text-lg text-emerald-400">🐾 Wild Shape: {form.name}</span>
      <span className="chip">AC {form.ac}</span>
      <span className="chip">HP {form.hp.current}{form.hp.temp ? `+${form.hp.temp}` : ""} / {form.hp.max}</span>
      <input className="field-boxed w-16 py-0.5 text-center" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && apply("damage")} aria-label="Wild Shape damage or healing" />
      <button className="btn px-2 py-0.5 text-xs hover:text-blood-500" onClick={() => apply("damage")}>Damage</button>
      <button className="btn px-2 py-0.5 text-xs hover:text-emerald-400" onClick={() => apply("heal")}>Heal</button>
      <button className="btn-ghost ml-auto px-2 py-0.5 text-xs" onClick={() => { update((d) => { spendEconomy(d, "bonus", "Revert from Wild Shape"); revertWildShape(d); }); setNotice(""); }}>Revert</button>
    </div>
  );
}

function CreatureCard({ c, p, update }: { c: Character; p: Companion; update: Update }) {
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);
  const edit = (fn: (x: Companion) => void) => update((d) => fn(d.companions!.find((x) => x.id === p.id)!));
  const active = c.wildShape?.companionId === p.id;
  const apply = (kind: "damage" | "heal" | "temp") => {
    const n = Math.abs(parseInt(amount, 10));
    if (!n) return;
    if (active && kind === "damage") update((d) => void damageWildShape(d, n));
    else edit((x) => {
      if (kind === "damage") damageCreature(x, n);
      else if (kind === "heal") x.hp.current = Math.min(x.hp.max, x.hp.current + n);
      else x.hp.temp = Math.max(x.hp.temp ?? 0, n);
    });
    setAmount("");
  };
  const pct = p.hp.max ? Math.max(0, Math.min(100, (p.hp.current / p.hp.max) * 100)) : 0;

  return (
    <div className={`space-y-2 rounded-lg border p-3 text-sm ${active ? "border-emerald-600" : "border-ink-800"}`}>
      <div className="flex items-center gap-1">
        <TextField className="field font-display text-lg" value={p.name} onChange={(v) => edit((x) => void (x.name = v))} />
        <select className="field w-auto bg-ink-900 text-xs" value={p.role ?? "other"} onChange={(e) => edit((x) => void (x.role = e.target.value as CreatureRole))} aria-label="Role">
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button className="btn-ghost px-1.5 text-xs hover:text-blood-500" title="Remove" onClick={() => confirm(`Remove ${p.name}?`) && update((d) => { d.companions = d.companions!.filter((x) => x.id !== p.id); if (d.wildShape?.companionId === p.id) d.wildShape = null; })}>✕</button>
      </div>
      <p className="text-xs text-ink-400">{p.kind}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
        <label className="flex items-center gap-1">AC<NumberField className="field-boxed w-12 py-0.5 text-center" value={p.ac} onChange={(n) => edit((x) => void (x.ac = n))} /></label>
        <label className="flex items-center gap-1">
          HP<NumberField className="field-boxed w-12 py-0.5 text-center" value={p.hp.current} onChange={(n) => edit((x) => void (x.hp.current = n))} />/
          <NumberField className="field-boxed w-12 py-0.5 text-center" value={p.hp.max} onChange={(n) => edit((x) => void (x.hp.max = n))} />
          {p.hp.temp ? <span className="text-arcane-400">+{p.hp.temp}</span> : null}
        </label>
        <TextField className="field-boxed w-32 py-0.5" value={p.speed} onChange={(v) => edit((x) => void (x.speed = v))} />
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full ${pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-accent-500" : "bg-blood-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex gap-1">
        <input className="field-boxed w-16 py-0.5 text-center" inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && apply("damage")} aria-label={`${p.name} damage or healing`} />
        <button className="btn flex-1 py-0.5 text-xs hover:text-blood-500" onClick={() => apply("damage")}>Damage</button>
        <button className="btn flex-1 py-0.5 text-xs hover:text-emerald-400" onClick={() => apply("heal")}>Heal</button>
        <button className="btn flex-1 py-0.5 text-xs hover:text-arcane-400" onClick={() => apply("temp")}>Temp</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {p.role === "wildshape" && (
          active
            ? <button className="btn px-2 py-0.5 text-xs" onClick={() => update((d) => { spendEconomy(d, "bonus", "Revert from Wild Shape"); revertWildShape(d); })}>Revert to normal form</button>
            : <button className="btn-primary px-2 py-0.5 text-xs" onClick={() => update((d) => void wildShapeInto(d, p.id))}>🐾 Wild Shape into {p.name}</button>
        )}
        {p.monster && <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} stat block</button>}
      </div>
      {!open && p.monster && p.monster.actions.length > 0 && (
        <div className="space-y-1 border-t border-ink-800 pt-2">
          {p.monster.actions.filter((a) => /to hit|saving throw|\d+d\d+/.test(a.text)).slice(0, 4).map((a, i) => (
            <EntryRow key={i} e={a} name={p.name} kind="action" onUse={active ? (k, e) => update((d) => void spendEconomy(d, k, `${p.name}: ${e.name}`, { attack: !/^multiattack$/i.test(e.name), attacksPerAction: multiattackCount(p.monster?.actions ?? []) })) : undefined} />
          ))}
        </div>
      )}
      {open && p.monster && <div className="border-t border-ink-800 pt-2"><StatBlock m={p.monster} name={p.name} /></div>}
      <textarea className="field-boxed resize-y text-xs" rows={2} placeholder="Notes…" value={p.notes} onChange={(e) => edit((x) => void (x.notes = e.target.value))} />
    </div>
  );
}

