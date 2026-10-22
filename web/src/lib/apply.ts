import { api } from "./api";
import { uid } from "./defaults";
import { skillName } from "./rules";
import { applyDetectedUses } from "./uses";
import { splitFeature } from "./featureSections";
import type {
  Ability, Character, Choice, ChoiceOption, ContentDetail, ContentType, Feature, GrantedSpell, Progression, Selections, SpellEntry, SubFeature,
} from "./types";

/**
 * Turning rules content into sheet changes. Everything that grants something (race, background,
 * feat, class feature) goes through here, so effects and choices behave the same everywhere.
 */

/** Picks plus the options a choice always includes (Elemental Attunement). Repeated keys (+2 as two picks) stay. */
export const withRequired = (ch: Choice, picks: string[]) =>
  ch.required?.length ? [...ch.required, ...picks.filter((k) => !ch.required!.includes(k))] : picks;

/** Fetch text for picked "feature" options so sub-features carry their description. */
export async function resolveSubfeatures(choices: Choice[], selections: Selections): Promise<SubFeature[]> {
  const picks = choices.flatMap((ch) =>
    withRequired(ch, selections[ch.id] ?? []).map((k) => ({ ch, opt: ch.options.find((o) => o.key === k) })).filter((p) => p.opt),
  ) as { ch: Choice; opt: ChoiceOption }[];
  return Promise.all(
    picks.map(async ({ ch, opt }) => {
      let description = opt.description ?? "";
      let grantedSpells: GrantedSpell[] | undefined;
      if (opt.source && opt.type && opt.type !== "spell" && (!description || opt.type === "feature")) {
        const det = await api.detail(opt.type, opt.source, opt.key).catch(() => null);
        description ||= det?.description ?? "";
        grantedSpells = det?.grantedSpells?.length ? det.grantedSpells : undefined;
      }
      return {
        id: uid(),
        choiceId: ch.id,
        key: opt.key,
        name: subfeatureName(ch, opt),
        description,
        ref: opt.source && opt.type ? { source: opt.source, key: opt.key, name: opt.name, type: opt.type } : undefined,
        grantedSpells,
      };
    }),
  );
}

function subfeatureName(ch: Choice, opt: ChoiceOption) {
  switch (ch.kind) {
    case "expertise": return `Expertise: ${opt.name}`;
    case "skill": return `Proficiency: ${opt.name}`;
    case "ability": return `${opt.name} +${ch.amount ?? 1}`;
    case "save": return `Saving throw: ${opt.name}`;
    // "Tools: Dice set", "Languages: Elvish"; mixed picks say which kind by their key ("tool:dice set").
    case "proficiency": return `${ch.prefix === "mixed" ? MIXED_LABEL[opt.key.split(":")[0]] ?? "Proficiency" : ch.prefix}: ${opt.name}`;
    default: return opt.name;
  }
}

const MIXED_LABEL: Record<string, string> = { skill: "Proficiency", tool: "Tools", language: "Languages" };

/** Apply the mechanical side of sub-features (skills, expertise, abilities, saves). */
export function applySubfeatureMechanics(d: Character, choices: Choice[], subs: SubFeature[], direction: 1 | -1 = 1) {
  for (const sub of subs) {
    const ch = choices.find((c) => c.id === sub.choiceId);
    if (!ch) continue;
    if (ch.kind === "skill" && d.skills[sub.key] != null) d.skills[sub.key] = direction > 0 ? Math.max(1, d.skills[sub.key]) as 1 | 2 : 0;
    if (ch.kind === "expertise" && d.skills[sub.key] != null) d.skills[sub.key] = direction > 0 ? 2 : 1;
    if (ch.kind === "expertise" && sub.key === "thieves-tools") {
      // Tools aren't tracked as skills; the sub-feature records it.
    }
    if (ch.kind === "ability") {
      const a = sub.key as Ability;
      d.abilities[a] = Math.min(direction > 0 ? 20 : 30, d.abilities[a] + direction * (ch.amount ?? 1));
      // Resilient: proficiency in the chosen ability's saving throws.
      if (ch.grantsSave) d.saveProficiencies = direction > 0 ? [...new Set([...d.saveProficiencies, a])] : d.saveProficiencies.filter((x) => x !== a);
    }
    if (ch.kind === "proficiency") {
      // A skill from a mixed pick works like any skill proficiency; tools and languages go on the proficiency lines.
      if (sub.key.startsWith("skill:")) {
        const k = sub.key.slice(6);
        if (d.skills[k] != null) d.skills[k] = direction > 0 ? Math.max(1, d.skills[k]) as 1 | 2 : 0;
      } else if (direction > 0) addProficiencyLine(d, sub.name);
      else removeProficiencyLine(d, sub.name);
    }
    if (ch.kind === "save") {
      const a = sub.key as Ability;
      d.saveProficiencies = direction > 0 ? [...new Set([...d.saveProficiencies, a])] : d.saveProficiencies.filter((x) => x !== a);
    }
  }
}

/** Fixed effects: ability bonuses, speed, skill and saving-throw proficiencies, other proficiencies. */
export function applyEffects(d: Character, detail: Pick<ContentDetail, "effects" | "name">) {
  for (const e of detail.effects ?? []) {
    // Increases stop at 20 (Heavy Armor Master taken at STR 20 leaves it at 20).
    if (e.kind === "ability") d.abilities[e.ability] = e.amount > 0 ? Math.max(d.abilities[e.ability], Math.min(20, d.abilities[e.ability] + e.amount)) : d.abilities[e.ability] + e.amount;
    if (e.kind === "speed") d.speed = e.amount;
    if (e.kind === "skill" && d.skills[e.skill] != null) d.skills[e.skill] = Math.max(1, d.skills[e.skill]) as 1 | 2;
    if (e.kind === "expertise" && d.skills[e.skill] != null) d.skills[e.skill] = 2;
    if (e.kind === "save" && !d.saveProficiencies.includes(e.ability)) d.saveProficiencies.push(e.ability);
    if (e.kind === "proficiency") addProficiencyLine(d, e.value);
  }
}

export function removeProficiencyLine(d: Character, line: string) {
  d.proficienciesAndLanguages = d.proficienciesAndLanguages.split("\n").filter((l) => l && l !== line).join("\n");
}

export function addProficiencyLine(d: Character, line: string) {
  const lines = d.proficienciesAndLanguages.split("\n").filter(Boolean);
  if (!lines.includes(line)) d.proficienciesAndLanguages = [...lines, line].join("\n");
}

const KIND_ORIGIN: Record<string, Feature["kind"]> = { race: "race", background: "background", feat: "feat" };

/**
 * Build a Feature from content plus the player's choices. The caller applies it inside an update().
 */
export async function buildFeature(
  detail: ContentDetail,
  selections: Selections,
  origin: string,
  kind?: Feature["kind"],
): Promise<Feature> {
  // Spell, spell-set and feat picks (ids "__…") are applied as spells and feats, not sub-features.
  const choices = (detail.choices ?? []).filter((c) => !c.id.startsWith("__"));
  detail = { ...detail, choices };
  const subfeatures = await resolveSubfeatures(choices, selections);
  return {
    id: uid(),
    name: detail.name,
    origin,
    kind: kind ?? KIND_ORIGIN[detail.type] ?? "other",
    description: detail.description,
    ref: { source: detail.source, key: detail.key, name: detail.name, type: detail.type as ContentType },
    choices: detail.choices?.length ? detail.choices : undefined,
    subfeatures: subfeatures.length ? subfeatures : undefined,
    effects: detail.effects?.length ? detail.effects : undefined,
    grantedSpells: detail.grantedSpells?.length ? detail.grantedSpells : undefined,
    expandedSpells: detail.expandedSpells?.length ? detail.expandedSpells : undefined,
  };
}

/**
 * Spell entries for granted spells reached by `atLevel` (fetches each spell's level).
 * Apply with addGrantedSpells inside an update; duplicates are skipped there.
 */
export async function prepareGrantedSpells(granted: GrantedSpell[] | undefined, atLevel: number, grantedBy: string, classKey?: string): Promise<SpellEntry[]> {
  const due = (granted ?? []).filter((g) => g.level <= atLevel);
  return Promise.all(
    due.map(async (g) => {
      const det = await api.detail("spell", g.spell.source, g.spell.key).catch(() => null);
      return {
        id: uid(),
        ref: g.spell,
        level: det?.level ?? 0,
        classKey,
        prepared: true,
        alwaysPrepared: g.mode === "prepared",
        notes: "",
        grantedBy,
        // Known spells can carry a limit too (Firbolg's detect magic, 1/short rest).
        uses: g.uses,
      };
    }),
  );
}

/** Spells picked for options that let you choose them (Pact of the Tome's cantrips), keyed by option key, then pick index. */
export type OptionSpellSelections = Record<string, Record<number, string[]>>;

/** Record the spells picked for chosen options on their sub-features, so they're granted with the rest. */
export async function addOptionSpellPicks(subs: SubFeature[], sel: OptionSpellSelections | undefined) {
  for (const x of subs) {
    const chosen = sel?.[x.key];
    if (!chosen || !x.ref) continue;
    const det = await api.detail(x.ref.type, x.ref.source, x.ref.key).catch(() => null);
    const picked = (det?.spellPicks ?? []).flatMap((p, i) =>
      (chosen[i] ?? []).flatMap((k) => {
        const spell = p.options.find((o) => o.key === k);
        return spell ? [{ level: p.level, spell, mode: p.mode, uses: p.uses }] : [];
      }),
    );
    if (picked.length) x.grantedSpells = [...(x.grantedSpells ?? []), ...picked];
  }
}

/**
 * Add granted spells. `adopt` lists spells (by key) the player picked for a feature (Pact of the Tome's
 * cantrips): one already on their list moves to the feature and stops counting against spells known.
 */
export function addGrantedSpells(d: Character, entries: SpellEntry[], adopt: string[] = []) {
  for (const e of entries) {
    const existing = d.spellcasting.spells.find((s) => s.ref.key === e.ref.key && s.ref.source === e.ref.source);
    if (existing) {
      // Already known through a class: mark it as always prepared rather than duplicating it.
      if (e.alwaysPrepared) existing.alwaysPrepared = existing.prepared = true;
      // Picked for a feature but added by hand before (Pact of the Tome cantrips): it comes from the
      // feature now, so it stops counting against spells known.
      if (!existing.grantedBy && e.grantedBy && adopt.includes(e.ref.key)) Object.assign(existing, { grantedBy: e.grantedBy, uses: existing.uses ?? e.uses, classKey: e.classKey ?? existing.classKey });
      continue;
    }
    d.spellcasting.spells.push(e);
  }
}

/** Add a built feature to the character with all of its effects and choice mechanics. */
export function grantFeature(d: Character, feature: Feature, detail?: Pick<ContentDetail, "effects" | "name">) {
  if (detail) applyEffects(d, detail);
  applySubfeatureMechanics(d, feature.choices ?? [], feature.subfeatures ?? []);
  // Races (and subclass entries) that bundle several traits become one feature per trait, each with its
  // own uses and action cost.
  const parts = splitFeature(feature);
  for (const p of parts) applyDetectedUses(d, p);
  d.features.push(...parts);
}

/** Replace a race or background, undoing the previous one's ability bonuses and choices. */
export function replaceOrigin(d: Character, kind: "race" | "background") {
  // The race's or background's own features, and feats it granted (origin "Race" / "Background").
  const label = kind === "race" ? "Race" : "Background";
  const from = (f: Feature) => f.kind === kind || (f.kind === "feat" && f.origin === label);
  for (const old of d.features.filter(from)) {
    applySubfeatureMechanics(d, old.choices ?? [], old.subfeatures ?? [], -1);
    for (const e of old.effects ?? []) if (e.kind === "ability") d.abilities[e.ability] -= e.amount;
  }
  d.spellcasting.spells = d.spellcasting.spells.filter((s) => s.grantedBy !== kind);
  d.features = d.features.filter((f) => !from(f));
}

/** Progression picks (Invocations, Maneuvers) are added to the matching feature as sub-features. */
export async function grantProgression(prog: Progression, picks: string[]): Promise<{ choice: Choice; subs: SubFeature[] }> {
  const choice: Choice = { id: `prog-${prog.name}`, label: `${prog.name} (${prog.total} known)`, kind: "feature", count: prog.total, options: prog.options };
  const subs = await resolveSubfeatures([choice], { [choice.id]: picks });
  return { choice, subs };
}

export function attachProgression(d: Character, prog: Progression, choice: Choice, subs: SubFeature[], origin: string) {
  let parent = d.features.find((f) => f.name === prog.name);
  if (!parent) {
    parent = { id: uid(), name: prog.name, origin, kind: "class", description: "" };
    d.features.push(parent);
  }
  parent.choices = [...(parent.choices ?? []).filter((c) => c.id !== choice.id), choice];
  parent.subfeatures = [...(parent.subfeatures ?? []), ...subs];
}

export const describeSelections = (choices: Choice[], selections: Selections) =>
  choices.flatMap((ch) => (selections[ch.id] ?? []).map((k) => ch.options.find((o) => o.key === k)?.name ?? skillName(k)));

/** "Darkvision 60 ft" from a race's data or trait text. */
export function sensesFromRace(det: ContentDetail): string {
  if (det.meta.Darkvision) return `Darkvision ${det.meta.Darkvision}`;
  const m = det.description.match(/darkvision[\s\S]{0,300}?(\d+) feet/i);
  return m ? `Darkvision ${m[1]} ft` : "";
}
