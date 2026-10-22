import { useMemo, useState } from "react";
import { featureRolls } from "../../lib/featureRolls";
import { d20 } from "../../lib/dice";
import {
  ABILITY_NAMES, STANDARD_ACTIONS, armorClass, fmt, hpMax, initiative, speed, wildShapeForm, saveBonus, spellAttack, spellLevelLabel, spellModel, spellSaveDC,
} from "../../lib/rules";
import type { Character, SpellEntry } from "../../lib/types";
import { EntryRow } from "../StatBlock";
import type { Update } from "../../lib/useCharacter";
import { RollButton } from "../dice";
import { CastButton, SpellBadges, SpellRollInfo, spellRollContext, actionType, useSpellDetails } from "../spells";
import { Modal, NumberField, Section } from "../ui";
import { AddAttackMenu, AttackRolls, BeastAttacks, attackKind } from "./AttacksPanel";
import { ActionBadge } from "../ActionBadge";
import { featureKind, spendEconomy, type ActionKind } from "../../lib/economy";
import { applyFeatureUse, endFeatureEffect, featureDecision, usesLeft } from "../../lib/featureUse";
import { featureDuration } from "../../lib/featureDuration";
import { useDecision } from "../decisions";
import type { Feature } from "../../lib/types";
import { ResourcesPanel } from "./ResourcesPanel";
import { LastingEffects } from "./LastingEffects";
import { CombatPanel } from "./CombatTracker";
import { FeatureDetail, FeatureRolls } from "./FeaturesTab";
import { EFFECTS, activateEffect, activeRollBonus, roundsLeft } from "../../lib/combat";
import { ContentDetailView } from "../ContentBrowser";

const GROUPS = [
  { id: "action", title: "Actions" },
  { id: "bonus", title: "Bonus actions" },
  { id: "reaction", title: "Reactions" },
  { id: "other", title: "Longer casting times" },
] as const;

/** Everything you need on your turn: attacks, castable spells, resources and the standard actions. */
export function ActionsTab({ c, update, endedEffects }: { c: Character; update: Update; endedEffects?: string[] }) {
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
  // Features you actively use (they cost an action, bonus action or reaction) or that have dice to roll.
  const usable = c.features.filter((f) => {
    const kind = featureKind(c, f);
    return (kind && kind !== "other") || !!f.uses || !!featureDuration(f) || (featureRolls(c, f).length > 0 && f.kind !== "race" && f.kind !== "background");
  });

  return (
    <div className="space-y-4">
    <CombatPanel c={c} update={update} endedNotice={endedEffects} />
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {wildShapeForm(c) ? (
            <Vital label={`🐾 ${wildShapeForm(c)!.name} HP`} value={`${wildShapeForm(c)!.hp.current} / ${wildShapeForm(c)!.hp.max}`} tone="text-emerald-400" />
          ) : (
            <Vital label="Hit points" value={`${c.hp.current}${c.hp.temp ? `+${c.hp.temp}` : ""} / ${hpMax(c)}`} tone={c.hp.current <= hpMax(c) / 4 ? "text-blood-500" : ""} />
          )}
          <Vital label="Armor class" value={String(armorClass(c))} />
          <div className="panel p-2 text-center">
            <RollButton expression={d20(initiative(c))} label="Initiative" className="font-display text-2xl">{fmt(initiative(c))}</RollButton>
            <div className="label">Initiative</div>
          </div>
          <Vital label="Speed" value={`${speed(c)} ft`} />
        </div>
        <LastingEffects c={c} update={update} />
        {(c.concentration || c.conditions.length > 0 || c.exhaustion > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {c.concentration && <span className="chip border-arcane-500 text-arcane-400">◎ {c.concentration.name}</span>}
            {c.conditions.map((x) => <span key={x} className="chip border-blood-500 text-blood-500">{x}</span>)}
            {c.exhaustion > 0 && <span className="chip border-blood-500 text-blood-500">Exhaustion {c.exhaustion}</span>}
          </div>
        )}

        <Section title="Attacks" action={wildShapeForm(c) ? undefined : <AddAttackMenu c={c} update={update} />}>
          <BeastAttacks c={c} update={update} />
          {!wildShapeForm(c) && c.attacks.length === 0 && <p className="text-sm text-ink-600">No attacks yet: + Add picks a weapon from your inventory.</p>}
          <ul className={`space-y-1.5 ${wildShapeForm(c) ? "hidden" : ""}`}>
            {c.attacks.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-ink-850/60 px-3 py-2">
                <ActionBadge kind={attackKind(a)} detail={attackKind(a) === "action" ? "part of the Attack action" : undefined} />
                <span className="min-w-[8rem] flex-1 font-semibold">{a.name || "Attack"}</span>
                <AttackRolls c={c} a={a} update={update} />
                {a.damageType && <span className="text-xs text-ink-400">{a.damageType}</span>}
                {a.notes && <span className="w-full text-xs text-ink-600">{a.notes}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-ink-600">Click the bonus to attack, then the damage. A natural 20 makes the next damage roll a critical.</p>
        </Section>

        {usable.length > 0 && <FeatureActions c={c} update={update} features={usable} />}

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
            {STANDARD_ACTIONS.map(([name, text]) => {
              const kind: ActionKind = /\(reaction\)/.test(name) ? "reaction" : /\(bonus\)/.test(name) ? "bonus" : "action";
              const label = name.replace(/\s*\((reaction|bonus)\)/, "");
              return (
                <div key={name}>
                  <dt className="flex items-center gap-1.5 font-semibold">
                    <ActionBadge kind={kind} />
                    {label}
                    {c.combat?.active && !["Attack", "Cast a Spell", "Two-Weapon Fighting", "Opportunity Attack"].includes(label) && (
                      <button
                        className="btn-ghost ml-auto px-1.5 py-0 text-[11px]"
                        title={`Take the ${label} action (marks your ${kind === "action" ? "action" : kind === "bonus" ? "bonus action" : "reaction"} as used)`}
                        onClick={() => update((d) => {
                          spendEconomy(d, kind, label);
                          const def = EFFECTS.find((e) => e.always && e.match.test(label));
                          if (def) activateEffect(d, def, def.label!);
                        })}
                      >
                        Take
                      </button>
                    )}
                  </dt>
                  <dd className="text-xs text-ink-400">{text}</dd>
                </div>
              );
            })}
          </dl>
        </Section>
      </div>

      <div className="space-y-4">
        <ResourcesPanel c={c} update={update} />
        <Section title="Saving throws">
          <div className="grid grid-cols-3 gap-1 text-center text-sm">
            {(["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => {
              const bonus = saveBonus(c, a);
              const extra = activeRollBonus(c, "save");
              return (
                <RollButton key={a} expression={d20(bonus) + (extra ? `+${extra.dice}` : "")} label={`${ABILITY_NAMES[a]} save${extra ? ` (+${extra.names.join(", ")})` : ""}`} kind="save" className="rounded-lg bg-ink-850 py-1.5">
                  <div className="text-[10px] uppercase text-ink-400">{a}</div>
                  <div className="font-display text-lg">{fmt(bonus)}</div>
                </RollButton>
              );
            })}
          </div>
        </Section>
        <Companions c={c} update={update} />
      </div>

    </div>
      {viewing && (
        <Modal title={viewing.ref.name} onClose={() => setViewing(null)}>
          <ContentDetailView type="spell" item={viewing.ref} rollContext={spellRollContext(c, viewing)} />
        </Modal>
      )}
    </div>
  );
}

/** Features you use on your turn: what each costs, uses left, a Use button and its dice. */
function FeatureActions({ c, update, features }: { c: Character; update: Update; features: Feature[] }) {
  const ask = useDecision();
  const [warning, setWarning] = useState<string>();
  const [reading, setReading] = useState<Feature | null>(null);
  const order: ActionKind[] = ["action", "bonus", "reaction", "free", "other"];
  const sorted = [...features].sort((a, b) => order.indexOf(featureKind(c, a) ?? "other") - order.indexOf(featureKind(c, b) ?? "other"));
  return (
    <Section title="Features & abilities">
      {warning && <p className="mb-2 rounded border border-accent-600/50 px-2 py-1 text-xs text-accent-400">⚠ {warning}</p>}
      <ul className="space-y-2">
        {sorted.map((f) => {
          const kind = featureKind(c, f);
          const left = usesLeft(c, f);
          const decision = featureDecision(f);
          const duration = featureDuration(f);
          const effect = c.combat?.effects.find((e) => e.name === f.name);
          const active = (/^wild shape$/i.test(f.name) && !!c.wildShape) || !!effect || (!!duration?.concentration && c.concentration?.name === f.name);
          const usable = (kind && kind !== "other") || left != null || !!duration;
          const roundsLeftNow = effect ? roundsLeft(c, effect) : null;
          return (
            <li key={f.id} className="rounded-lg bg-ink-850/60 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <ActionBadge kind={kind} />
                <button className="flex-1 text-left text-sm font-semibold hover:text-accent-400" title="Read the full feature" onClick={() => setReading(f)}>{f.name}</button>
                {duration && (
                  <span className="flex items-center gap-1 text-[10px] text-ink-400">
                    <span className="rounded bg-ink-800 px-1" title="Lasts">{duration.label}</span>
                    {duration.concentration && <span className="rounded bg-arcane-500/20 px-1 text-arcane-400" title="Concentration">C</span>}
                  </span>
                )}
                {active && effect && (
                  <span className="text-xs text-arcane-400">{effect.untilNextTurn ? "until your turn" : roundsLeftNow != null ? `${roundsLeftNow} rounds left` : "active"}</span>
                )}
                {left != null && <span className="text-xs text-ink-400">{left} left</span>}
                {active && (effect || (duration?.concentration && c.concentration?.name === f.name)) && !/^wild shape$/i.test(f.name) && (
                  <button className="btn-ghost px-2 py-0 text-xs hover:text-blood-500" onClick={() => update((d) => endFeatureEffect(d, f))}>End</button>
                )}
                {usable && !(active && !/^wild shape$/i.test(f.name)) && (
                  <button
                    className="btn px-2 py-0 text-xs"
                    disabled={left === 0 || active}
                    title={decision ? "Choose how to use it" : "Use it: marks the action economy in combat and spends a use"}
                    onClick={() => {
                      if (decision) return ask(decision);
                      let w: string | undefined;
                      update((d) => void (w = applyFeatureUse(d, d.features.find((x) => x.id === f.id) ?? f)));
                      setWarning(w);
                    }}
                  >
                    {active ? "Active" : decision ? "Use…" : "Use"}
                  </button>
                )}
              </div>
              <FeatureRolls c={c} f={f} compact />
            </li>
          );
        })}
      </ul>
      {reading && (
        <Modal title={reading.name} onClose={() => setReading(null)}>
          <FeatureDetail c={c} f={c.features.find((x) => x.id === reading.id) ?? reading} />
        </Modal>
      )}
    </Section>
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

/** Quick view of tracked creatures; full stat blocks live on the Extras tab. */
function Companions({ c, update }: { c: Character; update: Update }) {
  const list = (c.companions ?? []).filter((p) => p.role !== "wildshape" || c.wildShape?.companionId === p.id);
  if (!list.length) return null;
  const setHp = (id: string, n: number) => update((d) => void (d.companions!.find((x) => x.id === id)!.hp.current = n));
  return (
    <Section title="Creatures">
      <div className="space-y-3">
        {list.map((p) => (
          <div key={p.id} className="space-y-1 rounded-lg border border-ink-800 p-2 text-sm">
            <div className="flex items-center gap-2">
              <b className="flex-1">{p.name}</b>
              <span className="text-xs text-ink-400">AC {p.ac}</span>
              <label className="flex items-center gap-1 text-xs text-ink-400">
                HP<NumberField className="field-boxed w-12 py-0.5 text-center" value={p.hp.current} onChange={(n) => setHp(p.id, n)} />/ {p.hp.max}
              </label>
            </div>
            {p.monster?.actions.filter((a) => /to hit|saving throw|\d+d\d+/.test(a.text)).slice(0, 3).map((a, i) => <EntryRow key={i} e={a} name={p.name} kind="action" />)}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-600">Manage creatures, Wild Shape and stat blocks on the Extras tab.</p>
    </Section>
  );
}
