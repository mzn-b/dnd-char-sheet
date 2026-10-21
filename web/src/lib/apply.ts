import { api } from "./api";
import { uid } from "./defaults";
import { skillName } from "./rules";
import { applyDetectedUses } from "./uses";
import type {
  Ability, Character, Choice, ChoiceOption, ContentDetail, ContentType, Feature, GrantedSpell, Progression, Selections, SpellEntry, SubFeature,
} from "./types";

/**
 * Turning rules content into sheet changes. Everything that grants something (race, background,
 * feat, class feature) goes through here, so effects and choices behave the same everywhere.
 */

/** Fetch text for picked "feature" options so sub-features carry their description. */
export async function resolveSubfeatures(choices: Choice[], selections: Selections): Promise<SubFeature[]> {
  const picks = choices.flatMap((ch) =>
    (selections[ch.id] ?? []).map((k) => ({ ch, opt: ch.options.find((o) => o.key === k) })).filter((p) => p.opt),
  ) as { ch: Choice; opt: ChoiceOption }[];
  return Promise.all(
    picks.map(async ({ ch, opt }) => {
      let description = opt.description ?? "";
      if (!description && opt.source && opt.type) {
        description = await api.detail(opt.type, opt.source, opt.key).then((d) => d.description).catch(() => "");
      }
      return {
        id: uid(),
        choiceId: ch.id,
        key: opt.key,
        name: subfeatureName(ch, opt),
        description,
        ref: opt.source && opt.type ? { source: opt.source, key: opt.key, name: opt.name, type: opt.type } : undefined,
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
    default: return opt.name;
  }
}

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
    if (e.kind === "ability") d.abilities[e.ability] += e.amount;
    if (e.kind === "speed") d.speed = e.amount;
    if (e.kind === "skill" && d.skills[e.skill] != null) d.skills[e.skill] = Math.max(1, d.skills[e.skill]) as 1 | 2;
    if (e.kind === "save" && !d.saveProficiencies.includes(e.ability)) d.saveProficiencies.push(e.ability);
    if (e.kind === "proficiency") addProficiencyLine(d, e.value);
  }
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
  const subfeatures = await resolveSubfeatures(detail.choices ?? [], selections);
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
        uses: g.mode === "innate" ? g.uses : undefined,
      };
    }),
  );
}

export function addGrantedSpells(d: Character, entries: SpellEntry[]) {
  for (const e of entries) {
    const existing = d.spellcasting.spells.find((s) => s.ref.key === e.ref.key && s.ref.source === e.ref.source);
    if (existing) {
      // Already known through a class: mark it as always prepared rather than duplicating it.
      if (e.alwaysPrepared) existing.alwaysPrepared = existing.prepared = true;
      continue;
    }
    d.spellcasting.spells.push(e);
  }
}

/** Add a built feature to the character with all of its effects and choice mechanics. */
export function grantFeature(d: Character, feature: Feature, detail?: Pick<ContentDetail, "effects" | "name">) {
  if (detail) applyEffects(d, detail);
  applyDetectedUses(d, feature);
  applySubfeatureMechanics(d, feature.choices ?? [], feature.subfeatures ?? []);
  d.features.push(feature);
}

/** Replace a race or background, undoing the previous one's ability bonuses and choices. */
export function replaceOrigin(d: Character, kind: "race" | "background") {
  for (const old of d.features.filter((f) => f.kind === kind)) {
    applySubfeatureMechanics(d, old.choices ?? [], old.subfeatures ?? [], -1);
    for (const e of old.effects ?? []) if (e.kind === "ability") d.abilities[e.ability] -= e.amount;
  }
  d.spellcasting.spells = d.spellcasting.spells.filter((s) => s.grantedBy !== kind);
  d.features = d.features.filter((f) => f.kind !== kind);
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
