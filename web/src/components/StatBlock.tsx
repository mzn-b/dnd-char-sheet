import { extractRolls } from "../lib/rollText";
import { ABILITY_NAMES, fmt, mod, skillName } from "../lib/rules";
import { d20 } from "../lib/dice";
import { ABILITIES, type MonsterData, type MonsterEntry } from "../lib/types";
import { RollButton } from "./dice";
import { RollList } from "./rolls";
import { Markdown } from "./ui";
import { ActionBadge } from "./ActionBadge";
import type { ActionKind } from "../lib/economy";

const speedText = (m: MonsterData) =>
  Object.entries(m.speed).map(([k, v]) => (k === "walk" ? `${v} ft.` : `${k} ${v} ft.`)).join(", ") + (m.speedNote ? ` (${m.speedNote})` : "");

/** A monster stat block with clickable checks, saves, attacks and damage. */
export function StatBlock({ m, name, compact, onUse }: { m: MonsterData; name: string; compact?: boolean; onUse?: UseHandler }) {
  return (
    <div className="space-y-2 text-sm">
      {!compact && <p className="italic text-ink-400">{m.size} {m.type}{m.alignment ? `, ${m.alignment}` : ""}</p>}
      <div className="grid grid-cols-3 gap-2 border-y border-blood-500/30 py-1.5 text-center">
        <div><div className="label">AC</div>{m.ac}{m.acNote ? <span className="text-xs text-ink-400"> ({m.acNote})</span> : null}</div>
        <div><div className="label">HP</div>{m.hp}{m.hpFormula ? <span className="text-xs text-ink-400"> ({m.hpFormula})</span> : null}</div>
        <div><div className="label">Speed</div><span className="text-xs">{speedText(m)}</span></div>
      </div>
      <div className="grid grid-cols-6 gap-1 text-center">
        {ABILITIES.map((a) => (
          <div key={a}>
            <div className="label">{a}</div>
            <RollButton expression={d20(mod(m.abilities[a]))} label={`${name}: ${ABILITY_NAMES[a]} check`} className="text-sm">
              {m.abilities[a]} ({fmt(mod(m.abilities[a]))})
            </RollButton>
          </div>
        ))}
      </div>
      <dl className="space-y-0.5 text-xs">
        {Object.keys(m.saves).length > 0 && (
          <Line label="Saving Throws">
            {Object.entries(m.saves).map(([a, n], i) => (
              <span key={a}>{i ? ", " : ""}<RollButton expression={d20(n!)} label={`${name}: ${a.toUpperCase()} save`} kind="save">{a.toUpperCase()} {fmt(n!)}</RollButton></span>
            ))}
          </Line>
        )}
        {Object.keys(m.skills).length > 0 && (
          <Line label="Skills">
            {Object.entries(m.skills).map(([k, n], i) => (
              <span key={k}>{i ? ", " : ""}<RollButton expression={d20(n)} label={`${name}: ${skillName(k)}`}>{skillName(k.replace(/ /g, "-"))} {fmt(n)}</RollButton></span>
            ))}
          </Line>
        )}
        {m.vulnerabilities && <Line label="Vulnerabilities">{m.vulnerabilities}</Line>}
        {m.resistances && <Line label="Resistances">{m.resistances}</Line>}
        {m.immunities && <Line label="Immunities">{m.immunities}</Line>}
        {m.conditionImmunities && <Line label="Condition Immunities">{m.conditionImmunities}</Line>}
        {m.senses && <Line label="Senses">{m.senses}</Line>}
        <Line label="Languages">{m.languages}</Line>
        <Line label="Challenge">{m.cr}</Line>
      </dl>
      <Entries list={m.traits} name={name} />
      <Entries title="Actions" list={m.actions} name={name} kind="action" onUse={onUse} />
      <Entries title="Bonus Actions" list={m.bonusActions} name={name} kind="bonus" onUse={onUse} />
      <Entries title="Reactions" list={m.reactions} name={name} kind="reaction" onUse={onUse} />
      <Entries title="Legendary Actions" list={m.legendary} name={name} />
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="inline font-semibold text-ink-200">{label} </dt><dd className="inline text-ink-400">{children}</dd></div>;
}

/** Called when a creature's attack is rolled (so a Wild Shape form's attacks use your action). */
export type UseHandler = (kind: ActionKind, entry: MonsterEntry) => void;

function Entries({ title, list, name, kind, onUse }: { title?: string; list: MonsterEntry[]; name: string; kind?: ActionKind; onUse?: UseHandler }) {
  if (!list.length) return null;
  return (
    <div>
      {title && <h4 className="mb-1 border-b border-blood-500/30 font-display text-base text-blood-500">{title}</h4>}
      <div className="space-y-2">
        {list.map((e, i) => <EntryRow key={i} e={e} name={name} kind={kind} onUse={onUse} />)}
      </div>
    </div>
  );
}

/** One trait/action, with its to-hit and damage as roll buttons. */
export function EntryRow({ e, name, kind, onUse }: { e: MonsterEntry; name: string; kind?: ActionKind; onUse?: UseHandler }) {
  const hit = e.text.match(/([+-]\d+) to hit/);
  const rolls = extractRolls(e.text);
  return (
    <div>
      <div className="flex items-start gap-1.5">
        {kind && <span className="mt-1"><ActionBadge kind={/^multiattack$/i.test(e.name) ? "action" : kind} /></span>}
        <div className="min-w-0 flex-1"><Markdown text={e.name ? `**${e.name}.** ${e.text}` : e.text} /></div>
      </div>
      {(hit || rolls.length > 0) && (
        <div className="mt-0.5 flex flex-wrap items-start gap-2 pl-2">
          {hit && (
            <RollButton expression={d20(Number(hit[1]))} label={`${name} ${e.name}: to hit`} kind="attack" className="rounded border border-accent-600/50 px-1.5 text-sm font-semibold text-accent-400" onRoll={onUse && kind ? () => onUse(kind, e) : undefined}>
              {hit[1]} to hit
            </RollButton>
          )}
          <RollList rolls={rolls} at={{}} compact source={`${name}:${e.name}`} />
        </div>
      )}
    </div>
  );
}
