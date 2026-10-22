import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { classResources } from "../lib/resources";
import {
  ABILITY_NAMES, SKILLS, abilityMod, abilityScore, armorClass, classSummary, fmt, hpMax, initiative, passiveScore, speed, profBonus, saveBonus, skillBonus,
  spellAttack, spellLevelLabel, spellSaveDC, totalLevel,
} from "../lib/rules";
import { ABILITIES, type Character } from "../lib/types";
import { attackBonus, damageBonus } from "../components/sheet/AttacksPanel";
import { withBonus } from "../lib/dice";
import { describeDice, diceAt, scalingNote } from "../lib/spellDice";
import { eldritchBlastBeams, spellDamageBonuses } from "../lib/spellBonuses";
import { useSpellDetails } from "../components/spells";

/** A printer-friendly, light version of the whole sheet. Use the browser's "Save as PDF". */
export default function PrintSheet() {
  const { id } = useParams<{ id: string }>();
  const { data: c } = useQuery({ queryKey: ["character", id], queryFn: () => api.getCharacter(id!) });
  if (!c) return null;
  return (
    <div className="print-sheet -mx-4 -my-6 min-h-screen bg-white px-8 py-6 print:m-0 print:p-0 text-[13px] leading-snug text-zinc-900">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/characters/${c.id}`} className="text-sm text-zinc-500 underline">← Back to sheet</Link>
        <button className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <header className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b-2 border-zinc-900 pb-2">
        <h1 className="font-display text-3xl">{c.name}</h1>
        <dl className="grid grid-cols-3 gap-x-6 text-xs">
          <Pair k="Class & level" v={`${classSummary(c.classes)} (${totalLevel(c)})`} />
          <Pair k="Race" v={c.race} />
          <Pair k="Background" v={c.background} />
          <Pair k="Alignment" v={c.alignment} />
          <Pair k="Player" v={c.playerName} />
          <Pair k="XP" v={c.progression === "milestone" ? "Milestone" : String(c.xp)} />
        </dl>
      </header>

      <div className="grid grid-cols-[13rem_1fr_15rem] gap-4">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {ABILITIES.map((a) => (
              <Box key={a} className="text-center">
                <div className="text-[10px] font-bold uppercase">{a}</div>
                <div className="text-xl font-bold">{fmt(abilityMod(c, a))}</div>
                <div className="text-xs">{abilityScore(c, a)}</div>
              </Box>
            ))}
          </div>
          <Box><b>Proficiency bonus</b> {fmt(profBonus(c))} · <b>Inspiration</b> {c.inspiration ? "●" : "○"}</Box>
          <Box title="Saving throws">
            {ABILITIES.map((a) => <Row key={a} on={c.saveProficiencies.includes(a)} n={saveBonus(c, a)} label={ABILITY_NAMES[a]} />)}
          </Box>
          <Box title="Skills">
            {SKILLS.map((s) => <Row key={s.key} on={(c.skills[s.key] ?? 0) >= 1} expert={c.skills[s.key] === 2} n={skillBonus(c, s.key)} label={`${s.name} (${s.ability})`} />)}
          </Box>
          <Box>Passive Perception <b>{passiveScore(c, "perception")}</b> · Insight <b>{passiveScore(c, "insight")}</b> · Investigation <b>{passiveScore(c, "investigation")}</b>{c.senses ? <div>{c.senses}</div> : null}</Box>
          <Box title="Proficiencies & languages"><Pre text={c.proficienciesAndLanguages} /></Box>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5 text-center">
            <Box><div className="text-xl font-bold">{armorClass(c)}</div><div className="text-[10px] uppercase">Armor class</div></Box>
            <Box><div className="text-xl font-bold">{fmt(initiative(c))}</div><div className="text-[10px] uppercase">Initiative</div></Box>
            <Box><div className="text-xl font-bold">{speed(c)} ft</div><div className="text-[10px] uppercase">Speed</div></Box>
            <Box><div className="text-xl font-bold">{hpMax(c)}</div><div className="text-[10px] uppercase">HP max</div></Box>
          </div>
          <Box>
            <b>Current HP</b> ______ · <b>Temp</b> ______ · <b>Hit dice</b>{" "}
            {Object.entries(c.classes.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k.hitDie]: (acc[k.hitDie] ?? 0) + k.level }), {})).map(([d, n]) => `${n}d${d}`).join(" + ")} ·{" "}
            <b>Death saves</b> ○○○ / ○○○
          </Box>
          <Box title="Attacks & spellcasting">
            <table className="w-full text-xs">
              <thead><tr className="text-left"><th>Name</th><th>Bonus</th><th>Damage</th><th>Notes</th></tr></thead>
              <tbody>
                {c.attacks.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-200"><td>{a.name}</td><td>{fmt(attackBonus(c, a))}</td><td>{a.damage && withBonus(a.damage, damageBonus(c, a))} {a.damageType}</td><td>{a.notes}</td></tr>
                ))}
              </tbody>
            </table>
          </Box>
          {classResources(c).length > 0 && (
            <Box title="Resources">{classResources(c).map((r) => <div key={r.id}>{r.name}: {r.max >= 99 ? "∞" : `${"○".repeat(Math.min(r.max, 20))}${r.max > 20 ? ` (${r.max})` : ""}`} <span className="text-zinc-500">({r.reset} rest{r.die ? `, ${r.die}` : ""})</span></div>)}</Box>
          )}
          <Box title="Features & traits">
            {c.features.map((f) => (
              <div key={f.id} className="mb-1.5 break-inside-avoid">
                <b>{f.name}</b> <span className="text-zinc-500">({f.origin})</span>
                {f.subfeatures?.length ? <span>: {f.subfeatures.map((s) => s.name).join(", ")}</span> : null}
                <div className="line-clamp-4 text-xs text-zinc-700 print:line-clamp-none">{stripMd(f.description)}</div>
              </div>
            ))}
          </Box>
        </div>

        <div className="space-y-3">
          {(["traits", "ideals", "bonds", "flaws"] as const).map((k) => (
            <Box key={k} title={k === "traits" ? "Personality traits" : k}><Pre text={c.personality[k]} /></Box>
          ))}
          <Box title="Equipment">
            {c.equipment.map((i) => <div key={i.id}>{i.qty > 1 ? `${i.qty}× ` : ""}{i.name}{i.equipped ? " (worn)" : ""}{i.attuned ? " ✦" : ""}</div>)}
            <div className="mt-1 border-t border-zinc-200 pt-1 text-xs">CP {c.currency.cp} · SP {c.currency.sp} · EP {c.currency.ep} · GP {c.currency.gp} · PP {c.currency.pp}</div>
          </Box>
        </div>
      </div>

      <SpellPage c={c} />

      <section className="mt-6 break-before-page">
        <h2 className="mb-2 border-b-2 border-zinc-900 font-display text-xl">Character details</h2>
        <div className="grid grid-cols-6 gap-2 text-xs">
          {(["age", "height", "weight", "eyes", "skin", "hair"] as const).map((k) => <Pair key={k} k={k} v={c.details[k]} />)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Box title="Appearance"><Pre text={c.details.appearance} /></Box>
          <Box title="Allies & organizations"><Pre text={[c.details.factionName, c.details.allies].filter(Boolean).join("\n")} /></Box>
          <Box title="Backstory"><Pre text={c.details.backstory} /></Box>
          <Box title="Treasure & additional features"><Pre text={[c.details.treasure, c.details.additionalFeatures].filter(Boolean).join("\n\n")} /></Box>
        </div>
      </section>
    </div>
  );
}

function SpellPage({ c }: { c: Character }) {
  const details = useSpellDetails(c.spellcasting.spells);
  const casters = c.classes.filter((k) => k.spellcastingAbility);
  if (!c.spellcasting.spells.length) return null;
  const levels = [...new Set(c.spellcasting.spells.map((s) => s.level))].sort((a, b) => a - b);
  return (
    <section className="mt-6 break-before-page">
      <h2 className="mb-2 border-b-2 border-zinc-900 font-display text-xl">Spellcasting</h2>
      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        {casters.map((k) => (
          <span key={k.key}><b>{k.name}</b>: {ABILITY_NAMES[k.spellcastingAbility!]} · save DC {spellSaveDC(c, k.spellcastingAbility!)} · attack {fmt(spellAttack(c, k.spellcastingAbility!))}</span>
        ))}
      </div>
      <div className="columns-3 gap-4">
        {levels.map((l) => {
          const slot = l > 0 ? c.spellcasting.slots[l - 1] : null;
          return (
            <div key={l} className="mb-3 break-inside-avoid">
              <div className="border-b border-zinc-400 font-bold">{spellLevelLabel(l)}{slot?.max ? ` · slots ${"○".repeat(slot.max)}` : ""}</div>
              {c.spellcasting.spells.filter((s) => s.level === l).map((s) => (
                <div key={s.id}>
                  {l > 0 ? (s.prepared || s.alwaysPrepared ? "● " : "○ ") : ""}{s.ref.name}{s.uses ? ` (${s.uses})` : ""}
                  {(() => {
                    const dice = details[s.id]?.spell?.dice;
                    const bonus = spellDamageBonuses(c, s, details[s.id]).reduce((n, b) => n + b.amount, 0);
                    const beams = /^eldritch blast$/i.test(s.ref.name) ? eldritchBlastBeams(totalLevel(c)) : 1;
                    const dmg = describeDice(bonus && dice ? { ...dice, addModifier: true } : dice, diceAt(dice, s.level, s.level, totalLevel(c)), bonus || undefined);
                    const text = dmg && beams > 1 ? `${beams}× ${dmg}` : dmg;
                    const extra = [text, scalingNote(dice, s.level), dice?.save && `${dice.save.slice(0, 3)} save`, dice?.attack && "spell attack"].filter(Boolean);
                    return extra.length ? <span className="text-[11px] text-zinc-500"> · {extra.join(" · ")}</span> : null;
                  })()}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const stripMd = (s: string) => s.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^- /gm, "• ");
const Pre = ({ text }: { text: string }) => <div className="whitespace-pre-wrap">{text || " "}</div>;
const Pair = ({ k, v }: { k: string; v: string }) => (
  <div><dt className="text-[10px] uppercase text-zinc-500">{k}</dt><dd className="font-semibold">{v || "—"}</dd></div>
);
function Box({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`break-inside-avoid rounded border border-zinc-400 p-2 ${className}`}>
      {title && <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">{title}</div>}
      {children}
    </div>
  );
}
function Row({ on, expert, n, label }: { on: boolean; expert?: boolean; n: number; label: string }) {
  return <div className="flex gap-2"><span>{expert ? "◉" : on ? "●" : "○"}</span><span className="w-7 text-right">{fmt(n)}</span><span>{label}</span></div>;
}
