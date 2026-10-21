import { useState } from "react";
import { CONDITIONS, CONDITION_TEXT, EXHAUSTION_TEXT, armorClassBreakdown, fmt, initiative, saveBonus } from "../../lib/rules";
import { d20 } from "../../lib/dice";
import { RollButton, useRoll } from "../dice";
import { ResourcesPanel } from "./ResourcesPanel";
import { endEffect, reminders } from "../../lib/combat";
import { useSpellDetails } from "../spells";
import { useCorrections } from "../../lib/corrections";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { NumberField, Pips, Section } from "../ui";

export function CombatPanel({ c, update }: { c: Character; update: Update }) {
  const [amount, setAmount] = useState("");
  const [concentrationDc, setConcentrationDc] = useState<number | null>(null);
  const [damageReminders, setDamageReminders] = useState<string[]>([]);
  const spellDetails = useSpellDetails(c.spellcasting.spells);
  const corrections = useCorrections();
  const { roll } = useRoll();
  const ac = armorClassBreakdown(c);
  const auto = c.acMode === "auto";

  const rollDeathSave = () => {
    const r = roll("1d20", { label: "Death saving throw", kind: "save" });
    update((d) => {
      if (r.total === 20) {
        d.hp.current = 1;
        d.deathSaves = { successes: 0, failures: 0 };
      } else if (r.total === 1) d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 2);
      else if (r.total >= 10) d.deathSaves.successes = Math.min(3, d.deathSaves.successes + 1);
      else d.deathSaves.failures = Math.min(3, d.deathSaves.failures + 1);
    });
  };
  const hpPct = c.hp.max ? Math.max(0, Math.min(100, (c.hp.current / c.hp.max) * 100)) : 0;
  const hitDice = Object.entries(
    c.classes.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k.hitDie]: (acc[k.hitDie] ?? 0) + k.level }), {}),
  );

  const applyHp = (kind: "damage" | "heal" | "temp") => {
    const n = Math.abs(parseInt(amount, 10));
    if (!n) return;
    update((d) => {
      if (kind === "temp") d.hp.temp = Math.max(d.hp.temp, n);
      else if (kind === "heal") {
        d.hp.current = Math.min(d.hp.max, Math.max(0, d.hp.current) + n);
        d.deathSaves = { successes: 0, failures: 0 };
      } else {
        const absorbed = Math.min(d.hp.temp, n);
        d.hp.temp -= absorbed;
        d.hp.current = Math.max(0, d.hp.current - (n - absorbed));
      }
    });
    if (kind === "damage" && c.concentration) setConcentrationDc(Math.max(10, Math.floor(n / 2)));
    if (kind === "damage" && c.combat?.active) setDamageReminders(reminders(c, spellDetails).filter((r) => r.when === "damaged" && !corrections.isReminderHidden(r.text)).map((r) => r.text));
    setAmount("");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Armor Class" hint={auto ? ac.parts.join(" · ") : "Typed by hand"}>
          {auto ? (
            <span className="font-display text-3xl">{ac.total}</span>
          ) : (
            <NumberField className="field text-center font-display text-3xl" value={c.armorClass} onChange={(n) => update((d) => void (d.armorClass = n))} />
          )}
          <div className="flex items-center justify-center gap-1 text-[10px] text-ink-600">
            <button className="hover:text-accent-400" onClick={() => update((d) => void (d.acMode = auto ? "manual" : "auto", d.armorClass = ac.total))} title="Switch between automatic and typed AC">
              {auto ? "auto" : "manual"}
            </button>
            {auto && (
              <label className="flex items-center gap-0.5" title="Bonus from magic items, spells…">
                +<NumberField className="field w-6 py-0 text-center text-xs" value={c.acBonus ?? 0} onChange={(n) => update((d) => void (d.acBonus = n))} />
              </label>
            )}
          </div>
        </Stat>
        <Stat label="Initiative" hint={`Dex ${fmt(initiative(c) - c.initiativeBonus)} + misc`}>
          <div className="flex items-baseline justify-center gap-1">
            <RollButton expression={d20(initiative(c))} label="Initiative" className="font-display text-3xl">{fmt(initiative(c))}</RollButton>
          </div>
          <label className="flex items-center justify-center gap-1 text-[10px] text-ink-600">
            misc
            <NumberField className="field w-8 py-0 text-center text-xs" value={c.initiativeBonus} onChange={(n) => update((d) => void (d.initiativeBonus = n))} />
          </label>
        </Stat>
        <Stat label="Speed">
          <div className="flex items-baseline justify-center">
            <NumberField className={`field w-16 text-center font-display text-3xl ${ac.tooHeavy ? "text-blood-500" : ""}`} value={c.speed} onChange={(n) => update((d) => void (d.speed = n))} title={ac.tooHeavy ? "Your armor's Strength requirement isn't met: speed −10 ft" : undefined} />
            <span className="text-xs text-ink-400">ft</span>
          </div>
        </Stat>
      </div>

      <Section title="Hit Points">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1">
            <NumberField
              className="field w-20 text-right font-display text-4xl"
              value={c.hp.current}
              onChange={(n) => update((d) => void (d.hp.current = n))}
              aria-label="Current HP"
            />
            <span className="text-2xl text-ink-600">/</span>
            <NumberField className="field w-16 font-display text-2xl text-ink-400" value={c.hp.max} min={0} onChange={(n) => update((d) => void (d.hp.max = n))} aria-label="Max HP" />
          </div>
          <div className="text-right">
            <span className="label">Temp</span>
            <NumberField className="field w-14 text-right font-display text-2xl text-arcane-400" value={c.hp.temp} min={0} onChange={(n) => update((d) => void (d.hp.temp = n))} />
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800">
          <div className={`h-full transition-all ${hpPct > 50 ? "bg-emerald-500" : hpPct > 20 ? "bg-accent-500" : "bg-blood-500"}`} style={{ width: `${hpPct}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="field-boxed w-20 text-center"
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && applyHp("damage")}
          />
          <button className="btn flex-1 hover:border-blood-500 hover:text-blood-500" onClick={() => applyHp("damage")}>Damage</button>
          <button className="btn flex-1 hover:border-emerald-500 hover:text-emerald-400" onClick={() => applyHp("heal")}>Heal</button>
          <button className="btn flex-1 hover:border-arcane-500 hover:text-arcane-400" onClick={() => applyHp("temp")}>Temp</button>
        </div>
      </Section>

      {c.concentration && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-arcane-500/50 bg-arcane-500/10 px-3 py-2 text-sm">
          <span className="text-arcane-400">◎ Concentrating on <b>{c.concentration.name}</b></span>
          {concentrationDc && (
            <RollButton expression={d20(saveBonus(c, "con"))} label={`Concentration (DC ${concentrationDc})`} kind="save" className="btn ml-auto px-2 py-0.5 text-xs">
              Roll Con save DC {concentrationDc}
            </RollButton>
          )}
          <button
            className={`btn-ghost px-2 py-0.5 text-xs ${concentrationDc ? "" : "ml-auto"}`}
            onClick={() => {
              setConcentrationDc(null);
              update((d) => {
                for (const e of d.combat?.effects.filter((x) => x.concentration) ?? []) endEffect(d, e.id);
                d.concentration = null;
              });
            }}
          >
            End
          </button>
        </div>
      )}

      {damageReminders.length > 0 && (
        <div className="rounded-xl border border-accent-600/50 bg-accent-500/10 px-3 py-2 text-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="label text-accent-400">You took damage: remember</span>
            <button className="btn-ghost px-1.5 py-0 text-xs" onClick={() => setDamageReminders([])}>✕</button>
          </div>
          <ul className="space-y-0.5">{[...new Set(damageReminders)].map((t) => <li key={t}>• {t}</li>)}</ul>
        </div>
      )}

      {(ac.stealthDisadvantage || ac.tooHeavy) && (
        <p className="text-xs text-accent-400">
          {ac.stealthDisadvantage && "Armor: disadvantage on Stealth. "}
          {ac.tooHeavy && "Armor too heavy for your Strength: speed −10 ft."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Section title="Hit Dice">
          {hitDice.length === 0 && <p className="text-xs text-ink-600">Gained with class levels</p>}
          {hitDice.map(([die, total]) => (
            <div key={die} className="flex items-center justify-between gap-2 text-sm">
              <span className="font-semibold">d{die}</span>
              <span className="text-xs text-ink-400">{total - (c.hitDiceUsed[die] ?? 0)}/{total} left</span>
              <Pips max={total} used={c.hitDiceUsed[die] ?? 0} color="bg-ink-600" onChange={(u) => update((d) => void (d.hitDiceUsed[die] = u))} />
            </div>
          ))}
        </Section>
        <Section title="Death Saves" action={c.hp.current <= 0 ? <button className="btn px-2 py-0.5 text-xs" onClick={rollDeathSave}>Roll</button> : undefined}>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-400">Successes</span>
              <Pips max={3} used={c.deathSaves.successes} color="bg-emerald-500" onChange={(u) => update((d) => void (d.deathSaves.successes = u))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-400">Failures</span>
              <Pips max={3} used={c.deathSaves.failures} color="bg-blood-500" onChange={(u) => update((d) => void (d.deathSaves.failures = u))} />
            </div>
          </div>
        </Section>
      </div>

      <Section title="Conditions" action={
        <label className="flex items-center gap-1 text-xs text-ink-400">
          Exhaustion
          <NumberField className="field w-8 text-center" value={c.exhaustion} min={0} max={6} onChange={(n) => update((d) => void (d.exhaustion = n))} />
        </label>
      }>
        <div className="flex flex-wrap gap-1">
          {CONDITIONS.map((cond) => {
            const on = c.conditions.includes(cond);
            return (
              <button
                key={cond}
                title={CONDITION_TEXT[cond]}
                className={`chip transition ${on ? "border-blood-500 bg-blood-500/15 text-blood-500" : "hover:border-ink-600"}`}
                onClick={() => update((d) => void (d.conditions = on ? d.conditions.filter((x) => x !== cond) : [...d.conditions, cond]))}
              >
                {cond}
              </button>
            );
          })}
        </div>
        {(c.conditions.length > 0 || c.exhaustion > 0) && (
          <ul className="mt-2 space-y-1 text-xs text-ink-400">
            {c.conditions.map((cond) => <li key={cond}><b className="text-blood-500">{cond}:</b> {CONDITION_TEXT[cond]}</li>)}
            {c.exhaustion > 0 && <li><b className="text-blood-500">Exhaustion {c.exhaustion}:</b> {EXHAUSTION_TEXT.slice(1, c.exhaustion + 1).join("; ")}</li>}
          </ul>
        )}
      </Section>

      <ResourcesPanel c={c} update={update} />
    </div>
  );
}

function Stat({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-center justify-center p-2 text-center" title={hint}>
      {children}
      <span className="label mt-0.5">{label}</span>
    </div>
  );
}
