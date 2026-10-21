import { cachedFetch } from "./http.js";
import {
  SKILL_KEYS, skillName, toSkillKey, singleClassSlots,
  type Ability, type Choice, type ChoiceOption, type ClassRules, type ContentDetail, type ContentSummary,
  type ContentType, type Effect, type EquipmentChoice, type ExpandedSpell, type GrantedSpell, type ItemData, type LevelRules, type SpellDice,
} from "./types.js";
import { diceFromText, mergeDice } from "./spellDice.js";

const BASE = (process.env.SRD_API_URL ?? "https://www.dnd5eapi.co") + "/api/2014";
const LABEL = "SRD 5.1";

const ENDPOINT: Record<ContentType, string> = {
  spell: "spells",
  feat: "feats",
  item: "equipment",
  race: "races",
  background: "backgrounds",
  feature: "features",
  subclass: "subclasses",
  class: "classes",
};

const srd = <T = any>(path: string) => cachedFetch<T>(`${BASE}/${path}`);
const join = (parts?: string[]) => (parts ?? []).join("\n\n");
const optionsOf = (o: any): any[] => o?.from?.options ?? [];

export async function listSrd(type: ContentType, opts: { cls?: string }): Promise<ContentSummary[]> {
  const base = (r: any): ContentSummary => ({ source: "srd", key: r.index, type, name: r.name, sourceLabel: LABEL });
  if (type === "spell") {
    const path = opts.cls ? `classes/${opts.cls}/spells` : "spells";
    const { results } = await srd<{ results: any[] }>(path).catch(() => ({ results: [] }));
    return results.map((r) => ({ ...base(r), level: r.level, classes: opts.cls ? [opts.cls] : undefined }));
  }
  if (type === "subclass" && opts.cls) {
    const { results } = await srd<{ results: any[] }>(`classes/${opts.cls}/subclasses`).catch(() => ({ results: [] }));
    return results.map((r) => ({ ...base(r), classes: [opts.cls!] }));
  }
  if (type === "race") {
    // List each subrace as its own option ("High Elf"), plus races without subraces.
    const { results } = await srd<{ results: any[] }>("races");
    const races = await Promise.all(results.map((r) => srd<any>(`races/${r.index}`)));
    return races.flatMap((r) =>
      r.subraces?.length
        ? r.subraces.map((s: any) => ({ ...base(r), key: `${r.index}/${s.index}`, name: s.name }))
        : [base(r)],
    );
  }
  const { results } = await srd<{ results: any[] }>(ENDPOINT[type]);
  return results.map(base);
}

export async function getSrd(type: ContentType, key: string): Promise<ContentDetail> {
  if (type === "race") return raceDetail(key);
  const r = await srd<any>(`${ENDPOINT[type]}/${key}`);
  const base = { source: "srd" as const, key, type, name: r.name, sourceLabel: LABEL };
  switch (type) {
    case "spell":
      return {
        ...base,
        level: r.level,
        classes: r.classes?.map((c: any) => c.index),
        description: join(r.desc) + (r.higher_level?.length ? `\n\n**At Higher Levels.** ${join(r.higher_level)}` : ""),
        meta: {
          Level: r.level === 0 ? "Cantrip" : String(r.level),
          School: r.school?.name ?? "",
          "Casting Time": r.casting_time,
          Range: r.range,
          Components: (r.components ?? []).join(", ") + (r.material ? ` (${r.material})` : ""),
          Duration: (r.concentration ? "Concentration, " : "") + r.duration,
        },
        spell: { school: r.school?.name, ritual: r.ritual, concentration: r.concentration, dice: srdSpellDice(r) },
      };
    case "feat":
      return {
        ...base,
        description: join(r.desc),
        prerequisite: r.prerequisites?.map((p: any) => `${p.ability_score?.name ?? ""} ${p.minimum_score ?? ""}`.trim()).join(", "),
        meta: {},
      };
    case "item":
      return {
        ...base,
        description: join(r.desc),
        meta: compact({
          Category: r.equipment_category?.name + (r.weapon_range ? ` (${r.weapon_range} Weapon)` : ""),
          Cost: r.cost ? `${r.cost.quantity} ${r.cost.unit}` : undefined,
          Weight: r.weight != null ? `${r.weight} lb` : undefined,
          Damage: r.damage ? `${r.damage.damage_dice} ${r.damage.damage_type?.name ?? ""}` : undefined,
          AC: r.armor_class ? `${r.armor_class.base}${r.armor_class.dex_bonus ? " + Dex" : ""}` : undefined,
          Properties: r.properties?.map((p: any) => p.name).join(", ") || undefined,
        }),
        item: itemData(r),
      };
    case "background": {
      const effects: Effect[] = (r.starting_proficiencies ?? [])
        .filter((p: any) => p.index.startsWith("skill-"))
        .map((p: any) => ({ kind: "skill", skill: toSkillKey(p.index) }));
      const other = (r.starting_proficiencies ?? []).filter((p: any) => !p.index.startsWith("skill-")).map((p: any) => p.name);
      if (other.length) effects.push({ kind: "proficiency", value: `Tools: ${other.join(", ")}` });
      if (r.language_options) effects.push({ kind: "proficiency", value: `Languages: ${r.language_options.choose} of your choice` });
      const strings = (o: any) => optionsOf(o).map((x: any) => x.string ?? x.desc).filter(Boolean);
      return {
        ...base,
        description: r.feature ? `**${r.feature.name}.** ${join(r.feature.desc)}` : "",
        meta: compact({ "Skill Proficiencies": effects.filter((e) => e.kind === "skill").map((e: any) => skillName(e.skill)).join(", ") }),
        effects,
        suggestions: { traits: strings(r.personality_traits), ideals: strings(r.ideals), bonds: strings(r.bonds), flaws: strings(r.flaws) },
        startingEquipment: startingEquipment(r),
      };
    }
    case "subclass":
      return { ...base, classes: [r.class?.index], description: join(r.desc), meta: { Flavor: r.subclass_flavor ?? "" }, grantedSpells: subclassSpells(r) };
    case "feature":
      return { ...base, description: join(r.desc), meta: {}, choices: featureChoices(r) };
    default:
      return { ...base, description: join(r.desc), meta: {} };
  }
}

const SAVE_NAMES: Record<string, string> = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };

function srdSpellDice(r: any): SpellDice | undefined {
  const d = r.damage?.[0];
  const structured: Partial<SpellDice> = {
    save: r.dc ? SAVE_NAMES[r.dc.dc_type?.name] ?? r.dc.dc_type?.name : undefined,
    attack: r.attack_type ? (r.attack_type.toLowerCase() as "melee" | "ranged") : undefined,
  };
  if (d?.damage_at_slot_level) {
    Object.assign(structured, { kind: "damage", bySlot: d.damage_at_slot_level, base: d.damage_at_slot_level[String(r.level)] });
  } else if (d?.damage_at_character_level) {
    Object.assign(structured, { kind: "damage", byCharacterLevel: d.damage_at_character_level, base: d.damage_at_character_level["1"] });
  }
  if (d?.damage_type) structured.types = r.damage.map((x: any) => x.damage_type?.name?.toLowerCase()).filter(Boolean);
  if (r.heal_at_slot_level) {
    const bySlot = Object.fromEntries(Object.entries(r.heal_at_slot_level as Record<string, string>).map(([k, v]) => [k, v.replace(/\s*\+\s*MOD/i, "").trim()]));
    Object.assign(structured, { kind: "heal", bySlot, base: bySlot[String(r.level)], addModifier: JSON.stringify(r.heal_at_slot_level).includes("MOD") });
  }
  return mergeDice(structured, diceFromText(join(r.desc), join(r.higher_level)));
}

/** Translate the SRD API's feature_specific option sets into normalized choices. */
function featureChoices(r: any): Choice[] {
  const fs = r.feature_specific ?? {};
  const choices: Choice[] = [];
  if (fs.subfeature_options) {
    const count = fs.subfeature_options.choose ?? 1;
    choices.push({
      id: r.index,
      kind: "feature",
      count,
      label: `Choose ${count} ${r.name.replace(/\s*\(.*\)$/, "")} option${count > 1 ? "s" : ""}`,
      options: optionsOf(fs.subfeature_options).map((o: any) => ({
        key: o.item.index, name: o.item.name.replace(/^[^:]+:\s*/, ""), source: "srd", type: "feature",
      })),
    });
  }
  if (fs.expertise_options) {
    // Shape: choose 1 of [ choice(choose 2 skills), [skill + thieves' tools] ] — flatten to "pick 2".
    const inner = optionsOf(fs.expertise_options).find((o: any) => o.option_type === "choice")?.choice ?? fs.expertise_options;
    const opts: ChoiceOption[] = optionsOf(inner)
      .filter((o: any) => o.item)
      .map((o: any) => ({ key: toSkillKey(o.item.index), name: o.item.name.replace(/^Skill:\s*/, "") }));
    if (!opts.some((o) => o.key === "thieves-tools") && JSON.stringify(fs.expertise_options).includes("thieves-tools")) {
      opts.push({ key: "thieves-tools", name: "Thieves' Tools" });
    }
    choices.push({ id: r.index, kind: "expertise", count: inner.choose ?? 2, label: `Choose ${inner.choose ?? 2} proficiencies to gain expertise`, options: opts });
  }
  for (const k of ["enemy_type_options", "terrain_type_options"] as const) {
    const o = fs[k];
    if (!o) continue;
    choices.push({
      id: `${r.index}-${k}`,
      kind: "text",
      count: o.choose ?? 1,
      label: `Choose ${o.desc ?? (k === "enemy_type_options" ? "a favored enemy" : "a favored terrain")}`,
      options: optionsOf(o).map((s: string) => ({ key: s, name: s[0].toUpperCase() + s.slice(1) })),
    });
  }
  return choices;
}

async function raceDetail(key: string): Promise<ContentDetail> {
  const [raceKey, subKey] = key.split("/");
  const race = await srd<any>(`races/${raceKey}`);
  const sub = subKey ? await srd<any>(`subraces/${subKey}`) : null;
  const traits = await Promise.all([...(race.traits ?? []), ...(sub?.racial_traits ?? [])].map((t: any) => srd<any>(`traits/${t.index}`)));
  const effects: Effect[] = [
    ...[...(race.ability_bonuses ?? []), ...(sub?.ability_bonuses ?? [])].map((b: any) => ({ kind: "ability" as const, ability: b.ability_score.index as Ability, amount: b.bonus })),
    { kind: "speed", amount: race.speed },
    ...[...(race.starting_proficiencies ?? []), ...(sub?.starting_proficiencies ?? [])]
      .map((p: any) => (p.index.startsWith("skill-") ? { kind: "skill" as const, skill: toSkillKey(p.index) } : { kind: "proficiency" as const, value: p.name })),
    { kind: "proficiency", value: `Languages: ${(race.languages ?? []).map((l: any) => l.name).join(", ")}${race.language_options ? ` + ${race.language_options.choose} of your choice` : ""}` },
  ];
  const choices: Choice[] = [];
  if (race.ability_bonus_options) {
    const o = race.ability_bonus_options;
    choices.push({
      id: "ability", kind: "ability", count: o.choose, amount: optionsOf(o)[0]?.bonus ?? 1,
      label: `Increase ${o.choose} ability scores by ${optionsOf(o)[0]?.bonus ?? 1}`,
      options: optionsOf(o).map((x: any) => ({ key: x.ability_score.index, name: x.ability_score.name })),
    });
  }
  for (const t of traits) {
    const pc = t.proficiency_choices;
    if (pc && optionsOf(pc).some((o: any) => o.item?.index?.startsWith("skill-"))) {
      choices.push({
        id: t.index, kind: "skill", count: pc.choose, label: `${t.name}: choose ${pc.choose} skill${pc.choose > 1 ? "s" : ""}`,
        options: optionsOf(pc).filter((o: any) => o.item?.index?.startsWith("skill-")).map((o: any) => ({ key: toSkillKey(o.item.index), name: skillName(toSkillKey(o.item.index)) })),
      });
    }
  }
  return {
    source: "srd",
    key,
    type: "race",
    name: sub?.name ?? race.name,
    sourceLabel: LABEL,
    description: [
      ...traits.map((t) => `**${t.name}.** ${join(t.desc)}`),
      sub && join([sub.desc]),
      race.age,
      race.size_description,
    ].filter(Boolean).join("\n\n"),
    meta: compact({ Speed: `${race.speed} ft`, Size: race.size }),
    effects,
    choices,
  };
}

/** Class progression normalized for the level-up wizard. */
export async function getClassRules(index: string): Promise<ClassRules> {
  const [cls, levels] = await Promise.all([srd<any>(`classes/${index}`), srd<any[]>(`classes/${index}/levels`)]);
  const invocations = index === "warlock" ? await srd<any>("features/eldritch-invocations").catch(() => null) : null;
  const casterType = CASTER_TYPE[index] ?? "none";
  const mc = cls.multi_classing ?? {};
  const prereqs = mc.prerequisites ?? optionsOf(mc.prerequisite_options);
  const normalized = levels.filter((l) => !l.subclass).sort((a, b) => a.level - b.level).map((l) => normalizeLevel(l));
  // Warlock invocations come from a count in class_specific rather than from a feature.
  if (invocations) {
    const options = (invocations.feature_specific?.invocations ?? []).map((i: any) => ({
      key: i.index, name: i.name.replace(/^Eldritch Invocation:\s*/, ""), source: "srd" as const, type: "feature" as const,
    }));
    normalized.forEach((l, i) => {
      const total = (l.classSpecific?.invocations_known as number) ?? 0;
      const prev = (normalized[i - 1]?.classSpecific?.invocations_known as number) ?? 0;
      if (total > prev) l.progressions.push({ name: "Eldritch Invocations", total, gained: total - prev, options });
    });
  }
  return {
    source: "srd",
    index: cls.index,
    name: cls.name,
    sourceLabel: LABEL,
    hitDie: cls.hit_die,
    savingThrows: cls.saving_throws?.map((s: any) => s.index) ?? [],
    spellcastingAbility: cls.spellcasting?.spellcasting_ability?.index ?? null,
    casterType,
    spellModel: SPELL_MODEL[index] ?? null,
    preparedDivisor: index === "paladin" ? 2 : 1,
    subclassLevel: SUBCLASS_LEVEL[index] ?? 3,
    subclassTitle: "Subclass",
    subclasses: cls.subclasses?.map((s: any) => ({ key: s.index, name: s.name, source: "srd", sourceLabel: LABEL })) ?? [],
    proficiencies: groupProficiencies(cls.proficiencies ?? []),
    skillChoices: skillChoices(cls.proficiency_choices?.[0]),
    multiclass: {
      requirements: prereqs.length
        ? { any: !!mc.prerequisite_options, scores: Object.fromEntries(prereqs.map((p: any) => [p.ability_score.index, p.minimum_score])) }
        : null,
      proficiencies: groupProficiencies(mc.proficiencies ?? []),
      skillChoices: skillChoices(mc.proficiency_choices?.[0]),
    },
    startingEquipment: startingEquipment(cls),
    levels: normalized,
  };
}

function groupProficiencies(list: any[]): string[] {
  const names = list.filter((p) => !p.index.startsWith("saving-throw-") && !p.index.startsWith("skill-")).map((p) => p.name);
  return names.length ? [names.join(", ")] : [];
}

function skillChoices(pc: any) {
  const skills = optionsOf(pc).filter((o: any) => o.item?.index?.startsWith("skill-")).map((o: any) => toSkillKey(o.item.index));
  return skills.length ? { count: pc.choose, from: skills } : null;
}

function startingEquipment(cls: any): EquipmentChoice[] {
  const ref = (o: any): { name: string; qty: number }[] => {
    if (o.option_type === "counted_reference") return [{ name: o.of.name, qty: o.count }];
    if (o.option_type === "multiple") return o.items.flatMap(ref);
    if (o.option_type === "choice") return [{ name: o.choice.desc ? `Any ${o.choice.desc}` : "Item of your choice", qty: o.choice.choose ?? 1 }];
    return [];
  };
  const fixed: EquipmentChoice[] = (cls.starting_equipment ?? []).length
    ? [{ label: "Included", options: [{ label: "Included", items: cls.starting_equipment.map((e: any) => ({ name: e.equipment.name, qty: e.quantity })) }] }]
    : [];
  return [
    ...fixed,
    ...(cls.starting_equipment_options ?? []).map((c: any) => {
      const category = c.from?.equipment_category?.name;
      return {
        label: c.desc ?? (category ? `Choose ${c.choose ?? 1} from ${category}` : "Equipment"),
        options: optionsOf(c).length
          ? optionsOf(c).map((o: any, i: number) => ({ label: `(${String.fromCharCode(97 + i)})`, items: ref(o) }))
          : [{ label: "(a)", items: [{ name: `Any ${category ?? "item"}`, qty: c.choose ?? 1 }] }],
      };
    }),
  ];
}

/** Warlock patron spells only widen the spell list; other subclasses' spells are always prepared. */
const isExpandedList = (r: any) => r.class?.index === "warlock";

function expandedSpells(r: any): ExpandedSpell[] {
  if (!isExpandedList(r)) return [];
  return (r.spells ?? []).map((s: any) => {
    const classLevel = Number(String(s.prerequisites?.find((p: any) => p.type === "level")?.index ?? "-1").split("-").pop()) || 1;
    return { spellLevel: Math.min(5, Math.ceil(classLevel / 2)), spell: { source: "srd", key: s.spell.index, name: s.spell.name } };
  });
}

/** Domain / oath / circle spells: always prepared from the listed class level. */
function subclassSpells(r: any): GrantedSpell[] {
  if (isExpandedList(r)) return [];
  return (r.spells ?? []).map((s: any) => ({
    level: Number(String(s.prerequisites?.find((p: any) => p.type === "level")?.index ?? "-1").split("-").pop()) || 1,
    spell: { source: "srd", key: s.spell.index, name: s.spell.name },
    mode: "prepared",
  }));
}

function itemData(r: any): ItemData {
  const data: ItemData = { weight: r.weight };
  if (r.armor_category) {
    data.armor = {
      base: r.armor_class?.base ?? 10,
      type: r.armor_category === "Shield" ? "shield" : (r.armor_category.toLowerCase() as "light" | "medium" | "heavy"),
      stealthDisadvantage: r.stealth_disadvantage,
      strength: r.str_minimum || undefined,
    };
  }
  if (r.damage) {
    const props: string[] = r.properties?.map((p: any) => p.name) ?? [];
    data.weapon = {
      damage: r.damage.damage_dice,
      damageType: r.damage.damage_type?.name?.toLowerCase() ?? "",
      versatile: r.two_handed_damage?.damage_dice,
      properties: props,
      ranged: r.weapon_range === "Ranged",
      finesse: props.includes("Finesse"),
      range: r.range?.long ? `${r.range.normal}/${r.range.long} ft` : r.throw_range ? `${r.throw_range.normal}/${r.throw_range.long} ft` : undefined,
      category: r.category_range,
    };
  }
  return data;
}

export async function getSubclassLevels(index: string) {
  const [levels, sub] = await Promise.all([srd<any[]>(`subclasses/${index}/levels`).catch(() => []), srd<any>(`subclasses/${index}`).catch(() => null)]);
  return {
    spellcastingAbility: null,
    casterType: null,
    spellModel: null,
    grantedSpells: sub ? subclassSpells(sub) : [],
    expandedSpells: sub ? expandedSpells(sub) : [],
    levels: levels.map((l) => ({
      level: l.level,
      features: (l.features ?? []).map((f: any) => ({ key: f.index, name: f.name, source: "srd" })),
      progressions: [],
      spellcasting: null,
    })),
  };
}

export function normalizeLevel(l: any): LevelRules & { classSpecific: Record<string, unknown> } {
  const sc = l.spellcasting;
  return {
    level: l.level,
    profBonus: l.prof_bonus,
    abilityScoreBonuses: l.ability_score_bonuses ?? 0,
    features: (l.features ?? []).map((f: any) => ({ key: f.index, name: f.name, source: "srd" as const })),
    spellcasting: sc
      ? {
          cantripsKnown: sc.cantrips_known ?? 0,
          spellsKnown: sc.spells_known ?? null,
          slots: Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0),
        }
      : null,
    progressions: [],
    classSpecific: l.class_specific ?? {},
  };
}

const CASTER_TYPE: Record<string, ClassRules["casterType"]> = {
  bard: "full", cleric: "full", druid: "full", sorcerer: "full", wizard: "full", paladin: "half", ranger: "half", warlock: "pact",
};
const SPELL_MODEL: Record<string, ClassRules["spellModel"]> = {
  bard: "known", ranger: "known", sorcerer: "known", warlock: "known", cleric: "prepared", druid: "prepared", paladin: "prepared", wizard: "spellbook",
};
/** Level at which each SRD class picks its subclass (not exposed by the API). */
const SUBCLASS_LEVEL: Record<string, number> = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };

export { SKILL_KEYS, singleClassSlots };

function compact(o: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Record<string, string>;
}
