import { useState } from "react";
import {
  REMINDER_LABELS, activatableEffects, activateEffect, addEffect, endCombat, endEffect, endTurn, reminders, roundsLeft,
  startCombat, startTurn, type Reminder, type ReminderWhen,
} from "../../lib/combat";
import { uid } from "../../lib/defaults";
import { d20 } from "../../lib/dice";
import { fmt, initiative, speed } from "../../lib/rules";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { useRoll } from "../dice";
import { useSpellDetails } from "../spells";
import { NumberField, Section } from "../ui";
import { HideButton } from "../rolls";
import { ActionBadge } from "../ActionBadge";
import { useDecision } from "../decisions";
import { attacksPerAction, featureKind, spendEconomy } from "../../lib/economy";
import { useCorrections } from "../../lib/corrections";

const ORDER: ReminderWhen[] = ["turnStart", "attack", "hit", "damaged", "turnEnd", "always"];

/** Compact, sticky round tracker shown on every tab during combat. */
/** Rounds as the shortest readable time: 3r, 1 min, 8 h (10 rounds = 1 minute). */
const shortDuration = (rounds: number) =>
  rounds >= 600 ? `${Math.round(rounds / 600)} h` : rounds >= 10 ? `${Math.round(rounds / 10)} min` : `${rounds}r`;

export function CombatBar({ c, update, onEnded }: { c: Character; update: Update; onEnded?: (names: string[]) => void }) {
  const s = c.combat;
  if (!s?.active) return null;
  const econ = s.economy;
  // The latest economy warning this round (e.g. "your bonus action is already used").
  const last = s.log[s.log.length - 1];
  const warning = last?.round === s.round && last.text.startsWith("⚠") ? last.text.slice(2) : undefined;
  const toggle = (k: "action" | "bonus" | "reaction") => update((d) => void (d.combat!.economy[k] = !d.combat!.economy[k]));
  return (
    <div className="sticky top-[53px] z-30 -mx-4 flex flex-wrap items-center gap-2 border-y border-blood-500/40 bg-ink-950/95 px-4 py-2 text-sm backdrop-blur print:hidden">
      <span className="font-display text-lg text-blood-500">⚔ Round {s.round}</span>
      {s.initiative != null && <span className="chip">Init {s.initiative}</span>}
      <span className={`chip ${s.myTurn ? "border-emerald-600 text-emerald-400" : ""}`}>{s.myTurn ? "Your turn" : "Waiting"}</span>
      {s.myTurn ? (
        <button className="btn px-2 py-0.5 text-xs" onClick={() => update((d) => endTurn(d))}>End my turn</button>
      ) : (
        <button
          className="btn-primary px-2 py-0.5 text-xs"
          onClick={() => {
            let ended: string[] = [];
            update((d) => void (ended = startTurn(d)));
            onEnded?.(ended);
          }}
        >
          Start my turn
        </button>
      )}
      <span className="mx-1 h-5 w-px bg-ink-700" />
      {(["action", "bonus", "reaction"] as const).map((k) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          title={econ[k] ? "Used (click to undo)" : "Available (click when used)"}
          className={`rounded-full border px-2 py-0.5 text-xs capitalize transition ${econ[k] ? "border-ink-700 text-ink-600 line-through" : "border-accent-600 text-accent-400"}`}
        >
          {k === "bonus" ? "Bonus action" : k}
          {k === "action" && econ.attacks ? ` · ${econ.attacks}/${attacksPerAction(c)} attacks` : ""}
        </button>
      ))}
      {warning && <span className="text-xs text-accent-400" title={warning}>⚠ {warning}</span>}
      <span className="flex items-center gap-1 text-xs text-ink-400">
        Move
        <button className="btn px-1.5 py-0 text-xs" onClick={() => update((d) => void (d.combat!.economy.movement = Math.max(0, d.combat!.economy.movement - 5)))}>−</button>
        <span className={econ.movement >= speed(c) ? "text-blood-500" : ""}>{econ.movement}/{speed(c)} ft</span>
        <button className="btn px-1.5 py-0 text-xs" onClick={() => update((d) => void (d.combat!.economy.movement += 5))}>+5</button>
      </span>
      {s.effects.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {s.effects.map((e) => {
            const left = roundsLeft(c, e);
            return (
              <span key={e.id} className="chip border-arcane-500/60 text-arcane-400" title={e.reminders.map((r) => r.text).join("\n")}>
                {e.concentration ? "◎ " : ""}{e.name}{e.untilNextTurn ? " (until your turn)" : left != null ? ` · ${shortDuration(left)}` : ""}
              </span>
            );
          })}
        </span>
      )}
      <button className="btn-ghost ml-auto px-2 py-0.5 text-xs" onClick={() => confirm("End combat?") && update((d) => endCombat(d))}>End combat</button>
    </div>
  );
}

/** Full combat panel for the Actions tab: start combat, reminders, active effects, activations, log. */
export function CombatPanel({ c, update, endedNotice }: { c: Character; update: Update; endedNotice?: string[] }) {
  const { roll } = useRoll();
  const [initText, setInitText] = useState("");
  const [custom, setCustom] = useState<{ name: string; rounds: number; text: string; when: ReminderWhen } | null>(null);
  const details = useSpellDetails(c.spellcasting.spells);
  const corrections = useCorrections();
  const ask = useDecision();
  const [showHidden, setShowHidden] = useState(false);
  const s = c.combat;

  if (!s?.active) {
    return (
      <Section title="Combat">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            onClick={() => {
              const r = roll(d20(initiative(c)), { label: "Initiative", kind: "check" });
              update((d) => startCombat(d, r.total));
            }}
          >
            ⚔ Roll initiative & start combat
          </button>
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const n = parseInt(initText, 10); update((d) => startCombat(d, Number.isNaN(n) ? undefined : n)); }}>
            <span className="text-sm text-ink-400">or rolled at the table:</span>
            <input className="field-boxed w-20 py-1 text-center" inputMode="numeric" placeholder={fmt(initiative(c))} value={initText} onChange={(e) => setInitText(e.target.value.replace(/[^\d-]/g, ""))} />
            <button className="btn">Start</button>
          </form>
        </div>
        <p className="mt-2 text-xs text-ink-600">Tracks rounds, your action economy and active effects, and reminds you what to apply when.</p>
      </Section>
    );
  }

  const everything = reminders(c, details);
  const hiddenReminders = dedupe(everything.filter((r) => corrections.isReminderHidden(r.text)));
  const all = everything.filter((r) => !corrections.isReminderHidden(r.text));
  const grouped = ORDER.map((w) => ({ when: w, items: all.filter((r) => r.when === w) })).filter((g) => g.items.length);
  const highlight: ReminderWhen = s.myTurn ? "turnStart" : "damaged";
  const activations = activatableEffects(c);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Section title={`Reminders · round ${s.round}`}>
        {endedNotice && endedNotice.length > 0 && (
          <p className="mb-2 rounded-lg border border-arcane-500/40 bg-arcane-500/10 px-3 py-1.5 text-sm text-arcane-400">Ended: {endedNotice.join(", ")}</p>
        )}
        {grouped.length === 0 && <p className="text-sm text-ink-600">Nothing to remember right now.</p>}
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.when} className={`rounded-lg p-2 ${g.when === highlight ? "border border-accent-600/60 bg-accent-500/5" : ""}`}>
              <h4 className="label mb-1">{REMINDER_LABELS[g.when]}{g.when === highlight && <span className="ml-2 normal-case tracking-normal text-accent-400">← now</span>}</h4>
              <ul className="space-y-1 text-sm">
                {dedupe(g.items).map((r, i) => (
                  <li key={i} className="group flex gap-2">
                    <span className="text-accent-500">•</span>
                    <span>{r.text}</span>
                    <HideButton onClick={() => corrections.hideReminder(r.text)} label="Mark this reminder as incorrect and hide it" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {hiddenReminders.length > 0 && (
          <div className="mt-3 text-[11px] text-ink-600">
            <button className="hover:text-ink-200" onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? "Hide" : "Show"} {hiddenReminders.length} reminder{hiddenReminders.length > 1 ? "s" : ""} marked incorrect
            </button>
            {showHidden && (
              <ul className="mt-1 space-y-0.5">
                {hiddenReminders.map((r) => (
                  <li key={r.text} className="flex items-center gap-2">
                    <span className="line-through">{r.text}</span>
                    <button className="text-accent-400 hover:underline" onClick={() => corrections.restoreReminder(r.text)}>restore</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <div className="space-y-4">
        <Section
          title="Active effects"
          action={<button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setCustom({ name: "", rounds: 10, text: "", when: "always" })}>+ Custom</button>}
        >
          {s.effects.length === 0 && <p className="text-sm text-ink-600">Cast a lasting spell or activate a feature below.</p>}
          <ul className="space-y-1.5">
            {s.effects.map((e) => {
              const left = roundsLeft(c, e);
              return (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    {e.concentration && <span className="text-arcane-400" title="Concentration">◎ </span>}
                    {e.name}
                    <span className="ml-1 text-xs text-ink-400">
                      {e.untilNextTurn ? "until your next turn" : left == null ? "until ended" : left >= 10 ? `${shortDuration(left)} left` : `${left} round${left === 1 ? "" : "s"} left`}
                    </span>
                  </span>
                  <button className="btn-ghost px-1.5 py-0 text-xs hover:text-blood-500" onClick={() => update((d) => endEffect(d, e.id))}>End</button>
                </li>
              );
            })}
          </ul>
          {custom && (
            <form
              className="mt-3 space-y-2 border-t border-ink-800 pt-3 text-sm"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (!custom.name.trim()) return;
                update((d) => addEffect(d, {
                  id: uid(), name: custom.name.trim(), source: "custom", startedRound: d.combat!.round,
                  rounds: custom.rounds > 0 ? custom.rounds : null,
                  reminders: [{ when: custom.when, text: custom.text.trim() ? `${custom.name}: ${custom.text.trim()}` : `${custom.name} is active` }],
                }));
                setCustom(null);
              }}
            >
              <input className="field-boxed" placeholder="Name (e.g. Potion of Speed)" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} autoFocus />
              <input className="field-boxed" placeholder="Reminder (e.g. +2 AC)" value={custom.text} onChange={(e) => setCustom({ ...custom, text: e.target.value })} />
              <div className="flex items-center gap-2">
                <select className="field-boxed w-auto" value={custom.when} onChange={(e) => setCustom({ ...custom, when: e.target.value as ReminderWhen })}>
                  {ORDER.map((w) => <option key={w} value={w}>{REMINDER_LABELS[w]}</option>)}
                </select>
                <NumberField className="field-boxed w-16 text-center" value={custom.rounds} min={0} onChange={(n) => setCustom({ ...custom, rounds: n })} />
                <span className="text-xs text-ink-400">rounds (0 = until ended)</span>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => setCustom(null)}>Cancel</button>
                <button className="btn-primary">Add</button>
              </div>
            </form>
          )}
        </Section>

        {activations.length > 0 && (
          <Section title="Activate">
            <div className="flex flex-wrap gap-2">
              {activations.map((a) => (
                <button
                  key={a.name}
                  className="btn"
                  disabled={a.left === 0 || s.effects.some((e) => e.name === a.name)}
                  title={a.def.reminders.map((r) => r.text).join("\n")}
                  onClick={() => {
                    if (/^wild shape$/i.test(a.name)) return ask({ kind: "wildshape" });
                    update((d) => {
                      const f = d.features.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
                      spendEconomy(d, a.def.always ? "action" : featureKind(d, f ?? { name: a.name, description: "" }), a.name);
                      activateEffect(d, a.def, a.name);
                    });
                  }}
                >
                  <ActionBadge kind={a.def.always ? "action" : featureKind(c, c.features.find((x) => x.name.toLowerCase() === a.name.toLowerCase()) ?? { name: a.name, description: "" })} />{" "}
                  {a.name}{a.left != null ? <span className="text-xs text-ink-400"> ({a.left} left)</span> : null}
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Log">
          <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-ink-400">
            {[...s.log].reverse().slice(0, 20).map((l, i) => <li key={i}><span className="text-ink-600">R{l.round}</span> {l.text}</li>)}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function dedupe(items: Reminder[]) {
  const seen = new Set<string>();
  return items.filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)));
}
