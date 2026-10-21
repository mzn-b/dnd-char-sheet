import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { uid } from "../../lib/defaults";
import { ABILITY_NAMES, fmt, maxPrepared, spellAttack, spellLevelLabel, spellModel, spellSaveDC } from "../../lib/rules";
import type { Character, ClassEntry, ClassRules, ContentSummary, SpellEntry, SubclassRules } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ContentDetailView, ContentPicker, contentId, expandedEntries } from "../ContentBrowser";
import { Modal, NumberField, Pips, Section } from "../ui";
import { CastButton, SpellBadges, SpellRollInfo, useSpellDetails } from "../spells";
import { RollButton } from "../dice";
import { d20 } from "../../lib/dice";

/** Class whose spell list a class draws from; subclass casters (Eldritch Knight…) use the wizard list. */
const spellList = (k: ClassEntry, r: ClassRules | undefined) => (r && !r.spellcastingAbility ? "wizard" : k.source === "srd" ? k.key : k.name);

/** Eldritch Knight / Arcane Trickster: 1st-level spells at 3, 2nd at 7, 3rd at 13, 4th at 19. */
const thirdCasterMaxLevel = (level: number) => [3, 7, 13, 19].filter((l) => level >= l).length;

/** Highest spell level a class can cast at its current level, per its own table. */
export function maxSpellLevel(rules: ClassRules | undefined, level: number): number {
  const slots = rules?.levels.find((l) => l.level === level)?.spellcasting?.slots;
  if (!slots) return rules && !rules.spellcastingAbility ? thirdCasterMaxLevel(level) : 9;
  const highest = slots.reduce((hi, n, i) => (n > 0 ? i + 1 : hi), 0);
  return highest;
}

/** Subclass rules (expanded spell lists…) for classes that have a subclass, keyed by class key. */
export function useSubclassRules(classes: ClassEntry[]) {
  const withSub = classes.filter((k) => k.subclass);
  const results = useQueries({
    queries: withSub.map((k) => ({
      queryKey: ["subclassRules", k.subclass!.source, k.subclass!.key],
      queryFn: () => api.subclassRules(k.subclass!.source, k.subclass!.key),
      staleTime: Infinity,
    })),
  });
  return Object.fromEntries(withSub.map((k, i) => [k.key, results[i].data])) as Record<string, SubclassRules | undefined>;
}

export function useClassRules(classes: ClassEntry[]) {
  const results = useQueries({
    queries: classes.map((k) => ({
      queryKey: ["classRules", k.source, k.key],
      queryFn: () => api.classRules(k.source, k.key),
      staleTime: Infinity,
    })),
  });
  return Object.fromEntries(classes.map((k, i) => [k.key, results[i].data])) as Record<string, ClassRules | undefined>;
}

export function SpellsTab({ c, update }: { c: Character; update: Update }) {
  const casters = c.classes.filter((k) => k.spellcastingAbility);
  const rules = useClassRules(casters);
  const subRules = useSubclassRules(casters);
  const [adding, setAdding] = useState<{ cls?: ClassEntry } | null>(null);
  const [viewing, setViewing] = useState<SpellEntry | null>(null);
  const owned = useMemo(() => new Set(c.spellcasting.spells.map((s) => contentId(s.ref))), [c.spellcasting.spells]);
  const details = useSpellDetails(c.spellcasting.spells);
  const [filter, setFilter] = useState<"all" | "ready">("all");
  const [q, setQ] = useState("");

  const isReady = (s: SpellEntry) => {
    const cls = c.classes.find((k) => k.key === s.classKey);
    return s.level === 0 || s.prepared || s.alwaysPrepared || !!s.uses || !cls || spellModel(cls) === "known";
  };
  const byLevel = useMemo(() => {
    const groups: Record<number, SpellEntry[]> = {};
    const term = q.trim().toLowerCase();
    for (const s of [...c.spellcasting.spells].sort((a, b) => a.ref.name.localeCompare(b.ref.name))) {
      if (term && !s.ref.name.toLowerCase().includes(term)) continue;
      if (filter === "ready" && !isReady(s)) continue;
      (groups[s.level] ??= []).push(s);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.spellcasting.spells, c.classes, q, filter]);

  const addSpells = (picked: ContentSummary[], cls?: ClassEntry) => {
    update((d) => {
      for (const p of picked) {
        d.spellcasting.spells.push({
          id: uid(),
          ref: { source: p.source, key: p.key, name: p.name },
          level: p.level ?? 0,
          classKey: cls?.key,
          // Cantrips and spells of "known" casters are always ready to cast.
          prepared: (p.level ?? 0) === 0 || !cls || spellModel(cls) === "known",
          alwaysPrepared: false,
          notes: "",
        });
      }
    });
    setAdding(null);
  };

  const editSpell = (id: string, patch: Partial<SpellEntry>) =>
    update((d) => void Object.assign(d.spellcasting.spells.find((s) => s.id === id)!, patch));

  const slotLevels = c.spellcasting.slots.map((s, i) => ({ ...s, level: i + 1 }));

  return (
    <div className="space-y-4">
      {casters.length === 0 && (
        <div className="panel text-sm text-ink-400">
          None of your classes cast spells, but you can still track spells from feats, items or racial traits.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {casters.map((k) => {
          const a = k.spellcastingAbility!;
          const lvl = rules[k.key]?.levels.find((l) => l.level === k.level)?.spellcasting;
          const mine = c.spellcasting.spells.filter((s) => s.classKey === k.key);
          const cantrips = mine.filter((s) => s.level === 0).length;
          const leveled = mine.filter((s) => s.level > 0);
          const prepared = leveled.filter((s) => s.prepared && !s.alwaysPrepared).length;
          const model = spellModel(k);
          const prepLimit = maxPrepared(c, k);
          return (
            <div key={k.key} className="panel space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg">{k.name}</h3>
                <span className="chip">{ABILITY_NAMES[a]}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-ink-850 p-2"><div className="font-display text-2xl">{spellSaveDC(c, a)}</div><div className="label">Save DC</div></div>
                <div className="rounded-lg bg-ink-850 p-2">
                  <RollButton expression={d20(spellAttack(c, a))} label={`${k.name} spell attack`} kind="attack" className="font-display text-2xl">{fmt(spellAttack(c, a))}</RollButton>
                  <div className="label">Attack</div>
                </div>
              </div>
              <ul className="space-y-1 text-sm">
                {lvl && <Limit label="Cantrips known" have={cantrips} max={lvl.cantripsKnown} />}
                {model === "known" && lvl?.spellsKnown != null && <Limit label="Spells known" have={leveled.length} max={lvl.spellsKnown} />}
                {model === "spellbook" && <li className="flex justify-between"><span className="text-ink-400">Spells in spellbook</span><span>{leveled.length}</span></li>}
                {prepLimit != null && <Limit label="Prepared today" have={prepared} max={prepLimit} />}
              </ul>
              <button className="btn w-full" onClick={() => setAdding({ cls: k })}>
                {model === "prepared" ? "Add spells to your list" : model === "spellbook" ? "Add to spellbook" : "Learn / swap spells"}
              </button>
            </div>
          );
        })}
      </div>

      <Section title="Spell Slots" action={<span className="text-[10px] text-ink-600">click pips to spend · edit totals on the right</span>}>
        <div className="grid gap-2 sm:grid-cols-3">
          {slotLevels.map((s) => (
            <div key={s.level} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${s.max ? "bg-ink-850" : "opacity-50"}`}>
              <span className="w-12 text-sm font-semibold">{spellLevelLabel(s.level).replace(" level", "")}</span>
              <Pips max={s.max} used={s.used} color="bg-arcane-500" onChange={(u) => update((d) => void (d.spellcasting.slots[s.level - 1].used = u))} />
              <NumberField
                className="field ml-auto w-8 text-center text-xs text-ink-400"
                value={s.max}
                min={0}
                max={9}
                title="Total slots"
                onChange={(n) => update((d) => void (d.spellcasting.slots[s.level - 1] = { max: n, used: Math.min(d.spellcasting.slots[s.level - 1].used, n) }))}
              />
            </div>
          ))}
          {c.spellcasting.pactSlots.max > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-arcane-500/40 bg-ink-850 px-2 py-1.5">
              <span className="text-sm font-semibold">Pact ({spellLevelLabel(c.spellcasting.pactSlots.level).replace(" level", "")})</span>
              <Pips max={c.spellcasting.pactSlots.max} used={c.spellcasting.pactSlots.used} color="bg-arcane-400" onChange={(u) => update((d) => void (d.spellcasting.pactSlots.used = u))} />
            </div>
          )}
        </div>
      </Section>

      <Section title="Spells" action={<button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setAdding({})}>+ Spell from another source</button>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input className="field-boxed max-w-xs py-1 text-sm" placeholder="Filter spells…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={`chip ${filter === "all" ? "border-accent-600 text-accent-400" : ""}`} onClick={() => setFilter("all")}>All</button>
          <button className={`chip ${filter === "ready" ? "border-accent-600 text-accent-400" : ""}`} onClick={() => setFilter("ready")}>Prepared / castable</button>
        </div>
        {c.spellcasting.spells.length === 0 && <p className="text-sm text-ink-600">No spells yet.</p>}
        <div className="space-y-4">
          {Object.entries(byLevel).map(([level, spells]) => (
            <div key={level}>
              <h4 className="mb-1 border-b border-ink-800 pb-1 font-display text-sm text-accent-400">{spellLevelLabel(Number(level))}</h4>
              <ul>
                {spells.map((s) => {
                  const cls = c.classes.find((k) => k.key === s.classKey);
                  const needsPrep = s.level > 0 && cls && spellModel(cls) !== "known";
                  return (
                    <li key={s.id} className="group flex flex-wrap items-center gap-2 rounded px-1 py-1 text-sm hover:bg-ink-850">
                      {needsPrep ? (
                        <button
                          title={s.alwaysPrepared ? "Always prepared" : s.prepared ? "Prepared" : "Not prepared"}
                          className={`h-3.5 w-3.5 shrink-0 rounded-full border ${s.alwaysPrepared ? "border-arcane-400 bg-arcane-400" : s.prepared ? "border-accent-500 bg-accent-500" : "border-ink-600"}`}
                          onClick={() => !s.alwaysPrepared && editSpell(s.id, { prepared: !s.prepared })}
                        />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-ink-700" title="Always available" />
                      )}
                      <button className="min-w-0 flex-1 truncate text-left hover:text-accent-400" onClick={() => setViewing(s)}>
                        {s.ref.name}
                        {s.grantedBy && <span className="ml-1 text-[10px] text-ink-600">({s.uses ?? (s.alwaysPrepared ? "always prepared" : "granted")})</span>}
                      </button>
                      <SpellRollInfo c={c} spell={s} detail={details[s.id]} />
                        <SpellBadges detail={details[s.id]} />
                      {isReady(s) && <CastButton c={c} update={update} spell={s} detail={details[s.id]} />}
                      {s.ref.source === "homebrew" && <span className="chip border-fuchsia-800 text-fuchsia-300">HB</span>}
                      <span className="text-xs text-ink-600">{cls?.name ?? "Other"}</span>
                      <button className="btn-ghost px-1.5 py-0 text-xs opacity-0 hover:text-blood-500 group-hover:opacity-100" title="Remove" onClick={() => update((d) => void (d.spellcasting.spells = d.spellcasting.spells.filter((x) => x.id !== s.id)))}>✕</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {adding && (
        <ContentPicker
          title={adding.cls ? `${adding.cls.name} spells` : "Add spells"}
          type="spell"
          classLabel={adding.cls?.name}
          filters={adding.cls ? { class: spellList(adding.cls, rules[adding.cls.key]), maxLevel: maxSpellLevel(rules[adding.cls.key], adding.cls.level) } : {}}
          extra={adding.cls?.subclass ? expandedEntries(adding.cls.subclass.name, subRules[adding.cls.key]?.expandedSpells) : undefined}
          disabledIds={owned}
          onClose={() => setAdding(null)}
          onConfirm={(p) => addSpells(p, adding.cls)}
        />
      )}
      {viewing && (
        <Modal title={viewing.ref.name} onClose={() => setViewing(null)}>
          <ContentDetailView type="spell" item={viewing.ref} />
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-arcane-500" checked={viewing.alwaysPrepared} onChange={(e) => { editSpell(viewing.id, { alwaysPrepared: e.target.checked, prepared: true }); setViewing({ ...viewing, alwaysPrepared: e.target.checked }); }} />
            Always prepared (domain, oath or feature spell; doesn't count against your limit)
          </label>
        </Modal>
      )}
    </div>
  );
}

function Limit({ label, have, max }: { label: string; have: number; max: number }) {
  const state = have > max ? "text-blood-500" : have < max ? "text-accent-400" : "text-emerald-400";
  return (
    <li className="flex justify-between">
      <span className="text-ink-400">{label}</span>
      <span className={state} title={have > max ? "Over the limit (allowed, but check with your DM)" : have < max ? "You can choose more" : "Full"}>
        {have} / {max}
      </span>
    </li>
  );
}
