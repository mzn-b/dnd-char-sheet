import { useMemo, useState } from "react";
import { uid } from "../../lib/defaults";
import { d20 } from "../../lib/dice";
import {
  ABILITY_NAMES, STANDARD_ACTIONS, armorClass, fmt, initiative, saveBonus, spellAttack, spellLevelLabel, spellModel, spellSaveDC,
} from "../../lib/rules";
import type { Character, Companion, SpellEntry } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { RollButton } from "../dice";
import { CastButton, SpellBadges, SpellRollInfo, actionType, useSpellDetails } from "../spells";
import { Modal, NumberField, Section, TextField } from "../ui";
import { AttackRolls } from "./AttacksPanel";
import { ResourcesPanel } from "./ResourcesPanel";
import { ContentDetailView } from "../ContentBrowser";

const GROUPS = [
  { id: "action", title: "Actions" },
  { id: "bonus", title: "Bonus actions" },
  { id: "reaction", title: "Reactions" },
  { id: "other", title: "Longer casting times" },
] as const;

/** Everything you need on your turn: attacks, castable spells, resources and the standard actions. */
export function ActionsTab({ c, update }: { c: Character; update: Update }) {
  const [viewing, setViewing] = useState<SpellEntry | null>(null);
  const castable = useMemo(
    () =>
      c.spellcasting.spells.filter((s) => {
        const cls = c.classes.find((k) => k.key === s.classKey);
        return s.level === 0 || s.prepared || s.alwaysPrepared || !!s.uses || !cls || spellModel(cls) === "known";
      }),
    [c.spellcasting.spells, c.classes],
  );
  const details = useSpellDetails(castable);
  const casters = c.classes.filter((k) => k.spellcastingAbility);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Vital label="Hit points" value={`${c.hp.current}${c.hp.temp ? `+${c.hp.temp}` : ""} / ${c.hp.max}`} tone={c.hp.current <= c.hp.max / 4 ? "text-blood-500" : ""} />
          <Vital label="Armor class" value={String(armorClass(c))} />
          <div className="panel p-2 text-center">
            <RollButton expression={d20(initiative(c))} label="Initiative" className="font-display text-2xl">{fmt(initiative(c))}</RollButton>
            <div className="label">Initiative</div>
          </div>
          <Vital label="Speed" value={`${c.speed} ft`} />
        </div>
        {(c.concentration || c.conditions.length > 0 || c.exhaustion > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {c.concentration && <span className="chip border-arcane-500 text-arcane-400">◎ {c.concentration.name}</span>}
            {c.conditions.map((x) => <span key={x} className="chip border-blood-500 text-blood-500">{x}</span>)}
            {c.exhaustion > 0 && <span className="chip border-blood-500 text-blood-500">Exhaustion {c.exhaustion}</span>}
          </div>
        )}

        <Section title="Attacks">
          {c.attacks.length === 0 && <p className="text-sm text-ink-600">Add attacks on the Overview tab or from a weapon in your inventory (+Atk).</p>}
          <ul className="space-y-1.5">
            {c.attacks.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-ink-850/60 px-3 py-2">
                <span className="min-w-[8rem] flex-1 font-semibold">{a.name || "Attack"}</span>
                <AttackRolls c={c} a={a} />
                {a.damageType && <span className="text-xs text-ink-400">{a.damageType}</span>}
                {a.notes && <span className="w-full text-xs text-ink-600">{a.notes}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-600">Click the bonus to attack, then the damage. A natural 20 makes the next damage roll a critical.</p>
        </Section>

        {(castable.length > 0 || casters.length > 0) && (
          <Section
            title="Spells"
            action={
              <span className="flex flex-wrap gap-2 text-xs text-ink-400">
                {casters.map((k) => (
                  <span key={k.key}>
                    {k.name}: DC {spellSaveDC(c, k.spellcastingAbility!)} ·{" "}
                    <RollButton expression={d20(spellAttack(c, k.spellcastingAbility!))} label={`${k.name} spell attack`} kind="attack" className="text-accent-400">
                      {fmt(spellAttack(c, k.spellcastingAbility!))} to hit
                    </RollButton>
                  </span>
                ))}
              </span>
            }
          >
            <SlotSummary c={c} />
            {GROUPS.map((g) => {
              const list = castable.filter((s) => (details[s.id] ? actionType(details[s.id]!.meta["Casting Time"]) : "action") === g.id);
              if (!list.length) return null;
              return (
                <div key={g.id} className="mt-3">
                  <h4 className="mb-1 font-display text-sm text-accent-400">{g.title}</h4>
                  <ul>
                    {list.sort((a, b) => a.level - b.level || a.ref.name.localeCompare(b.ref.name)).map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-2 rounded px-1 py-1 text-sm hover:bg-ink-850">
                        <span className="w-8 text-xs text-ink-600">{s.level === 0 ? "C" : spellLevelLabel(s.level).replace(" level", "")}</span>
                        <button className="min-w-0 flex-1 truncate text-left hover:text-accent-400" onClick={() => setViewing(s)}>
                          {s.ref.name}
                          {s.uses && <span className="ml-1 text-[10px] text-ink-600">({s.uses})</span>}
                        </button>
                        <SpellRollInfo c={c} spell={s} detail={details[s.id]} />
                        <SpellBadges detail={details[s.id]} />
                        <CastButton c={c} update={update} spell={s} detail={details[s.id]} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Section>
        )}

        <Section title="Standard actions">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {STANDARD_ACTIONS.map(([name, text]) => (
              <div key={name}>
                <dt className="font-semibold">{name}</dt>
                <dd className="text-xs text-ink-400">{text}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <div className="space-y-4">
        <ResourcesPanel c={c} update={update} />
        <Section title="Saving throws">
          <div className="grid grid-cols-3 gap-1 text-center text-sm">
            {(["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => {
              const bonus = saveBonus(c, a);
              return (
                <RollButton key={a} expression={d20(bonus)} label={`${ABILITY_NAMES[a]} save`} kind="save" className="rounded-lg bg-ink-850 py-1.5">
                  <div className="text-[10px] uppercase text-ink-400">{a}</div>
                  <div className="font-display text-lg">{fmt(bonus)}</div>
                </RollButton>
              );
            })}
          </div>
        </Section>
        <Companions c={c} update={update} />
      </div>

      {viewing && (
        <Modal title={viewing.ref.name} onClose={() => setViewing(null)}>
          <ContentDetailView type="spell" item={viewing.ref} />
        </Modal>
      )}
    </div>
  );
}

function Vital({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-2 text-center">
      <div className={`font-display text-2xl ${tone}`}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function SlotSummary({ c }: { c: Character }) {
  const slots = c.spellcasting.slots.map((s, i) => ({ ...s, level: i + 1 })).filter((s) => s.max > 0);
  const pact = c.spellcasting.pactSlots;
  if (!slots.length && !pact.max) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {slots.map((s) => (
        <span key={s.level} className={`chip ${s.max - s.used ? "" : "opacity-40"}`}>
          {spellLevelLabel(s.level).replace(" level", "")}: {s.max - s.used}/{s.max}
        </span>
      ))}
      {pact.max > 0 && <span className="chip border-arcane-500 text-arcane-400">Pact ({spellLevelLabel(pact.level).replace(" level", "")}): {pact.max - pact.used}/{pact.max}</span>}
    </div>
  );
}

/** Familiars, mounts, animal companions, summons. */
function Companions({ c, update }: { c: Character; update: Update }) {
  const list = c.companions ?? [];
  const edit = (id: string, patch: Partial<Companion>) => update((d) => void Object.assign(d.companions!.find((x) => x.id === id)!, patch));
  return (
    <Section
      title="Companions"
      action={
        <button
          className="btn-ghost px-2 py-0.5 text-xs"
          onClick={() => update((d) => void (d.companions = [...(d.companions ?? []), { id: uid(), name: "", kind: "", ac: 10, hp: { max: 1, current: 1 }, speed: "30 ft", notes: "" }]))}
        >
          + Add
        </button>
      }
    >
      {list.length === 0 && <p className="text-sm text-ink-600">Familiars, mounts, animal companions or summons.</p>}
      <div className="space-y-3">
        {list.map((p) => (
          <div key={p.id} className="space-y-1 rounded-lg border border-ink-800 p-2 text-sm">
            <div className="flex gap-1">
              <TextField className="field font-semibold" placeholder="Name" value={p.name} onChange={(v) => edit(p.id, { name: v })} />
              <TextField className="field text-ink-400" placeholder="Owl, warhorse…" value={p.kind} onChange={(v) => edit(p.id, { kind: v })} />
              <button className="btn-ghost px-1.5 text-xs hover:text-blood-500" onClick={() => update((d) => void (d.companions = d.companions!.filter((x) => x.id !== p.id)))}>✕</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-400">
              <label className="flex items-center gap-1">AC<NumberField className="field-boxed w-12 py-0.5 text-center" value={p.ac} onChange={(n) => edit(p.id, { ac: n })} /></label>
              <label className="flex items-center gap-1">HP<NumberField className="field-boxed w-12 py-0.5 text-center" value={p.hp.current} onChange={(n) => edit(p.id, { hp: { ...p.hp, current: n } })} />/<NumberField className="field-boxed w-12 py-0.5 text-center" value={p.hp.max} onChange={(n) => edit(p.id, { hp: { ...p.hp, max: n } })} /></label>
              <TextField className="field-boxed w-20 py-0.5" value={p.speed} onChange={(v) => edit(p.id, { speed: v })} />
            </div>
            <textarea className="field-boxed resize-y text-xs" rows={2} placeholder="Attacks, abilities…" value={p.notes} onChange={(e) => edit(p.id, { notes: e.target.value })} />
          </div>
        ))}
      </div>
    </Section>
  );
}
