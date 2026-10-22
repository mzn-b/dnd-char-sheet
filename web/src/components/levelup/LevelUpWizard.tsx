import { takeSnapshot } from "../../lib/levelDown";
import { splitFeature } from "../../lib/featureSections";
import { prereqContext, unmetRequirement } from "../../lib/prereqs";
import { useBookFilter } from "../../lib/books";
import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import {
  addGrantedSpells, addProficiencyLine, applyEffects, applySubfeatureMechanics, prepareGrantedSpells, attachProgression, buildFeature, grantFeature, grantProgression, resolveSubfeatures,
} from "../../lib/apply";
import { uid } from "../../lib/defaults";
import { applyDetectedUses } from "../../lib/uses";
import { ABILITY_NAMES, baseAbilityMod, fmt, meetsRequirements, mod, ordinal, requirementText, skillName, totalLevel } from "../../lib/rules";
import {
  ABILITIES, type Ability, type Character, type Choice, type ChoiceOption, type ClassEntry, type ClassRules, type ContentDetail,
  type ContentRef, type ContentSummary, type Feature, type Selections,
} from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ChoiceList, ChoicePicker, unfinishedChoices } from "../ChoicePicker";
import { ContentBrowser, ContentDetailView, contentId, expandedEntries } from "../ContentBrowser";
import { Markdown, Modal, Spinner } from "../ui";
import { planLevel } from "./plan";
import { applyLevelUp, hpGainFor, newFeaturesFor, optionalSwaps, prepareLevelUp, type LevelUpPicks } from "./levelUp";

type StepId = "class" | "proficiencies" | "hp" | "features" | "asi" | "spells" | "review";
const STEP_LABEL: Record<StepId, string> = {
  class: "Class", proficiencies: "Proficiencies", hp: "Hit Points", features: "Features", asi: "Ability / Feat", spells: "Spells", review: "Review",
};

export interface QueueInfo {
  cls: ContentRef;
  index: number;
  total: number;
}

export function LevelUpWizard({
  c, update, onClose, queue, onApplied,
}: { c: Character; update: Update; onClose: () => void; queue?: QueueInfo; onApplied?: (d: Character) => void }) {
  const qc = useQueryClient();
  const [cls, setCls] = useState<ContentRef | null>(queue?.cls ?? (c.classes.length === 1 ? c.classes[0] : null));
  const [step, setStep] = useState<StepId>(queue ? "proficiencies" : "class");
  const opts = c.options ?? {};
  const [hpMode, setHpMode] = useState<"average" | "roll">(opts.hpMethod === "roll" ? "roll" : "average");
  const [hpRoll, setHpRoll] = useState<number | null>(null);
  const [skillPicks, setSkillPicks] = useState<string[]>([]);
  const [subclass, setSubclass] = useState<ContentSummary | null>(null);
  const [featureSel, setFeatureSel] = useState<Record<string, Selections>>({});
  const [progressionSel, setProgressionSel] = useState<Record<string, string[]>>({});
  /** Optional swap of one known option (invocation, maneuver…) per progression. */
  const [swapSel, setSwapSel] = useState<Record<string, { out: string; in: string[] }>>({});
  const [asiMode, setAsiMode] = useState<"asi" | "feat">("asi");
  const [asi, setAsi] = useState<Partial<Record<Ability, number>>>({});
  const [feat, setFeat] = useState<ContentSummary | null>(null);
  const [featSel, setFeatSel] = useState<Selections>({});
  const [cantrips, setCantrips] = useState<ContentSummary[]>([]);
  const [spells, setSpells] = useState<ContentSummary[]>([]);
  const [swapOut, setSwapOut] = useState<string>("");
  const [swapIn, setSwapIn] = useState<ContentSummary[]>([]);
  const [applying, setApplying] = useState(false);
  const [variantPick, setVariantPick] = useState("");
  const [spellPickSel, setSpellPickSel] = useState<Record<number, string[]>>({});
  const [arcanum, setArcanum] = useState<ContentSummary | null>(null);

  const rulesQuery = useQuery({
    queryKey: ["classRules", cls?.source, cls?.key],
    queryFn: () => api.classRules(cls!.source, cls!.key),
    enabled: !!cls,
    staleTime: Infinity,
  });
  const rules = rulesQuery.data;
  const existing = c.classes.find((k) => cls && k.key === cls.key && k.source === cls.source);
  const activeSubclass = existing?.subclass ?? subclass ?? undefined;

  const subRulesQuery = useQuery({
    queryKey: ["subclassRules", activeSubclass?.source, activeSubclass?.key],
    queryFn: () => api.subclassRules(activeSubclass!.source, activeSubclass!.key),
    enabled: !!activeSubclass,
    staleTime: Infinity,
  });
  const plan = useMemo(() => (rules ? planLevel(c, rules, subRulesQuery.data) : null), [c, rules, subRulesQuery.data]);

  /** Optional (Tasha's) features the player chose not to take, keeping the feature they replace. */
  const [keepOriginal, setKeepOriginal] = useState<Record<string, boolean>>({});
  const optionalOn = opts.optionalClassFeatures !== false;
  const swaps = useMemo(() => optionalSwaps(plan, optionalOn), [plan, optionalOn]);
  const newFeatures = useMemo(() => newFeaturesFor(c, plan, subRulesQuery.data, optionalOn, keepOriginal), [plan, subRulesQuery.data, optionalOn, keepOriginal, c]);

  const featureDetails = useQueries({
    queries: newFeatures.map((f) => ({
      queryKey: ["detail", "feature", f.source, f.key],
      queryFn: () => api.detail("feature", f.source, f.key),
      staleTime: Infinity,
    })),
  });
  const detailOf = (i: number) => featureDetails[i]?.data as ContentDetail | undefined;
  const featDetail = useQuery({
    queryKey: ["detail", "feat", feat?.source, feat?.key],
    queryFn: () => api.detail("feat", feat!.source, feat!.key),
    enabled: !!feat,
    staleTime: Infinity,
  }).data;

  // Every class the character has (or will have) must meet its multiclass prerequisite.
  const allClassRules = useQueries({
    queries: c.classes.map((k) => ({ queryKey: ["classRules", k.source, k.key], queryFn: () => api.classRules(k.source, k.key), staleTime: Infinity })),
  });
  const multiclassProblems = useMemo(() => {
    if (!plan?.isNewClass || plan.isFirstLevelOverall || !rules) return [];
    const list = [rules, ...allClassRules.map((q) => q.data).filter(Boolean)] as ClassRules[];
    return list.filter((r) => !meetsRequirements(c.abilities, r.multiclass.requirements)).map((r) => `${r.name} requires ${requirementText(r.multiclass.requirements)}`);
  }, [plan, rules, allClassRules, c.abilities]);

  const skillChoices = plan?.isNewClass ? (plan.isFirstLevelOverall ? rules?.skillChoices : rules?.multiclass.skillChoices) : null;
  const profLines = plan?.isNewClass ? (plan.isFirstLevelOverall ? rules?.proficiencies : rules?.multiclass.proficiencies) ?? [] : [];

  const steps: StepId[] = useMemo(() => {
    if (!plan) return queue ? [] : ["class"];
    const s: StepId[] = queue ? [] : ["class"];
    if (plan.isNewClass) s.push("proficiencies");
    s.push("hp", "features");
    if (plan.grantsAsi) s.push("asi");
    if (plan.cantripPicks || plan.spellPicks || plan.freeSpellPicks || plan.canSwapSpell || plan.preparedNote) s.push("spells");
    s.push("review");
    return s;
  }, [plan, queue]);
  const currentStep = steps.includes(step) ? step : steps[0];

  const hitDie = rules?.hitDie ?? 8;
  const featCon = asiMode === "feat" ? (featDetail?.effects?.find((e) => e.kind === "ability" && e.ability === "con") as { amount: number } | undefined)?.amount ?? (featSel.ability?.includes("con") ? 1 : 0) : 0;
  const conGain = asiMode === "asi" ? asi.con ?? 0 : featCon;
  const hpGain = plan ? hpGainFor(c, plan, hitDie, { hpMode, hpRoll, conGain }) : 0;
  // For the breakdown shown on the Hit Points step.
  const conMod = baseAbilityMod(c, "con");
  const baseHp = plan?.isFirstLevelOverall ? hitDie : hpMode === "average" ? Math.floor(hitDie / 2) + 1 : hpRoll ?? 0;
  const newConMod = mod(c.abilities.con + (plan?.grantsAsi ? conGain : 0));

  const asiPoints = Object.values(asi).reduce((s, n) => s + (n ?? 0), 0);
  const ownedSpells = new Set(c.spellcasting.spells.map((s) => contentId(s.ref)));
  const knownForClass = c.spellcasting.spells.filter((s) => s.classKey === cls?.key && s.level > 0 && !s.grantedBy);
  const classFilter = rules ? (rules.source === "srd" ? rules.index : rules.name) : undefined;

  const idx = steps.indexOf(currentStep);
  const go = (d: 1 | -1) => setStep(steps[Math.max(0, Math.min(steps.length - 1, idx + d))]);
  const toggle = (set: React.Dispatch<React.SetStateAction<ContentSummary[]>>) => (item: ContentSummary) =>
    set((s) => (s.some((x) => contentId(x) === contentId(item)) ? s.filter((x) => contentId(x) !== contentId(item)) : [...s, item]));

  // Choices later in the wizard should see skills picked earlier in it (Rogue skills → Expertise).
  const preview = useMemo(
    () => ({ ...c, skills: { ...c.skills, ...Object.fromEntries(skillPicks.map((k) => [k, Math.max(1, c.skills[k] ?? 0)])) } }) as Character,
    [c, skillPicks],
  );

  // Subclasses with alternative spell sets (Land's terrain, Divine Soul's affinity, Genie kind, Arcane Archer's cantrip).
  const variants = subRulesQuery.data?.spellVariants;
  const storedVariant = existing?.subclass?.variant;
  const variant = variants?.find((v) => v.name === (storedVariant ?? variantPick));
  const subGranted = variant?.grantedSpells ?? subRulesQuery.data?.grantedSpells;
  // Spells to pick (Nature Domain's cantrip, Additional Magical Secrets): those of this level, or all so far
  // when the subclass is taken now.
  const spellPicks = plan && activeSubclass
    ? (variant?.spellPicks ?? subRulesQuery.data?.spellPicks ?? []).filter((p) => (existing?.subclass ? p.level === plan.newLevel : p.level <= plan.newLevel))
    : [];
  const expanded = activeSubclass ? expandedEntries(activeSubclass.name, variant?.expandedSpells ?? subRulesQuery.data?.expandedSpells) : undefined;

  // Eldritch Knight (abjuration/evocation) and Arcane Trickster (enchantment/illusion) learn spells from two
  // schools, except one pick from any school at class levels 3, 8, 14 and 20.
  const schoolLimit = /eldritch knight/i.test(activeSubclass?.name ?? "") ? ["Abjuration", "Evocation"] : /arcane trickster/i.test(activeSubclass?.name ?? "") ? ["Enchantment", "Illusion"] : undefined;
  const freeSchoolPick = !!plan && [3, 8, 14, 20].includes(plan.newLevel);
  const spellSchools = schoolLimit && !freeSchoolPick ? schoolLimit : undefined;
  const offSchool = schoolLimit ? spells.filter((sp) => !schoolLimit.includes(String(sp.facets?.school ?? ""))).length : 0;

  // Mystic Arcanum (warlock 11/13/15/17): one warlock spell of that level, cast once per long rest.
  const arcanumLevel = Number(newFeatures.map((f) => f.name.match(/^mystic arcanum \((\d)th level\)/i)?.[1]).find(Boolean) ?? 0);

  // Prerequisites (invocation levels, pact boons, Eldritch Blast, infusion levels) against the build after
  // this level, counting picks made in this level-up.
  const prereqs = useMemo(() => {
    const picked = [
      ...(plan?.progressions ?? []).flatMap((p) => (progressionSel[p.name] ?? []).map((k) => p.options.find((o) => o.key === k)?.name ?? "")),
      ...newFeatures.flatMap((f, i) => (detailOf(i)?.choices ?? []).flatMap((ch) => (featureSel[f.key]?.[ch.id] ?? []).map((k) => ch.options.find((o) => o.key === k)?.name ?? ""))),
    ];
    const ctx = prereqContext(c, { classKey: cls?.key, newLevel: plan?.newLevel, picked });
    for (const s of [...cantrips, ...spells]) ctx.spells.add(s.name.toLowerCase());
    return ctx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, cls, plan, progressionSel, featureSel, newFeatures, cantrips, spells, featureDetails]);
  const blocked = (o: ChoiceOption) => unmetRequirement(o, prereqs, rules?.name);

  const progressionTaken = (name: string) => c.features.find((f) => f.name === name)?.subfeatures?.map((s) => s.key) ?? [];

  const warnings = [
    ...(opts.strictMulticlass === false ? [] : multiclassProblems.map((p) => `Multiclass prerequisite not met: ${p}`)),
    skillChoices && skillPicks.length < skillChoices.count && `${skillChoices.count - skillPicks.length} class skill(s) left to choose`,
    plan?.needsSubclass && !subclass && `No ${rules?.subclassTitle ?? "subclass"} chosen`,
    ...newFeatures.flatMap((f, i) => unfinishedChoices(detailOf(i)?.choices, featureSel[f.key] ?? {}).map((ch) => `${f.name}: ${ch.label}`)),
    ...(plan?.progressions ?? []).filter((p) => (progressionSel[p.name]?.length ?? 0) < p.gained).map((p) => `${p.name}: ${p.gained - (progressionSel[p.name]?.length ?? 0)} left to choose`),
    schoolLimit && offSchool > (freeSchoolPick ? 1 : 0) && `Only ${freeSchoolPick ? "one spell" : "no spells"} may come from outside ${schoolLimit.join(" and ")} at this level`,
    arcanumLevel > 0 && !arcanum && `Mystic Arcanum: no ${ordinal(arcanumLevel)}-level spell chosen`,
    variants?.length && !variant && `No ${activeSubclass?.name ?? "subclass"} option chosen (${variants.map((v) => v.name).join(", ")})`,
    ...spellPicks.filter((p, i) => (spellPickSel[i]?.length ?? 0) < p.count).map((p) => `${p.label}: not chosen`),
    plan?.grantsAsi && asiMode === "asi" && asiPoints < 2 && `Only ${asiPoints}/2 ability points assigned`,
    plan?.grantsAsi && asiMode === "feat" && !feat && "No feat chosen",
    plan?.grantsAsi && asiMode === "feat" && featDetail && unfinishedChoices(featDetail.choices, featSel).length > 0 && `${featDetail.name}: choices incomplete`,
    plan && cantrips.length < plan.cantripPicks && `${plan.cantripPicks - cantrips.length} cantrip(s) left to choose`,
    plan && spells.length < plan.spellPicks && `${plan.spellPicks - spells.length} spell(s) left to choose`,
    hpMode === "roll" && !plan?.isFirstLevelOverall && hpRoll == null && "Hit point die not rolled",
  ].filter(Boolean) as string[];

  async function apply() {
    if (!rules || !plan) return;
    setApplying(true);
    try {
      const picks: LevelUpPicks = {
        subclass, activeSubclass, variant, newFeatures, featureDetails: newFeatures.map((_, i) => detailOf(i)), featureSel,
        asiMode, asi, featDetail, featSel, progressionSel, swapSel, spellPicks, spellPickSel, cantrips, spells, swapOut, swapIn,
        arcanum, arcanumLevel, skillPicks, profLines, hpGain,
      };
      const fetchDetail = (type: "feature" | "subclass", ref: ContentRef) =>
        qc.fetchQuery({ queryKey: ["detail", type, ref.source, ref.key], queryFn: () => api.detail(type, ref.source, ref.key), staleTime: Infinity });
      // Resolve everything async first; the update itself must be synchronous.
      const prep = await prepareLevelUp(c, rules, plan, picks, subRulesQuery.data, fetchDetail, (ref) => api.subclassRules(ref.source, ref.key));
      let snapshot: Character | null = null;
      update((d) => {
        applyLevelUp(d, rules, plan, picks, prep);
        onApplied?.(d);
        snapshot = d;
      });
      if (snapshot) onClose();
    } finally {
      setApplying(false);
    }
  }

  const title = queue
    ? `Build: level ${queue.index} of ${queue.total}${plan && rules ? ` (${rules.name} ${plan.newLevel})` : ""}`
    : plan && rules ? `Level up: ${rules.name} ${plan.newLevel}` : "Level up";

  return (
    <Modal
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn mr-auto" onClick={onClose}>{queue ? "Pause build" : "Cancel"}</button>
          {idx > 0 && <button className="btn" onClick={() => go(-1)}>Back</button>}
          {currentStep !== "review" ? (
            <button className="btn-primary" disabled={!plan} onClick={() => go(1)}>Next</button>
          ) : (
            <button className="btn-primary" disabled={applying} onClick={apply}>{applying ? "Applying…" : "Apply level up"}</button>
          )}
        </>
      }
    >
      <ol className="mb-5 flex flex-wrap gap-1 text-xs">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              disabled={!plan}
              onClick={() => setStep(s)}
              className={`rounded-full px-3 py-1 transition ${s === currentStep ? "bg-accent-500 text-ink-950" : i < idx ? "bg-ink-700 text-ink-200" : "bg-ink-850 text-ink-400"}`}
            >
              {i + 1}. {STEP_LABEL[s]}
            </button>
          </li>
        ))}
      </ol>

      {currentStep === "class" && (
        <ClassStep c={c} selected={cls} onSelect={(k) => { setCls(k); setSubclass(null); setCantrips([]); setSpells([]); setSkillPicks([]); setFeatureSel({}); setProgressionSel({}); }} />
      )}
      {cls && rulesQuery.isLoading && <Spinner label="Loading class progression…" />}
      {rulesQuery.error && <p className="text-blood-500">{(rulesQuery.error as Error).message}</p>}
      {currentStep === "class" && multiclassProblems.length > 0 && (
        <div className="mt-4 rounded-lg border border-blood-500/50 bg-blood-500/10 p-3 text-sm">
          <p className="font-semibold text-blood-500">Multiclass prerequisites not met{opts.strictMulticlass === false ? " (allowed by your table's rules)" : ""}</p>
          <ul className="mt-1 list-disc pl-5">{multiclassProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="mt-1 text-ink-400">You can continue anyway if your DM allows it.</p>
        </div>
      )}

      {plan && rules && currentStep === "proficiencies" && (
        <div className="space-y-4">
          <p className="text-sm text-ink-400">
            {plan.isFirstLevelOverall
              ? `As a 1st-level ${rules.name} you gain these proficiencies.`
              : `Multiclassing into ${rules.name} grants only some of its proficiencies.`}
          </p>
          <ul className="space-y-1 text-sm">
            {plan.isFirstLevelOverall && <li><span className="label mr-2">Saving throws</span>{rules.savingThrows.map((a) => ABILITY_NAMES[a]).join(", ")}</li>}
            {profLines.map((l) => <li key={l}>{l}</li>)}
            {!profLines.length && !plan.isFirstLevelOverall && <li className="text-ink-400">No armor or weapon proficiencies.</li>}
          </ul>
          {skillChoices && (
            <ChoicePicker
              character={c}
              choice={{ id: "class-skills", kind: "skill", count: skillChoices.count, label: `Choose ${skillChoices.count} ${rules.name} skill${skillChoices.count > 1 ? "s" : ""}`, options: skillChoices.from.map((k) => ({ key: k, name: skillName(k) })) }}
              selected={skillPicks}
              onChange={setSkillPicks}
            />
          )}
        </div>
      )}

      {plan && rules && currentStep === "hp" && (
        <div className="space-y-4">
          {plan.isFirstLevelOverall ? (
            <p>At 1st level you get the maximum of your hit die: <b>d{hitDie} → {hitDie}</b>.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {opts.hpMethod !== "roll" && (
                <Choice active={hpMode === "average"} onClick={() => setHpMode("average")} title="Take the average" desc={`${Math.floor(hitDie / 2) + 1} (fixed)`} />
              )}
              {opts.hpMethod !== "average" && (
                <Choice active={hpMode === "roll"} onClick={() => setHpMode("roll")} title={`Roll a d${hitDie}`} desc={hpRoll ? `You rolled ${hpRoll}` : "Roll here or type your real die"}>
                  {hpMode === "roll" && (
                    <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button className="btn" onClick={() => setHpRoll(1 + Math.floor(Math.random() * hitDie))}>🎲 {hpRoll ? "Reroll" : "Roll"}</button>
                      <input
                        className="field-boxed w-16 text-center"
                        inputMode="numeric"
                        placeholder={`1–${hitDie}`}
                        aria-label="Your hit die roll"
                        value={hpRoll ?? ""}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); setHpRoll(Number.isNaN(n) ? null : Math.max(1, Math.min(hitDie, n))); }}
                      />
                    </div>
                  )}
                </Choice>
              )}
            </div>
          )}
          <p className="text-lg">
            Max HP increases by <span className="font-display text-2xl text-emerald-400">+{hpGain}</span>
            <span className="ml-2 text-sm text-ink-400">({baseHp} {fmt(newConMod)} Con{newConMod !== conMod ? `, +${(newConMod - conMod) * totalLevel(c)} from Con increase` : ""})</span>
          </p>
          <p className="text-sm text-ink-400">New maximum: {c.hp.max + hpGain}</p>
        </div>
      )}

      {plan && rules && currentStep === "features" && (
        <div className="space-y-5">
          {plan.needsSubclass && (
            <div>
              <h3 className="mb-2 font-display text-lg text-accent-400">Choose your {rules.subclassTitle}</h3>
              <ContentBrowser
                type="subclass"
                filters={{ class: classFilter }}
                allowAnyClass={false}
                limit={1}
                selected={subclass ? [subclass] : []}
                onToggle={(s) => setSubclass(subclass && contentId(subclass) === contentId(s) ? null : s)}
              />
            </div>
          )}
          {swaps.length > 0 && (
            <div className="space-y-1 rounded-lg border border-accent-700/50 bg-accent-500/5 p-3 text-sm">
              <div className="label">Optional class features (Tasha's)</div>
              {swaps.map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <input type="checkbox" checked={!keepOriginal[f.key]} onChange={(e) => setKeepOriginal({ ...keepOriginal, [f.key]: !e.target.checked })} />
                  <span>Take <b>{f.name}</b> instead of {f.replaces}</span>
                </label>
              ))}
            </div>
          )}
          {variants?.length && !storedVariant ? (
            <div className="space-y-1 rounded-lg border border-ink-800 bg-ink-850/50 p-3 text-sm">
              <div className="label">{activeSubclass?.name}: choose one</div>
              <div className="flex flex-wrap gap-1.5">
                {variants.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => setVariantPick(v.name)}
                    title={v.grantedSpells.map((g) => `${g.spell.name} (level ${g.level})`).join(", ")}
                    className={`rounded-lg border px-2.5 py-1 transition ${variantPick === v.name ? "border-accent-500 bg-accent-500/15 text-accent-400" : "border-ink-700 hover:border-ink-600"}`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
              {variant && variant.grantedSpells.length > 0 && (
                <p className="text-xs text-ink-400">Spells: {variant.grantedSpells.map((g) => `${g.spell.name} (${g.level})`).join(", ")}</p>
              )}
            </div>
          ) : null}
          {arcanumLevel > 0 && rules && (
            <div className="rounded-lg border border-ink-800 bg-ink-850/50 p-3">
              <div className="mb-2 text-sm font-semibold">Mystic Arcanum: choose a {ordinal(arcanumLevel)}-level warlock spell (cast once per long rest without a slot)</div>
              <ContentBrowser
                type="spell"
                filters={{ class: spellListClass(rules, subRulesQuery.data), minLevel: arcanumLevel, maxLevel: arcanumLevel }}
                classLabel={spellListLabel(rules, subRulesQuery.data)}
                extra={expanded && { ...expanded, items: expanded.items.filter((e) => e.level === arcanumLevel) }}
                limit={1}
                selected={arcanum ? [arcanum] : []}
                disabledIds={ownedSpells}
                onToggle={(sp) => setArcanum(arcanum && contentId(arcanum) === contentId(sp) ? null : sp)}
              />
            </div>
          )}
          {spellPicks.map((p, i) => (
            <div key={i} className="rounded-lg border border-ink-800 bg-ink-850/50 p-3">
              <ChoicePicker
                choice={{ id: `spellpick-${i}`, kind: "feature", count: p.count, label: `${activeSubclass?.name}: ${p.label} (doesn't count against spells known)`, options: p.options.map((o) => ({ ...o, type: "spell" as const })) } satisfies Choice}
                taken={[...ownedSpells].map((id) => id.split(":").slice(1).join(":"))}
                selected={spellPickSel[i] ?? []}
                onChange={(keys) => setSpellPickSel({ ...spellPickSel, [i]: keys })}
              />
            </div>
          ))}
          <h3 className="font-display text-lg text-accent-400">You gain</h3>
          {newFeatures.length === 0 && plan.progressions.length === 0 && <p className="text-sm text-ink-400">No new class features at this level.</p>}
          <div className="space-y-3">
            {newFeatures.map((f, i) => {
              const det = detailOf(i);
              const choices = det?.choices ?? [];
              return (
                <div key={f.key} className="rounded-lg border border-ink-800 bg-ink-850/50 p-3">
                  <details open={newFeatures.length <= 2 && !choices.length}>
                    <summary className="cursor-pointer font-semibold">
                      {f.name} {f.kind === "subclass" && <span className="chip ml-2">{activeSubclass?.name}</span>}
                      {choices.length > 0 && <span className="chip ml-2 border-accent-600 text-accent-400">choice</span>}
                    </summary>
                    <div className="mt-2">{det ? <Markdown text={det.description || "_No description._"} /> : <Spinner />}</div>
                  </details>
                  {choices.length > 0 && (
                    <div className="mt-3 border-t border-ink-800 pt-3">
                      <ChoiceList choices={choices} character={preview} blocked={blocked} selections={featureSel[f.key] ?? {}} onChange={(s) => setFeatureSel({ ...featureSel, [f.key]: s })} />
                    </div>
                  )}
                </div>
              );
            })}
            {plan.progressions.map((p) => (
              <div key={p.name} className="rounded-lg border border-ink-800 bg-ink-850/50 p-3">
                {p.gained > 0 ? (
                  <ChoicePicker
                    choice={{ id: p.name, kind: "feature", count: p.gained, label: `${p.name}: learn ${p.gained} (you'll know ${p.total})`, options: p.options } satisfies Choice}
                    taken={progressionTaken(p.name)}
                    selected={progressionSel[p.name] ?? []}
                    onChange={(keys) => setProgressionSel({ ...progressionSel, [p.name]: keys })}
                    blocked={blocked}
                  />
                ) : (
                  <div className="label">{p.name}</div>
                )}
                {p.swap && (c.features.find((f) => f.name === p.name)?.subfeatures?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-2 border-t border-ink-800 pt-3">
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-ink-400">Optionally replace one you know:</span>
                      <select
                        className="field-boxed w-auto py-1"
                        value={swapSel[p.name]?.out ?? ""}
                        onChange={(e) => setSwapSel({ ...swapSel, [p.name]: { out: e.target.value, in: [] } })}
                      >
                        <option value="">Keep them all</option>
                        {c.features.find((f) => f.name === p.name)!.subfeatures!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </label>
                    {swapSel[p.name]?.out && (
                      <ChoicePicker
                        choice={{ id: `${p.name}-swap`, kind: "feature", count: 1, label: "Replacement", options: p.options }}
                        taken={[...progressionTaken(p.name), ...(progressionSel[p.name] ?? [])]}
                        blocked={blocked}
                        selected={swapSel[p.name].in}
                        onChange={(keys) => setSwapSel({ ...swapSel, [p.name]: { ...swapSel[p.name], in: keys } })}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {plan && currentStep === "asi" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice active={asiMode === "asi"} onClick={() => setAsiMode("asi")} title="Ability Score Improvement" desc="+2 to one score, or +1 to two (max 20)" />
            {opts.feats !== false ? (
              <Choice active={asiMode === "feat"} onClick={() => setAsiMode("feat")} title="Take a feat" desc="Pick from any enabled source or your homebrew" />
            ) : (
              <p className="self-center text-sm text-ink-600">Feats are turned off in this character's optional rules.</p>
            )}
          </div>
          {asiMode === "asi" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ABILITIES.map((a) => {
                const add = asi[a] ?? 0;
                const score = c.abilities[a] + add;
                return (
                  <div key={a} className="flex items-center justify-between rounded-lg border border-ink-800 bg-ink-850 p-3">
                    <div>
                      <div className="label">{ABILITY_NAMES[a]}</div>
                      <div className="font-display text-xl">{score} <span className="text-sm text-ink-400">({fmt(mod(score))})</span></div>
                    </div>
                    <div className="flex gap-1">
                      <button className="btn px-2" disabled={!add} onClick={() => setAsi({ ...asi, [a]: add - 1 })}>−</button>
                      <button className="btn px-2" disabled={asiPoints >= 2 || score >= 20} onClick={() => setAsi({ ...asi, [a]: add + 1 })}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <ContentBrowser
                type="feat"
                limit={1}
                selected={feat ? [feat] : []}
                disabledIds={new Set(c.features.filter((f) => f.kind === "feat" && f.ref).map((f) => contentId(f.ref!)))}
                onToggle={(f) => { setFeat(feat && contentId(feat) === contentId(f) ? null : f); setFeatSel({}); }}
              />
              {featDetail?.choices?.length ? (
                <div className="rounded-lg border border-ink-800 p-3">
                  <ChoiceList choices={featDetail.choices} selections={featSel} onChange={setFeatSel} character={c} />
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {plan && rules && currentStep === "spells" && (
        <div className="space-y-6">
          {plan.preparedNote && <p className="rounded-lg border border-arcane-500/40 bg-arcane-500/10 p-3 text-sm">{plan.preparedNote}</p>}
          {plan.cantripPicks > 0 && (
            <div>
              <h3 className="mb-2 font-display text-lg text-accent-400">Learn {plan.cantripPicks} cantrip{plan.cantripPicks > 1 ? "s" : ""}</h3>
              <ContentBrowser type="spell" filters={{ class: spellListClass(rules, subRulesQuery.data), level: 0 }} classLabel={spellListLabel(rules, subRulesQuery.data)} limit={plan.cantripPicks} selected={cantrips} disabledIds={ownedSpells} onToggle={toggle(setCantrips)} />
            </div>
          )}
          {(plan.spellPicks > 0 || plan.freeSpellPicks) && (
            <div>
              <h3 className="mb-2 font-display text-lg text-accent-400">
                {plan.freeSpellPicks ? "Add spells (optional)" : plan.spellModel === "spellbook" ? `Add ${plan.spellPicks} spells to your spellbook` : `Learn ${plan.spellPicks} new spell${plan.spellPicks > 1 ? "s" : ""}`}
                <span className="ml-2 text-sm text-ink-400">up to {plan.maxSpellLevel === 0 ? "cantrips" : `level ${plan.maxSpellLevel}`}</span>
                {schoolLimit && <span className="ml-2 text-sm text-ink-400">· {schoolLimit.join(" or ")}{freeSchoolPick ? " (one may be from any school)" : ""}</span>}
              </h3>
              <ContentBrowser
                type="spell"
                filters={{ class: spellListClass(rules, subRulesQuery.data), minLevel: 1, maxLevel: plan.maxSpellLevel, schools: spellSchools }}
                classLabel={spellListLabel(rules, subRulesQuery.data)}
                extra={expanded}
                limit={plan.freeSpellPicks ? undefined : plan.spellPicks}
                selected={spells}
                disabledIds={ownedSpells}
                onToggle={toggle(setSpells)}
              />
            </div>
          )}
          {plan.canSwapSpell && knownForClass.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display text-lg text-accent-400">Optional: replace a known spell</h3>
              <select className="field-boxed" value={swapOut} onChange={(e) => { setSwapOut(e.target.value); setSwapIn([]); }}>
                <option value="">Keep all my spells</option>
                {knownForClass.map((s) => <option key={s.id} value={s.id}>{s.ref.name} (level {s.level})</option>)}
              </select>
              {swapOut && (
                <ContentBrowser type="spell" filters={{ class: spellListClass(rules, subRulesQuery.data), minLevel: 1, maxLevel: plan.maxSpellLevel, schools: schoolLimit }} classLabel={spellListLabel(rules, subRulesQuery.data)} extra={expanded} limit={1} selected={swapIn} disabledIds={ownedSpells} onToggle={(s) => setSwapIn(swapIn[0] && contentId(swapIn[0]) === contentId(s) ? [] : [s])} />
              )}
            </div>
          )}
        </div>
      )}

      {plan && rules && currentStep === "review" && (
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            <ReviewRow label="Class">{rules.name} {plan.newLevel}{plan.isNewClass && !plan.isFirstLevelOverall ? " (multiclass)" : ""}</ReviewRow>
            {skillPicks.length > 0 && <ReviewRow label="Skills">{skillPicks.map(skillName).join(", ")}</ReviewRow>}
            <ReviewRow label="Hit points">+{hpGain} (max {c.hp.max + hpGain})</ReviewRow>
            {subclass && <ReviewRow label={rules.subclassTitle}>{subclass.name}</ReviewRow>}
            {newFeatures.length > 0 && (
              <ReviewRow label="Features">
                {newFeatures.map((f, i) => {
                  const picks = (detailOf(i)?.choices ?? []).flatMap((ch) => (featureSel[f.key]?.[ch.id] ?? []).map((k) => ch.options.find((o) => o.key === k)?.name));
                  return <div key={f.key}>{f.name}{picks.length ? <span className="text-ink-400">: {picks.join(", ")}</span> : null}</div>;
                })}
              </ReviewRow>
            )}
            {plan.progressions.map((p) => (
              <ReviewRow key={p.name} label={p.name}>{(progressionSel[p.name] ?? []).map((k) => p.options.find((o) => o.key === k)?.name).join(", ") || "—"}</ReviewRow>
            ))}
            {plan.grantsAsi && (
              <ReviewRow label={asiMode === "asi" ? "Ability scores" : "Feat"}>
                {asiMode === "asi" ? Object.entries(asi).filter(([, n]) => n).map(([a, n]) => `${a.toUpperCase()} +${n}`).join(", ") || "—" : feat?.name ?? "—"}
              </ReviewRow>
            )}
            {cantrips.length > 0 && <ReviewRow label="Cantrips">{cantrips.map((s) => s.name).join(", ")}</ReviewRow>}
            {spells.length > 0 && <ReviewRow label="Spells">{spells.map((s) => s.name).join(", ")}</ReviewRow>}
            {swapOut && swapIn[0] && <ReviewRow label="Swap">{knownForClass.find((s) => s.id === swapOut)?.ref.name} → {swapIn[0].name}</ReviewRow>}
          </ul>
          {warnings.length > 0 && (
            <div className="rounded-lg border border-accent-600/50 bg-accent-500/10 p-3 text-sm">
              <p className="font-semibold text-accent-400">Unfinished choices (you can still apply and fix them later on the sheet):</p>
              <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Spell list to draw from: the class's own, or the subclass's parent list (Eldritch Knight → Wizard). */
function spellListClass(rules: ClassRules, sub?: { spellcastingAbility: Ability | null }) {
  if (!rules.spellcastingAbility && sub?.spellcastingAbility) return "wizard";
  return rules.source === "srd" ? rules.index : rules.name;
}
const spellListLabel = (rules: ClassRules, sub?: { spellcastingAbility: Ability | null }) =>
  !rules.spellcastingAbility && sub?.spellcastingAbility ? "Wizard" : rules.name;

function ClassStep({ c, selected, onSelect }: { c: Character; selected: ContentRef | null; onSelect: (k: ContentRef) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["content", "class"], queryFn: () => api.search("class"), staleTime: 60_000 });
  const isSel = (k: ContentRef) => selected?.key === k.key && selected.source === k.source;
  const { allowed } = useBookFilter();
  const others = (data ?? []).filter((k) => allowed(k) && !c.classes.some((x) => x.key === k.key && x.source === k.source));
  return (
    <div className="space-y-4">
      {c.classes.length > 0 && (
        <div>
          <h3 className="label mb-2">Advance an existing class</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {c.classes.map((k: ClassEntry) => (
              <Choice key={k.key} active={isSel(k)} onClick={() => onSelect(k)} title={k.name} desc={`Level ${k.level} → ${k.level + 1}`} />
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="label mb-2">{c.classes.length ? "Or multiclass into" : "Choose your class"}</h3>
        {isLoading && <Spinner />}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {others.map((k) => (
            <Choice key={`${k.source}:${k.key}`} active={isSel(k)} onClick={() => onSelect(k)} title={k.name} desc={k.sourceLabel ?? ""} />
          ))}
        </div>
      </div>
      {selected && <ContentDetailPeek item={selected} />}
    </div>
  );
}

function ContentDetailPeek({ item }: { item: ContentRef }) {
  return (
    <details className="rounded-lg border border-ink-800 p-3 text-sm">
      <summary className="cursor-pointer text-ink-400">About {item.name}</summary>
      <div className="mt-2"><ContentDetailView type="class" item={item} /></div>
    </details>
  );
}

function Choice({ active, onClick, title, desc, children }: { active: boolean; onClick: () => void; title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`cursor-pointer rounded-xl border p-3 text-left transition ${active ? "border-accent-500 bg-accent-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-600"}`}
    >
      <div className="font-semibold">{title}</div>
      {desc && <div className="truncate text-xs text-ink-400">{desc}</div>}
      {children}
    </div>
  );
}

function ReviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[8rem_1fr] gap-2 border-b border-ink-800 pb-2">
      <span className="label pt-0.5">{label}</span>
      <span>{children}</span>
    </li>
  );
}
