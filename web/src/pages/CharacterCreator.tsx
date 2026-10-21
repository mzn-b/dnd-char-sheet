import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { addGrantedSpells, buildFeature, grantFeature, prepareGrantedSpells, sensesFromRace } from "../lib/apply";
import { newCharacter } from "../lib/defaults";
import { attackFromItem, resolveItem } from "../lib/items";
import {
  ABILITY_NAMES, ALIGNMENTS, POINT_BUY_BUDGET, POINT_BUY_COST, STANDARD_ARRAY, fmt, meetsRequirements, mod, requirementText,
} from "../lib/rules";
import { ABILITIES, type Ability, type ContentDetail, type ContentSummary, type Selections } from "../lib/types";
import { ChoiceList, unfinishedChoices } from "../components/ChoicePicker";
import { ContentBrowser, contentId } from "../components/ContentBrowser";
import { NumberField, Section, Spinner, TextArea, TextField } from "../components/ui";

type Step = "start" | "race" | "background" | "abilities" | "classes" | "equipment" | "details" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "start", label: "Start" },
  { id: "race", label: "Race" },
  { id: "background", label: "Background" },
  { id: "abilities", label: "Abilities" },
  { id: "classes", label: "Class" },
  { id: "equipment", label: "Equipment" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
];

type Method = "standard" | "pointbuy" | "roll" | "manual";
interface ClassRow { cls: ContentSummary | null; levels: number }

const roll4d6 = () => {
  const dice = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
  return dice.slice(1).reduce((s, n) => s + n, 0);
};

/**
 * Guided character creation. A level-1 build is made directly; a higher-level build creates
 * the level-1 basics and queues the remaining level-ups, which the sheet walks through with
 * the level-up wizard so every feature, choice and spell is picked properly.
 */
export default function CharacterCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("start");
  const [name, setName] = useState("");
  const [targetLevel, setTargetLevel] = useState(1);
  const [race, setRace] = useState<ContentSummary | null>(null);
  const [raceSel, setRaceSel] = useState<Selections>({});
  const [background, setBackground] = useState<ContentSummary | null>(null);
  const [bgSel, setBgSel] = useState<Selections>({});
  const [method, setMethod] = useState<Method>("standard");
  const [base, setBase] = useState<Record<Ability, number>>({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
  /** Standard array / rolled scores: which pool index each ability got. */
  const [assigned, setAssigned] = useState<Partial<Record<Ability, number>>>({});
  const [rolled, setRolled] = useState<number[]>([]);
  const [rows, setRows] = useState<ClassRow[]>([{ cls: null, levels: 1 }]);
  const [equipment, setEquipment] = useState<Record<number, number>>({});
  const [skipEquipment, setSkipEquipment] = useState(false);
  const [details, setDetails] = useState({ alignment: "", playerName: "", traits: "", ideals: "", bonds: "", flaws: "", backstory: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const detailQuery = (type: "race" | "background", item: ContentSummary | null) => ({
    queryKey: ["detail", type, item?.source, item?.key],
    queryFn: () => api.detail(type, item!.source, item!.key),
    enabled: !!item,
    staleTime: Infinity,
  });
  const raceDetail = useQuery(detailQuery("race", race)).data;
  const bgDetail = useQuery(detailQuery("background", background)).data;
  const classRules = useQueries({
    queries: rows.map((r) => ({
      queryKey: ["classRules", r.cls?.source, r.cls?.key],
      queryFn: () => api.classRules(r.cls!.source, r.cls!.key),
      enabled: !!r.cls,
      staleTime: Infinity,
    })),
  });
  const firstRules = classRules[0]?.data;
  const equipmentGroups = [
    ...(firstRules?.startingEquipment ?? []).map((g) => ({ ...g, from: firstRules!.name })),
    ...(bgDetail?.startingEquipment ?? []).map((g) => ({ ...g, from: bgDetail!.name })),
  ];

  // Base scores from the chosen method.
  const baseScores: Record<Ability, number> = useMemo(() => {
    if (method === "pointbuy" || method === "manual") return base;
    const pool = method === "standard" ? STANDARD_ARRAY : rolled;
    return Object.fromEntries(ABILITIES.map((a) => [a, assigned[a] != null ? pool[assigned[a]!] ?? 8 : 8])) as Record<Ability, number>;
  }, [method, base, assigned, rolled]);

  const bonuses = useMemo(() => racialBonuses(raceDetail, raceSel), [raceDetail, raceSel]);
  const finalScores = Object.fromEntries(ABILITIES.map((a) => [a, baseScores[a] + (bonuses[a] ?? 0)])) as Record<Ability, number>;
  const pointsSpent = ABILITIES.reduce((s, a) => s + (POINT_BUY_COST[base[a]] ?? 0), 0);
  const pool = method === "standard" ? STANDARD_ARRAY : rolled;

  const levelsPlanned = rows.reduce((s, r) => s + (r.cls ? r.levels : 0), 0);
  const prereqProblems = rows.length > 1
    ? classRules.flatMap((q) => (q.data && !meetsRequirements(finalScores, q.data.multiclass.requirements) ? [`${q.data.name} needs ${requirementText(q.data.multiclass.requirements)}`] : []))
    : [];

  const problems: Partial<Record<Step, string[]>> = {
    start: name.trim() ? [] : ["Give your character a name"],
    race: [!race && "Choose a race", ...unfinishedChoices(raceDetail?.choices, raceSel).map((c) => c.label)].filter(Boolean) as string[],
    background: [!background && "Choose a background", ...unfinishedChoices(bgDetail?.choices, bgSel).map((c) => c.label)].filter(Boolean) as string[],
    abilities: [
      method === "pointbuy" && pointsSpent > POINT_BUY_BUDGET && "Point buy is over budget",
      (method === "standard" || method === "roll") && Object.keys(assigned).length < 6 && "Assign all six scores",
    ].filter(Boolean) as string[],
    classes: [
      !rows[0].cls && "Choose a class",
      levelsPlanned !== targetLevel && `Plan ${targetLevel} levels (currently ${levelsPlanned})`,
      ...prereqProblems.map((p) => `Multiclass prerequisite: ${p}`),
    ].filter(Boolean) as string[],
  };

  const idx = STEPS.findIndex((s) => s.id === step);
  const go = (d: 1 | -1) => setStep(STEPS[Math.max(0, Math.min(STEPS.length - 1, idx + d))].id);

  async function create() {
    setCreating(true);
    setError("");
    try {
      const c = newCharacter(name.trim() || "Unnamed hero");
      c.abilities = { ...baseScores };
      c.alignment = details.alignment;
      c.playerName = details.playerName;
      c.personality = { traits: details.traits, ideals: details.ideals, bonds: details.bonds, flaws: details.flaws };
      c.details.backstory = details.backstory;
      if (raceDetail) {
        const f = await buildFeature(raceDetail, raceSel, "Race", "race");
        c.race = raceDetail.name;
        c.raceRef = { source: raceDetail.source, key: raceDetail.key, name: raceDetail.name };
        c.senses = sensesFromRace(raceDetail);
        grantFeature(c, f, raceDetail);
        addGrantedSpells(c, await prepareGrantedSpells(raceDetail.grantedSpells, 1, "race"));
      }
      if (bgDetail) {
        const f = await buildFeature(bgDetail, bgSel, "Background", "background");
        c.background = bgDetail.name;
        c.backgroundRef = { source: bgDetail.source, key: bgDetail.key, name: bgDetail.name };
        grantFeature(c, f, bgDetail);
      }
      if (!skipEquipment) {
        const wanted = equipmentGroups.flatMap((group, gi) => group.options[equipment[gi] ?? 0]?.items ?? []);
        const items = await Promise.all(wanted.map((it) => (/^\d+(\.\d+)? gp$/.test(it.name) ? null : resolveItem(it.name, it.qty))));
        for (const it of wanted) {
          const gp = it.name.match(/^(\d+(?:\.\d+)?) gp$/);
          if (gp) c.currency.gp += Number(gp[1]);
        }
        // Wear the first armor and shield found so AC is right from the start.
        for (const item of items) {
          if (!item) continue;
          const kind = item.data?.armor?.type === "shield" ? "shield" : item.data?.armor ? "armor" : null;
          if (kind && !c.equipment.some((e) => e.equipped && (e.data?.armor?.type === "shield" ? "shield" : "armor") === kind)) item.equipped = true;
          c.equipment.push(item);
        }
        // Weapons become ready-to-roll attacks.
        for (const item of c.equipment.filter((i) => i.data?.weapon)) c.attacks.push(await attackFromItem(c, item, true));
      }
      // Each planned class level becomes a queued level-up, first class first.
      c.pendingLevelUps = rows.flatMap((r) => (r.cls ? Array.from({ length: r.levels }, () => ({ source: r.cls!.source, key: r.cls!.key, name: r.cls!.name })) : []));
      const saved = await api.createCharacter(c);
      navigate(`/characters/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="font-display text-3xl">Create a character</h1>
        <p className="text-sm text-ink-400">Race, background and ability scores first, then your class plan. Class levels are built step by step with the level-up wizard.</p>
      </div>

      <ol className="flex flex-wrap gap-1 text-xs">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              onClick={() => setStep(s.id)}
              className={`rounded-full px-3 py-1 transition ${s.id === step ? "bg-accent-500 text-ink-950" : i < idx ? "bg-ink-700 text-ink-200" : "bg-ink-850 text-ink-400"}`}
            >
              {i + 1}. {s.label}{problems[s.id]?.length && i < idx ? " •" : ""}
            </button>
          </li>
        ))}
      </ol>

      <div className="panel min-h-[420px]">
        {step === "start" && (
          <div className="space-y-6">
            <label className="block max-w-md space-y-1">
              <span className="label">Character name</span>
              <TextField className="field-boxed text-lg" value={name} onChange={setName} placeholder="Elara Moonwhisper" autoFocus />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card active={targetLevel === 1} onClick={() => { setTargetLevel(1); setRows([{ cls: rows[0].cls, levels: 1 }]); }} title="Level 1 character" desc="Start a new adventure from the beginning." />
              <Card active={targetLevel > 1} onClick={() => { setTargetLevel(Math.max(targetLevel, 5)); setRows([{ cls: rows[0].cls, levels: Math.max(targetLevel, 5) }]); }} title="Higher-level character" desc="Join a campaign in progress, or build a one-shot hero.">
                {targetLevel > 1 && (
                  <div className="mt-3 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <input type="range" min={2} max={20} value={targetLevel} className="flex-1 accent-accent-500" onChange={(e) => { const n = Number(e.target.value); setTargetLevel(n); setRows((r) => (r.length === 1 ? [{ ...r[0], levels: n }] : r)); }} />
                    <span className="w-16 font-display text-2xl">Lv {targetLevel}</span>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {step === "race" && (
          <OriginStep type="race" picked={race} detail={raceDetail} selections={raceSel} onPick={(r) => { setRace(r); setRaceSel({}); }} onSelections={setRaceSel} />
        )}
        {step === "background" && (
          <OriginStep type="background" picked={background} detail={bgDetail} selections={bgSel} onPick={(b) => { setBackground(b); setBgSel({}); }} onSelections={setBgSel} />
        )}

        {step === "abilities" && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-1">
              {([["standard", "Standard array"], ["pointbuy", "Point buy"], ["roll", "Roll 4d6"], ["manual", "Manual"]] as const).map(([m, label]) => (
                <button key={m} className={`rounded-lg px-3 py-1.5 text-sm ${method === m ? "bg-ink-800 text-accent-400" : "text-ink-400 hover:text-ink-200"}`} onClick={() => { setMethod(m); setAssigned({}); if (m === "pointbuy") setBase({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }); }}>
                  {label}
                </button>
              ))}
            </div>
            {method === "pointbuy" && (
              <p className={`text-sm ${pointsSpent > POINT_BUY_BUDGET ? "text-blood-500" : "text-ink-400"}`}>Points spent: {pointsSpent} / {POINT_BUY_BUDGET} (scores 8–15 before racial bonuses)</p>
            )}
            {method === "roll" && (
              <div className="flex items-center gap-3">
                <button className="btn" onClick={() => { setRolled(Array.from({ length: 6 }, roll4d6).sort((a, b) => b - a)); setAssigned({}); }}>🎲 {rolled.length ? "Reroll all" : "Roll 6 scores"}</button>
                {rolled.length > 0 && <span className="font-display text-xl tracking-widest">{rolled.join(" · ")}</span>}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ABILITIES.map((a) => {
                const taken = new Set(Object.entries(assigned).filter(([k]) => k !== a).map(([, v]) => v));
                return (
                  <div key={a} className="flex items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-850 p-3">
                    <div>
                      <div className="label">{ABILITY_NAMES[a]}</div>
                      <div className="font-display text-2xl">
                        {finalScores[a]} <span className="text-sm text-ink-400">({fmt(mod(finalScores[a]))})</span>
                      </div>
                      {bonuses[a] ? <div className="text-xs text-emerald-400">+{bonuses[a]} racial</div> : null}
                    </div>
                    {(method === "standard" || method === "roll") && (
                      <select
                        className="field-boxed w-24"
                        value={assigned[a] ?? ""}
                        onChange={(e) => {
                          const i = e.target.value === "" ? null : Number(e.target.value);
                          setAssigned((s) => {
                            const next = { ...s };
                            if (i == null) delete next[a];
                            else next[a] = i;
                            return next;
                          });
                        }}
                      >
                        <option value="">—</option>
                        {pool.map((v, i) => <option key={i} value={i} disabled={taken.has(i)}>{v}</option>)}
                      </select>
                    )}
                    {method === "pointbuy" && (
                      <div className="flex items-center gap-1">
                        <button className="btn px-2" disabled={base[a] <= 8} onClick={() => setBase({ ...base, [a]: base[a] - 1 })}>−</button>
                        <span className="w-6 text-center">{base[a]}</span>
                        <button className="btn px-2" disabled={base[a] >= 15 || pointsSpent + (POINT_BUY_COST[base[a] + 1] - POINT_BUY_COST[base[a]]) > POINT_BUY_BUDGET} onClick={() => setBase({ ...base, [a]: base[a] + 1 })}>+</button>
                      </div>
                    )}
                    {method === "manual" && <NumberField className="field-boxed w-16 text-center" value={base[a]} min={1} max={30} onChange={(n) => setBase({ ...base, [a]: n })} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === "classes" && (
          <div className="space-y-4">
            <p className="text-sm text-ink-400">
              {targetLevel === 1
                ? "Choose your class."
                : `Plan ${targetLevel} levels. Your first class decides your saving throws and full proficiencies; add more rows to multiclass.`}
            </p>
            {rows.map((r, i) => (
              <ClassRowEditor
                key={i}
                row={r}
                index={i}
                rules={classRules[i]?.data}
                scores={finalScores}
                multiclass={rows.length > 1}
                maxLevels={targetLevel - rows.reduce((s, x, j) => (j === i ? s : s + x.levels), 0)}
                showLevels={targetLevel > 1}
                onChange={(next) => setRows(rows.map((x, j) => (j === i ? next : x)))}
                onRemove={i > 0 ? () => setRows(rows.filter((_, j) => j !== i)) : undefined}
              />
            ))}
            {targetLevel > 1 && (
              <div className="flex items-center justify-between">
                <button className="btn" disabled={levelsPlanned >= targetLevel || rows.length >= 4} onClick={() => setRows([...rows, { cls: null, levels: targetLevel - levelsPlanned }])}>+ Multiclass</button>
                <span className={`text-sm ${levelsPlanned === targetLevel ? "text-emerald-400" : "text-accent-400"}`}>{levelsPlanned} / {targetLevel} levels planned</span>
              </div>
            )}
          </div>
        )}

        {step === "equipment" && (
          <div className="space-y-4">
            {!firstRules && !bgDetail && <p className="text-sm text-ink-400">Choose a class and background first.</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-accent-500" checked={skipEquipment} onChange={(e) => setSkipEquipment(e.target.checked)} />
              Skip starting equipment (I'll buy gear with starting gold or add it myself)
            </label>
            {!skipEquipment && equipmentGroups.map((g, gi) => (
              <div key={gi} className="rounded-lg border border-ink-800 p-3">
                <p className="mb-2 text-sm text-ink-400"><span className="chip mr-2">{g.from}</span>{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o, oi) => (
                    <button
                      key={oi}
                      onClick={() => setEquipment({ ...equipment, [gi]: oi })}
                      className={`rounded-lg border px-3 py-1.5 text-left text-sm ${(equipment[gi] ?? 0) === oi ? "border-accent-500 bg-accent-500/10" : "border-ink-700 hover:border-ink-600"}`}
                    >
                      {g.options.length > 1 && <span className="mr-1 text-ink-400">{o.label}</span>}
                      {o.items.map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${it.name}`).join(", ")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!skipEquipment && equipmentGroups.length > 0 && (
              <p className="text-xs text-ink-600">Items are matched to the rules data when the character is created, so armor counts toward AC and weapons can become attacks. "Any martial weapon" style picks are added as placeholders to rename.</p>
            )}
          </div>
        )}

        {step === "details" && (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <span className="label">Alignment</span>
              <select className="field-boxed" value={details.alignment} onChange={(e) => setDetails({ ...details, alignment: e.target.value })}>
                <option value="">—</option>
                {ALIGNMENTS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="label">Player name</span>
              <TextField className="field-boxed" value={details.playerName} onChange={(v) => setDetails({ ...details, playerName: v })} />
            </label>
            {(["traits", "ideals", "bonds", "flaws"] as const).map((k) => {
              const table = bgDetail?.suggestions?.[k] ?? [];
              return (
                <div key={k} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="label">{k === "traits" ? "Personality traits" : k}</span>
                    {table.length > 0 && (
                      <span className="flex items-center gap-1">
                        <button className="btn px-2 py-0 text-xs" title={`Roll on the ${bgDetail!.name} table`} onClick={() => setDetails({ ...details, [k]: pickRandom(table, k === "traits" ? 2 : 1).join("\n") })}>🎲 Roll</button>
                        <select className="field-boxed w-28 py-0.5 text-xs" value="" onChange={(e) => e.target.value && setDetails({ ...details, [k]: [details[k], e.target.value].filter(Boolean).join("\n") })}>
                          <option value="">Pick…</option>
                          {table.map((t, i) => <option key={i} value={t}>{i + 1}. {t.slice(0, 60)}</option>)}
                        </select>
                      </span>
                    )}
                  </div>
                  <TextArea rows={3} value={details[k]} onChange={(v) => setDetails({ ...details, [k]: v })} />
                </div>
              );
            })}
            <label className="space-y-1 md:col-span-2">
              <span className="label">Backstory</span>
              <TextArea rows={4} value={details.backstory} onChange={(v) => setDetails({ ...details, backstory: v })} />
            </label>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row label="Name">{name || "—"}</Row>
              <Row label="Level">{targetLevel}</Row>
              <Row label="Race">{race?.name ?? "—"}</Row>
              <Row label="Background">{background?.name ?? "—"}</Row>
              <Row label="Classes">{rows.filter((r) => r.cls).map((r) => `${r.cls!.name} ${r.levels}`).join(" / ") || "—"}</Row>
              <Row label="Abilities">{ABILITIES.map((a) => `${a.toUpperCase()} ${finalScores[a]}`).join(" · ")}</Row>
            </dl>
            {Object.entries(problems).some(([, p]) => p?.length) && (
              <div className="rounded-lg border border-accent-600/50 bg-accent-500/10 p-3 text-sm">
                <p className="font-semibold text-accent-400">Still open (you can create anyway and fix these on the sheet):</p>
                <ul className="mt-1 list-disc pl-5">{Object.values(problems).flat().map((p) => <li key={p}>{p}</li>)}</ul>
              </div>
            )}
            <p className="text-sm text-ink-400">
              After creating, the level-up wizard opens {targetLevel > 1 ? `${levelsPlanned} times, once per level,` : "once"} so you can pick hit points, class skills, features, choices and spells.
            </p>
            {error && <p className="text-sm text-blood-500">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button className="btn" disabled={idx === 0} onClick={() => go(-1)}>Back</button>
        <div className="flex items-center gap-3">
          {problems[step]?.length ? <span className="text-xs text-accent-400">{problems[step]![0]}</span> : null}
          {step === "review" ? (
            <button className="btn-primary" disabled={creating} onClick={create}>{creating ? "Creating…" : "Create & start leveling"}</button>
          ) : (
            <button className="btn-primary" onClick={() => go(1)}>Next</button>
          )}
        </div>
      </div>
    </div>
  );
}

function racialBonuses(detail: ContentDetail | undefined, sel: Selections): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  for (const e of detail?.effects ?? []) if (e.kind === "ability") out[e.ability] = (out[e.ability] ?? 0) + e.amount;
  for (const ch of detail?.choices ?? []) {
    if (ch.kind !== "ability") continue;
    for (const k of sel[ch.id] ?? []) out[k as Ability] = (out[k as Ability] ?? 0) + (ch.amount ?? 1);
  }
  return out;
}

function OriginStep({
  type, picked, detail, selections, onPick, onSelections,
}: {
  type: "race" | "background";
  picked: ContentSummary | null;
  detail: ContentDetail | undefined;
  selections: Selections;
  onPick: (c: ContentSummary | null) => void;
  onSelections: (s: Selections) => void;
}) {
  return (
    <div className="space-y-4">
      <ContentBrowser type={type} limit={1} selected={picked ? [picked] : []} onToggle={(c) => onPick(picked && contentId(picked) === contentId(c) ? null : c)} />
      {picked && !detail && <Spinner />}
      {detail?.choices?.length ? (
        <Section title={`${detail.name}: your choices`}>
          <ChoiceList choices={detail.choices} selections={selections} onChange={onSelections} />
        </Section>
      ) : null}
    </div>
  );
}

function ClassRowEditor({
  row, index, rules, scores, multiclass, maxLevels, showLevels, onChange, onRemove,
}: {
  row: ClassRow;
  index: number;
  rules: import("../lib/types").ClassRules | undefined;
  scores: Record<Ability, number>;
  multiclass: boolean;
  maxLevels: number;
  showLevels: boolean;
  onChange: (r: ClassRow) => void;
  onRemove?: () => void;
}) {
  const { data } = useQuery({ queryKey: ["content", "class"], queryFn: () => api.search("class"), staleTime: 60_000 });
  const ok = meetsRequirements(scores, rules?.multiclass.requirements);
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-850/50 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="label w-20">{index === 0 ? "Starting class" : "Multiclass"}</span>
        <select
          className="field-boxed min-w-[12rem] flex-1"
          value={row.cls ? contentId(row.cls) : ""}
          onChange={(e) => onChange({ ...row, cls: data?.find((c) => contentId(c) === e.target.value) ?? null })}
        >
          <option value="">Choose a class…</option>
          {data?.map((c) => <option key={contentId(c)} value={contentId(c)}>{c.name}{c.sourceLabel && c.source !== "srd" ? ` (${c.sourceLabel})` : ""}</option>)}
        </select>
        {showLevels && (
          <label className="flex items-center gap-2 text-sm">
            Levels
            <NumberField className="field-boxed w-16 text-center" value={row.levels} min={1} max={Math.max(1, maxLevels)} onChange={(n) => onChange({ ...row, levels: n })} />
          </label>
        )}
        {onRemove && <button className="btn-ghost px-2" onClick={onRemove}>✕</button>}
      </div>
      {rules && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-400">
          <span>Hit die d{rules.hitDie}</span>
          <span>Saves {rules.savingThrows.map((s) => s.toUpperCase()).join(", ")}</span>
          {rules.spellcastingAbility && <span>Casts with {ABILITY_NAMES[rules.spellcastingAbility]}</span>}
          {multiclass && (
            <span className={ok ? "text-emerald-400" : "text-blood-500"}>
              Multiclass prerequisite: {requirementText(rules.multiclass.requirements)} {ok ? "✓" : "✗"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ active, onClick, title, desc, children }: { active: boolean; onClick: () => void; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} className={`cursor-pointer rounded-xl border p-4 transition ${active ? "border-accent-500 bg-accent-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-600"}`}>
      <div className="font-display text-lg">{title}</div>
      <div className="text-sm text-ink-400">{desc}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 border-b border-ink-800 pb-1">
      <dt className="label w-24 pt-0.5">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function pickRandom<T>(list: T[], n: number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
