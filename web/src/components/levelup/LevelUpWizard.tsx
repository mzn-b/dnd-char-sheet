import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { uid } from "../../lib/defaults";
import { ABILITY_NAMES, abilityMod, fmt, mod, spellModel, totalLevel } from "../../lib/rules";
import { ABILITIES, type Ability, type Character, type ClassEntry, type ContentRef, type ContentSummary, type Feature } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ContentBrowser, ContentDetailView, contentId } from "../ContentBrowser";
import { Modal, Spinner } from "../ui";
import { planLevel, recomputeSlots } from "./plan";

type StepId = "class" | "hp" | "features" | "asi" | "spells" | "review";
const STEP_LABEL: Record<StepId, string> = {
  class: "Class", hp: "Hit Points", features: "Features", asi: "Ability / Feat", spells: "Spells", review: "Review",
};

export function LevelUpWizard({ c, update, onClose }: { c: Character; update: Update; onClose: () => void }) {
  const qc = useQueryClient();
  const [cls, setCls] = useState<ContentRef | null>(c.classes.length === 1 ? c.classes[0] : null);
  const [step, setStep] = useState<StepId>("class");
  const [hpMode, setHpMode] = useState<"average" | "roll">("average");
  const [hpRoll, setHpRoll] = useState<number | null>(null);
  const [subclass, setSubclass] = useState<ContentSummary | null>(null);
  const [asiMode, setAsiMode] = useState<"asi" | "feat">("asi");
  const [asi, setAsi] = useState<Partial<Record<Ability, number>>>({});
  const [feat, setFeat] = useState<ContentSummary | null>(null);
  const [cantrips, setCantrips] = useState<ContentSummary[]>([]);
  const [spells, setSpells] = useState<ContentSummary[]>([]);
  const [swapOut, setSwapOut] = useState<string>("");
  const [swapIn, setSwapIn] = useState<ContentSummary[]>([]);
  const [applying, setApplying] = useState(false);

  const rulesQuery = useQuery({
    queryKey: ["classRules", cls?.source, cls?.key],
    queryFn: () => api.classRules(cls!.source, cls!.key),
    enabled: !!cls,
    staleTime: Infinity,
  });
  const rules = rulesQuery.data;
  const existing = c.classes.find((k) => cls && k.key === cls.key && k.source === cls.source);
  const plan = useMemo(() => (rules ? planLevel(c, rules) : null), [c, rules]);
  const activeSubclass = existing?.subclass ?? subclass ?? undefined;

  const subclassLevels = useQuery({
    queryKey: ["subclassLevels", activeSubclass?.source, activeSubclass?.key],
    queryFn: () => api.subclassLevels(activeSubclass!.source, activeSubclass!.key),
    enabled: !!activeSubclass,
    staleTime: Infinity,
  });

  const newFeatures = useMemo(() => {
    if (!plan) return [];
    const fromClass = (plan.current?.features ?? []).map((f) => ({ ...f, kind: "class" as const }));
    const fromSub = (subclassLevels.data?.find((l) => l.level === plan.newLevel)?.features ?? []).map((f) => ({ ...f, kind: "subclass" as const }));
    // ASI is represented by the choice step instead of a feature entry.
    return [...fromClass, ...fromSub].filter((f) => !/ability score improvement/i.test(f.name));
  }, [plan, subclassLevels.data]);

  const steps: StepId[] = useMemo(() => {
    if (!plan) return ["class"];
    const s: StepId[] = ["class", "hp", "features"];
    if (plan.grantsAsi) s.push("asi");
    if (plan.cantripPicks || plan.spellPicks || plan.freeSpellPicks || plan.canSwapSpell || plan.preparedNote) s.push("spells");
    s.push("review");
    return s;
  }, [plan]);

  const conMod = abilityMod(c, "con");
  const hitDie = rules?.hitDie ?? 8;
  const baseHp = plan?.isFirstLevelOverall ? hitDie : hpMode === "average" ? Math.floor(hitDie / 2) + 1 : hpRoll ?? 0;
  const newConMod = mod(c.abilities.con + (asiMode === "asi" ? asi.con ?? 0 : 0));
  // A Constitution increase raises HP retroactively for every level.
  const hpGain = Math.max(1, baseHp + newConMod) + (newConMod - conMod) * totalLevel(c);

  const asiPoints = Object.values(asi).reduce((s, n) => s + (n ?? 0), 0);
  const ownedSpells = new Set(c.spellcasting.spells.map((s) => contentId(s.ref)));
  const knownForClass = c.spellcasting.spells.filter((s) => s.classKey === cls?.key && s.level > 0);

  const idx = steps.indexOf(step);
  const go = (d: 1 | -1) => setStep(steps[Math.max(0, Math.min(steps.length - 1, idx + d))]);

  const toggle = (set: React.Dispatch<React.SetStateAction<ContentSummary[]>>) => (item: ContentSummary) =>
    set((s) => (s.some((x) => contentId(x) === contentId(item)) ? s.filter((x) => contentId(x) !== contentId(item)) : [...s, item]));

  const warnings = [
    plan?.needsSubclass && !subclass && "No subclass chosen",
    plan?.grantsAsi && asiMode === "asi" && asiPoints < 2 && `Only ${asiPoints}/2 ability points assigned`,
    plan?.grantsAsi && asiMode === "feat" && !feat && "No feat chosen",
    plan && cantrips.length < plan.cantripPicks && `${plan.cantripPicks - cantrips.length} cantrip(s) left to choose`,
    plan && spells.length < plan.spellPicks && `${plan.spellPicks - spells.length} spell(s) left to choose`,
    hpMode === "roll" && !plan?.isFirstLevelOverall && hpRoll == null && "Hit point die not rolled",
  ].filter(Boolean) as string[];

  async function apply() {
    if (!rules || !plan) return;
    setApplying(true);
    try {
      const fetchDetail = (type: "feature" | "feat" | "subclass", ref: ContentRef) =>
        qc.fetchQuery({ queryKey: ["detail", type, ref.source, ref.key], queryFn: () => api.detail(type, ref.source, ref.key), staleTime: Infinity });
      const [featureDetails, featDetail, subclassDetail] = await Promise.all([
        Promise.all(newFeatures.map((f) => fetchDetail("feature", f).catch(() => null))),
        asiMode === "feat" && feat ? fetchDetail("feat", feat) : null,
        subclass ? fetchDetail("subclass", subclass).catch(() => null) : null,
      ]);
      const summary: string[] = [];
      const origin = `${rules.name} ${plan.newLevel}`;

      update((d) => {
        // Class & level
        let entry = d.classes.find((k) => k.key === rules.index && k.source === rules.source);
        if (!entry) {
          entry = { source: rules.source, key: rules.index, name: rules.name, level: 0, hitDie: rules.hitDie, spellcastingAbility: rules.spellcastingAbility, casterType: rules.casterType };
          d.classes.push(entry);
          if (plan.isFirstLevelOverall) d.saveProficiencies = [...rules.savingThrows];
          summary.push(plan.isFirstLevelOverall ? `Became a ${rules.name}` : `Multiclassed into ${rules.name}`);
        }
        entry.level = plan.newLevel;
        if (subclass) {
          entry.subclass = { source: subclass.source, key: subclass.key, name: subclass.name };
          summary.push(`Chose subclass: ${subclass.name}`);
          if (subclassDetail) d.features.push(feature(subclass.name, origin, "subclass", subclassDetail.description, { ...subclass, type: "subclass" }));
        }

        // Ability scores / feat (before HP so Constitution increases count)
        if (plan.grantsAsi && asiMode === "asi") {
          for (const [a, n] of Object.entries(asi)) if (n) d.abilities[a as Ability] = Math.min(20, d.abilities[a as Ability] + n);
          const parts = Object.entries(asi).filter(([, n]) => n).map(([a, n]) => `${a.toUpperCase()} +${n}`);
          if (parts.length) summary.push(`Ability Score Improvement: ${parts.join(", ")}`);
        }
        if (plan.grantsAsi && asiMode === "feat" && featDetail) {
          d.features.push(feature(featDetail.name, "Feat", "feat", featDetail.description, { ...featDetail, type: "feat" }));
          for (const e of featDetail.effects ?? []) if (e.kind === "ability") d.abilities[e.ability] = Math.min(20, d.abilities[e.ability] + e.amount);
          summary.push(`Took feat: ${featDetail.name}`);
        }

        // Hit points
        d.hp.max += hpGain;
        d.hp.current += hpGain;

        // Features
        newFeatures.forEach((f, i) => {
          const det = featureDetails[i];
          d.features.push(feature(f.name, origin, f.kind, det?.description ?? "", { ...f, type: "feature" }));
        });
        if (newFeatures.length) summary.push(`New features: ${newFeatures.map((f) => f.name).join(", ")}`);

        // Spells
        const addSpell = (s: ContentSummary) =>
          d.spellcasting.spells.push({
            id: uid(), ref: { source: s.source, key: s.key, name: s.name }, level: s.level ?? 0, classKey: rules.index,
            prepared: (s.level ?? 0) === 0 || spellModel(rules.index) === "known", alwaysPrepared: false, notes: "",
          });
        cantrips.forEach(addSpell);
        spells.forEach(addSpell);
        if (swapOut && swapIn[0]) {
          const old = d.spellcasting.spells.find((s) => s.id === swapOut);
          d.spellcasting.spells = d.spellcasting.spells.filter((s) => s.id !== swapOut);
          addSpell(swapIn[0]);
          summary.push(`Swapped ${old?.ref.name} for ${swapIn[0].name}`);
        }
        if (cantrips.length) summary.push(`Learned cantrips: ${cantrips.map((s) => s.name).join(", ")}`);
        if (spells.length) summary.push(`Learned spells: ${spells.map((s) => s.name).join(", ")}`);

        Object.assign(d.spellcasting, recomputeSlots(d.classes, entry, plan.current, d.spellcasting));

        d.levelHistory.push({ classKey: rules.index, className: rules.name, level: plan.newLevel, hpGained: hpGain, summary, at: new Date().toISOString() });
      });
      onClose();
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal
      wide
      title={plan ? `Level up: ${rules!.name} ${plan.newLevel}` : "Level up"}
      onClose={onClose}
      footer={
        <>
          <button className="btn mr-auto" onClick={onClose}>Cancel</button>
          {idx > 0 && <button className="btn" onClick={() => go(-1)}>Back</button>}
          {step !== "review" ? (
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
              className={`rounded-full px-3 py-1 transition ${s === step ? "bg-accent-500 text-ink-950" : i < idx ? "bg-ink-700 text-ink-200" : "bg-ink-850 text-ink-400"}`}
            >
              {i + 1}. {STEP_LABEL[s]}
            </button>
          </li>
        ))}
      </ol>

      {step === "class" && <ClassStep c={c} selected={cls} onSelect={(k) => { setCls(k); setSubclass(null); setCantrips([]); setSpells([]); }} />}
      {cls && rulesQuery.isLoading && <Spinner label="Loading class progression…" />}
      {rulesQuery.error && <p className="text-blood-500">{(rulesQuery.error as Error).message}</p>}

      {plan && rules && step === "hp" && (
        <div className="space-y-4">
          {plan.isFirstLevelOverall ? (
            <p>At 1st level you get the maximum of your hit die: <b>d{hitDie} → {hitDie}</b>.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice active={hpMode === "average"} onClick={() => setHpMode("average")} title="Take the average" desc={`${Math.floor(hitDie / 2) + 1} (fixed)`} />
              <Choice active={hpMode === "roll"} onClick={() => setHpMode("roll")} title={`Roll a d${hitDie}`} desc={hpRoll ? `You rolled ${hpRoll}` : "Feeling lucky?"}>
                {hpMode === "roll" && (
                  <button className="btn mt-2" onClick={(e) => { e.stopPropagation(); setHpRoll(1 + Math.floor(Math.random() * hitDie)); }}>🎲 {hpRoll ? "Reroll" : "Roll"}</button>
                )}
              </Choice>
            </div>
          )}
          <p className="text-lg">
            Max HP increases by <span className="font-display text-2xl text-emerald-400">+{hpGain}</span>
            <span className="ml-2 text-sm text-ink-400">({baseHp} {fmt(newConMod)} Con{newConMod !== conMod ? `, +${(newConMod - conMod) * totalLevel(c)} from Con increase` : ""})</span>
          </p>
          <p className="text-sm text-ink-400">New maximum: {c.hp.max + hpGain}</p>
        </div>
      )}

      {plan && rules && step === "features" && (
        <div className="space-y-4">
          {plan.needsSubclass && (
            <div>
              <h3 className="mb-2 font-display text-lg text-accent-400">Choose your {rules.name} subclass</h3>
              <ContentBrowser
                type="subclass"
                filters={{ class: rules.index }}
                allowAnyClass={false}
                limit={1}
                selected={subclass ? [subclass] : []}
                onToggle={(s) => setSubclass(subclass && contentId(subclass) === contentId(s) ? null : s)}
              />
            </div>
          )}
          <h3 className="font-display text-lg text-accent-400">You gain</h3>
          {newFeatures.length === 0 && <p className="text-sm text-ink-400">No new class features at this level.</p>}
          <div className="space-y-2">
            {newFeatures.map((f) => (
              <details key={f.key} className="rounded-lg border border-ink-800 bg-ink-850/50 p-3" open={newFeatures.length <= 2}>
                <summary className="cursor-pointer font-semibold">{f.name} {f.kind === "subclass" && <span className="chip ml-2">{activeSubclass?.name}</span>}</summary>
                <div className="mt-2"><ContentDetailView type="feature" item={f} /></div>
              </details>
            ))}
          </div>
        </div>
      )}

      {plan && step === "asi" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Choice active={asiMode === "asi"} onClick={() => setAsiMode("asi")} title="Ability Score Improvement" desc="+2 to one score, or +1 to two (max 20)" />
            <Choice active={asiMode === "feat"} onClick={() => setAsiMode("feat")} title="Take a feat" desc="Pick from SRD, Open5e or your homebrew" />
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
            <ContentBrowser
              type="feat"
              limit={1}
              selected={feat ? [feat] : []}
              disabledIds={new Set(c.features.filter((f) => f.kind === "feat" && f.ref).map((f) => contentId(f.ref!)))}
              onToggle={(f) => setFeat(feat && contentId(feat) === contentId(f) ? null : f)}
            />
          )}
        </div>
      )}

      {plan && rules && step === "spells" && (
        <div className="space-y-6">
          {plan.preparedNote && <p className="rounded-lg border border-arcane-500/40 bg-arcane-500/10 p-3 text-sm">{plan.preparedNote}</p>}
          {plan.cantripPicks > 0 && (
            <div>
              <h3 className="mb-2 font-display text-lg text-accent-400">Learn {plan.cantripPicks} cantrip{plan.cantripPicks > 1 ? "s" : ""}</h3>
              <ContentBrowser type="spell" filters={{ class: rules.index, level: 0 }} classLabel={rules.name} limit={plan.cantripPicks} selected={cantrips} disabledIds={ownedSpells} onToggle={toggle(setCantrips)} />
            </div>
          )}
          {(plan.spellPicks > 0 || plan.freeSpellPicks) && (
            <div>
              <h3 className="mb-2 font-display text-lg text-accent-400">
                {plan.freeSpellPicks ? "Add spells (optional)" : spellModel(rules.index) === "spellbook" ? `Add ${plan.spellPicks} spells to your spellbook` : `Learn ${plan.spellPicks} new spell${plan.spellPicks > 1 ? "s" : ""}`}
                <span className="ml-2 text-sm text-ink-400">up to {plan.maxSpellLevel === 0 ? "cantrips" : `level ${plan.maxSpellLevel}`}</span>
              </h3>
              <ContentBrowser
                type="spell"
                filters={{ class: rules.index, minLevel: 1, maxLevel: plan.maxSpellLevel }}
                classLabel={rules.name}
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
                <ContentBrowser type="spell" filters={{ class: rules.index, minLevel: 1, maxLevel: plan.maxSpellLevel }} classLabel={rules.name} limit={1} selected={swapIn} disabledIds={ownedSpells} onToggle={(s) => setSwapIn(swapIn[0] && contentId(swapIn[0]) === contentId(s) ? [] : [s])} />
              )}
            </div>
          )}
        </div>
      )}

      {plan && rules && step === "review" && (
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            <ReviewRow label="Class">{rules.name} {plan.newLevel}{plan.isNewClass && !plan.isFirstLevelOverall ? " (multiclass)" : ""}</ReviewRow>
            <ReviewRow label="Hit points">+{hpGain} (max {c.hp.max + hpGain})</ReviewRow>
            {subclass && <ReviewRow label="Subclass">{subclass.name}</ReviewRow>}
            {newFeatures.length > 0 && <ReviewRow label="Features">{newFeatures.map((f) => f.name).join(", ")}</ReviewRow>}
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

function feature(name: string, origin: string, kind: Feature["kind"], description: string, ref?: Feature["ref"]): Feature {
  return { id: uid(), name, origin, kind, description, ref: ref && { source: ref.source, key: ref.key, name: ref.name, type: ref.type } };
}

function ClassStep({ c, selected, onSelect }: { c: Character; selected: ContentRef | null; onSelect: (k: ContentRef) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["content", "class"], queryFn: () => api.search("class"), staleTime: Infinity });
  const isSel = (k: ContentRef) => selected?.key === k.key && selected.source === k.source;
  const others = (data ?? []).filter((k) => !c.classes.some((x) => x.key === k.key && x.source === k.source));
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
        {c.classes.length > 0 && <p className="mb-2 text-xs text-ink-400">Multiclassing usually requires 13+ in the primary ability of both classes. Not enforced; check with your DM.</p>}
        {isLoading && <Spinner />}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {others.map((k) => (
            <Choice key={`${k.source}:${k.key}`} active={isSel(k)} onClick={() => onSelect(k)} title={k.name} desc={k.source === "homebrew" ? "Homebrew" : ""} />
          ))}
        </div>
      </div>
    </div>
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
      {desc && <div className="text-xs text-ink-400">{desc}</div>}
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
