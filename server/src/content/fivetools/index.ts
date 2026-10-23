import { HttpError } from "../http.js";
import {
  ABILITIES, SKILL_KEYS, expertiseChoice, singleClassSlots, skillName, toSkillKey,
  type Ability, type Choice, type ChoiceOption, type ClassRules, type ContentDetail, type ContentSummary,
  type ContentType, type Effect, type FeatPrereq, type EquipmentChoice, type ExpandedSpell, type FeatureRef, type GrantedSpell, type ItemData, type LevelRules, type Progression, type SpellDice, type SpellPick, type SpellVariant,
} from "../types.js";
import { diceFromText, mergeDice } from "../spellDice.js";
import { getDataset, type Dataset } from "./data.js";
import {
  abilityText5e, backgroundFacets5e, classFacets5e, featFacets5e, itemFacets5e, optionalFeatureFacets5e, raceFacets5e, spellFacets5e, subclassFacets5e,
} from "../facets.js";
import { plain, renderEntries, renderTags } from "./render.js";

const SOURCE = "5etools" as const;
const key = (...parts: (string | number | undefined)[]) => parts.map((p) => p ?? "").join("|");
const lc = (s?: string) => (s ?? "").toLowerCase();
const label = (ds: Dataset, src: string) => ds.sourceNames[src] ?? src;
const summary = (ds: Dataset, type: ContentType, name: string, k: string, src: string, extra: Partial<ContentSummary> = {}): ContentSummary => ({
  source: SOURCE, key: k, type, name, sourceLabel: label(ds, src), ...extra,
});

// ---------------------------------------------------------------------------
// Listing

export async function list5etools(type: ContentType, opts: { cls?: string }): Promise<ContentSummary[]> {
  const ds = await getDataset();
  switch (type) {
    case "spell":
      return ds.spell
        .map((s) => ({ s, classes: spellClasses(ds, s) }))
        .filter(({ classes }) => !opts.cls || classes.includes(lc(opts.cls)))
        .map(({ s, classes }) => summary(ds, type, s.name, key(s.name, s.source), s.source, { level: s.level, classes, facets: spellFacets5e(s) }));
    case "feat":
      return ds.feat.filter((x) => !x._copy || x.entries).map((x) => summary(ds, type, x.name, key(x.name, x.source), x.source, { facets: featFacets5e(x), prereqs: featPrereqs(x.prerequisite), repeatable: x.repeatable || undefined }));
    case "background":
      return ds.background.filter((x) => !x._copy || x.entries).map((x) => summary(ds, type, x.name, key(x.name, x.source), x.source, { facets: backgroundFacets5e(x) }));
    case "item":
      return [...ds.baseitem, ...ds.item].map((x) => summary(ds, type, x.name, key(x.name, x.source), x.source, { facets: itemFacets5e(x) }));
    case "race":
      return races(ds).map((r) => summary(ds, type, r.name, r.key, r.source, { facets: raceFacets5e(r.race, r.sub), abilities: abilityText5e(r.race, r.sub) }));
    case "class":
      return ds.class.map((c) => summary(ds, type, c.name, key(c.name, c.source), c.source, { facets: classFacets5e(c) }));
    case "subclass":
      return ds.subclass
        .filter((s) => !opts.cls || lc(s.className) === lc(opts.cls.split("|")[0]))
        .map((s) => summary(ds, type, s.name, key(s.shortName, s.source, s.className, s.classSource), s.source, { classes: [lc(s.className)], facets: subclassFacets5e(s) }));
    case "feature":
      return ds.optionalfeature.map((o) => summary(ds, type, o.name, key("of", o.name, o.source), o.source, { facets: optionalFeatureFacets5e(o) }));
    default:
      return [];
  }
}

function spellClasses(ds: Dataset, s: any): string[] {
  const entry = ds.spellClasses[s.source]?.[s.name];
  // Class lists tagged for the 2024 classes (source XPHB) aren't 2014 lists.
  const fromIndex = [...(entry?.class ?? []), ...(entry?.classVariant ?? [])].filter((c: any) => c.source !== "XPHB").map((c: any) => lc(c.name));
  const inline = (s.classes?.fromClassList ?? []).map((c: any) => lc(c.name));
  return [...new Set([...fromIndex, ...inline])];
}

/** Races are listed per subrace ("Elf (High)") because the base race alone is incomplete. */
function races(ds: Dataset) {
  const out: { name: string; key: string; source: string; race: any; sub?: any }[] = [];
  for (const race of ds.race) {
    const subs = ds.subrace.filter((s) => s.raceName === race.name && s.raceSource === race.source);
    if (!subs.length) out.push({ name: race.name, key: key(race.name, race.source), source: race.source, race });
    for (const sub of subs) {
      out.push({
        name: sub.name ? `${race.name} (${sub.name})` : race.name,
        key: key(race.name, race.source, sub.name, sub.source),
        source: sub.source ?? race.source,
        race,
        sub,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detail

export async function get5etools(type: ContentType, k: string): Promise<ContentDetail | undefined> {
  const ds = await getDataset();
  const p = k.split("|");
  const find = (arr: any[], name: string, src: string) => arr.find((x) => x.name === name && x.source === src);
  switch (type) {
    case "spell": {
      const s = find(ds.spell, p[0], p[1]);
      return s && spellDetail(ds, s);
    }
    case "feat": {
      const f = find(ds.feat, p[0], p[1]);
      return f && featDetail(ds, f);
    }
    case "background": {
      const b = find(ds.background, p[0], p[1]);
      return b && backgroundDetail(ds, b);
    }
    case "item": {
      const it = find(ds.baseitem, p[0], p[1]) ?? find(ds.item, p[0], p[1]);
      return it && itemDetail(ds, it);
    }
    case "race": {
      const r = races(ds).find((x) => x.key === k);
      return r && raceDetail(ds, r);
    }
    case "class": {
      const c = find(ds.class, p[0], p[1]);
      return c && { ...summary(ds, type, c.name, k, c.source), description: renderEntries(c.fluff ?? ""), meta: { "Hit Die": `d${c.hd?.faces ?? 8}` } };
    }
    case "subclass": {
      const sc = findSubclass(ds, k);
      if (!sc) return undefined;
      const first = subclassFeatures(ds, sc).find((f: any) => f.obj);
      return {
        ...summary(ds, type, sc.name, k, sc.source, { classes: [lc(sc.className)] }),
        description: first ? renderEntries(first.obj.entries, 0) : "",
        meta: {},
        grantedSpells: grantedSpells(ds, sc.additionalSpells),
      };
    }
    case "feature":
      return featureDetail(ds, k);
  }
}

function spellDetail(ds: Dataset, s: any): ContentDetail {
  const conc = s.duration?.some((d: any) => d.concentration);
  return {
    ...summary(ds, "spell", s.name, key(s.name, s.source), s.source, { level: s.level, classes: spellClasses(ds, s) }),
    description:
      renderEntries(s.entries) + (s.entriesHigherLevel ? `\n\n${renderEntries(s.entriesHigherLevel)}` : ""),
    meta: {
      Level: s.level === 0 ? "Cantrip" : String(s.level),
      School: SCHOOLS[s.school] ?? s.school,
      "Casting Time": (s.time ?? []).map((t: any) => `${t.number} ${t.unit}${t.number > 1 ? "s" : ""}${t.condition ? `, ${plain(t.condition)}` : ""}`).join(" or "),
      Range: rangeText(s.range),
      Components: componentsText(s.components),
      Duration: (conc ? "Concentration, " : "") + (s.duration ?? []).map(durationText).join(" or "),
    },
    spell: { school: SCHOOLS[s.school], ritual: !!s.meta?.ritual, concentration: conc, dice: fivetoolsSpellDice(s) },
  };
}

function fivetoolsSpellDice(s: any): SpellDice | undefined {
  const raw = JSON.stringify(s.entries ?? "");
  const higher = JSON.stringify(s.entriesHigherLevel ?? "");
  const heal = s.miscTags?.includes("HL") && !s.damageInflict;
  const scaling = Array.isArray(s.scalingLevelDice) ? s.scalingLevelDice[0] : s.scalingLevelDice;
  const structured: Partial<SpellDice> = {
    kind: heal ? "heal" : "damage",
    types: s.damageInflict,
    save: s.savingThrow?.[0] ? s.savingThrow[0][0].toUpperCase() + s.savingThrow[0].slice(1) : undefined,
    attack: s.spellAttack?.[0] ? (s.spellAttack[0] === "M" ? "melee" : "ranged") : undefined,
    base: (heal ? raw.match(/\{@dice (\d+d\d+)/) : raw.match(/\{@damage (\d+d\d+(?:\s*\+\s*\d+)?)/))?.[1]?.replace(/\s+/g, ""),
    // Only "increases by 1d6 for each slot level above…" is a per-slot step; Elemental Weapon's
    // "increases to 2d4 when you use a 5th-level slot" is a tier and comes from the text below.
    perSlot: /for each (?:slot )?level above/i.test(higher) ? higher.match(/\{@scale(?:damage|dice) [^|}]+\|[^|}]+\|(\d+d\d+)/)?.[1] : undefined,
    byCharacterLevel: scaling?.scaling,
    // Healing that adds the modifier to the dice ("1d8 + your spellcasting ability modifier"), not
    // Healing Spirit's "a number of times equal to 1 + your spellcasting ability modifier".
    addModifier: heal && /\{@dice \d+d\d+\}\s*\+\s*your spellcasting ability modifier/.test(raw) ? true : undefined,
    // "to a maximum of {@damage 6d10}" (Hail of Thorns' upcast cap).
    max: higher.match(/maximum of \{@(?:damage|dice) (\d+d\d+)\}/)?.[1],
  };
  if (scaling?.scaling) structured.base = scaling.scaling["1"];
  return mergeDice(structured, diceFromText(renderEntries(s.entries), renderEntries(s.entriesHigherLevel ?? "")));
}

const SCHOOLS: Record<string, string> = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation", P: "Psionic",
};

function rangeText(r: any): string {
  if (!r) return "";
  const d = r.distance ?? {};
  if (r.type === "special") return "Special";
  if (d.type === "self") return "Self" + (r.type !== "point" ? ` (${d.amount ?? ""}-foot ${r.type})` : "");
  if (["touch", "sight", "unlimited"].includes(d.type)) return d.type[0].toUpperCase() + d.type.slice(1);
  return `${d.amount} ${d.type}`;
}

function componentsText(c: any): string {
  if (!c) return "";
  const parts = [c.v && "V", c.s && "S", c.m && "M"].filter(Boolean).join(", ");
  const material = typeof c.m === "string" ? c.m : c.m?.text;
  return material ? `${parts} (${material})` : parts;
}

function durationText(d: any): string {
  if (d.type === "instant") return "Instantaneous";
  if (d.type === "permanent") return "Until dispelled";
  if (d.type === "special") return "Special";
  if (d.type === "timed") return `${d.concentration ? "up to " : ""}${d.duration.amount} ${d.duration.type}${d.duration.amount > 1 ? "s" : ""}`;
  return d.type;
}

/**
 * A feat's prerequisites in checkable form: one entry per alternative ("or"), each listing what must all
 * hold. Campaign requirements aren't checked.
 */
function featPrereqs(prereqs?: any[]): FeatPrereq[] | undefined {
  if (!prereqs?.length) return undefined;
  const out = prereqs.map((p): FeatPrereq => {
    const r: FeatPrereq = {};
    if (typeof p.level === "number") r.level = p.level;
    else if (p.level?.level) r.level = p.level.level;
    if (Array.isArray(p.ability)) r.abilities = p.ability;
    if (Array.isArray(p.race)) r.races = p.race.map((x: any) => ({ name: lc(x.name), subrace: x.subrace ? lc(x.subrace) : undefined }));
    if (Array.isArray(p.proficiency)) r.proficiency = p.proficiency.map((x: any) => ({ armor: x.armor, weapon: x.weapon ?? x.weaponGroup }));
    if (p.spellcasting || p.spellcasting2020 || p.spellcastingFeature) r.spellcasting = true;
    if (Array.isArray(p.feat)) r.feats = p.feat.map((x: string) => lc(x.split("|")[0]));
    if (Array.isArray(p.background)) r.backgrounds = p.background.map((x: any) => lc(x.name));
    if (Array.isArray(p.feature)) r.features = p.feature.map(lc);
    return r;
  });
  return out.some((r) => Object.keys(r).length) ? out : undefined;
}

/** Checkable prerequisites of an option (first alternative): class level, pact boon, known spells, other options. */
function prerequisiteReq(prereqs?: any[]): ChoiceOption["requires"] {
  const p = prereqs?.[0];
  if (!p) return undefined;
  const req: NonNullable<ChoiceOption["requires"]> = {};
  if (typeof p.level === "number") req.level = p.level;
  else if (p.level?.level) {
    req.level = p.level.level;
    if (p.level.class?.name) req.className = p.level.class.name;
  }
  if (p.pact) req.pact = p.pact;
  if (Array.isArray(p.spell)) req.spells = p.spell.map((x: string) => plain(`{@spell ${x.split("#")[0]}}`));
  if (Array.isArray(p.optionalfeature)) req.features = p.optionalfeature.map((x: string) => plain(`{@optfeature ${x}}`));
  return Object.keys(req).length ? req : undefined;
}

function prerequisiteText(prereqs?: any[]): string | undefined {
  if (!prereqs?.length) return undefined;
  return prereqs
    .map((p) =>
      Object.entries(p)
        .map(([k, v]: [string, any]) => {
          // [{int: 13}, {wis: 13}] (Ritual Caster) means either.
          if (k === "ability") return v.map((a: any) => Object.entries(a).map(([ab, n]) => `${ab.toUpperCase()} ${n}+`).join(" and ")).join(" or ");
          if (k === "level") return typeof v === "number" ? `Level ${v}` : `${v.class?.name ?? ""} level ${v.level}`.trim();
          if (k === "race") return v.map((r: any) => r.displayEntry ?? `${r.name}${r.subrace ? ` (${r.subrace})` : ""}`).join(" or ");
          if (k === "spellcasting" || k === "spellcasting2020") return "The ability to cast at least one spell";
          if (k === "pact") return `Pact of the ${v}`;
          if (k === "patron") return `${v} patron`;
          if (k === "spell") return v.map((s: string) => plain(`{@spell ${s.split("#")[0]}}`)).join(", ");
          if (k === "proficiency") return v.map((x: any) => Object.entries(x).map(([t, n]) => `${n} ${t === "weaponGroup" ? "weapon" : t} proficiency`).join(", ")).join(" or ");
          if (k === "feature") return v.join(", ");
          if (k === "feat") return v.map((x: string) => `${plain(`{@feat ${x}}`)} feat`).join(", ");
          if (k === "background") return v.map((x: any) => x.displayEntry ? plain(x.displayEntry) : `${x.name} background`).join(" or ");
          if (k === "spellcastingFeature" || k === "spellcastingPrepared") return "Spellcasting or Pact Magic feature";
          if (k === "campaign") return v.map((x: string) => `${x} campaign`).join(" or ");
          if (k === "other") return v;
          if (k === "otherSummary") return v.entrySummary ?? plain(v.entry ?? "");
          return "";
        })
        .filter(Boolean)
        .join("; "),
    )
    .filter(Boolean)
    .join(" or ");
}

/**
 * 5etools proficiency blocks: [{athletics: true}] (fixed), [{choose: {from, count}}] or [{any: n}].
 */
function skillBlock(ds: unknown, block: any[] | undefined, id: string, effects: Effect[], choices: Choice[]) {
  const b = block?.[0];
  if (!b) return;
  for (const [k, v] of Object.entries(b)) {
    if (k === "choose") {
      const c = v as any;
      choices.push(skillChoice(id, c.count ?? 1, (c.from ?? []).map(toSkillKey)));
    } else if (k === "any") choices.push(skillChoice(id, v as number, SKILL_KEYS));
    else if (v === true && SKILL_KEYS.includes(toSkillKey(k))) effects.push({ kind: "skill", skill: toSkillKey(k) });
  }
}

const skillChoice = (id: string, count: number, from: string[]): Choice => ({
  id, kind: "skill", count, label: `Choose ${count} skill proficienc${count > 1 ? "ies" : "y"}`,
  options: from.filter((s) => SKILL_KEYS.includes(s)).map((s) => ({ key: s, name: skillName(s) })),
});

function abilityBlock(block: any[] | undefined, id: string, effects: Effect[], choices: Choice[]) {
  const b = block?.[0];
  if (!b) return;
  for (const [k, v] of Object.entries(b)) {
    if (k === "choose") {
      const c = v as any;
      const from: string[] = c.from ?? ABILITIES;
      const count = c.count ?? 1;
      choices.push({
        id, kind: "ability", count, amount: c.amount ?? 1,
        label: `Increase ${count > 1 ? `${count} ability scores` : "one ability score"} by ${c.amount ?? 1}`,
        options: from.map((a) => ({ key: a, name: a.toUpperCase() })),
      });
    } else if (ABILITIES.includes(k as Ability)) effects.push({ kind: "ability", ability: k as Ability, amount: v as number });
  }
}

/** "Increase one score by 2 and a different one by 1, or three different scores by 1": 3 points, at most 2 in one. */
function lineageChoice(id: string): Choice {
  return {
    id, kind: "ability", count: 3, amount: 1, maxPerOption: 2,
    label: "Ability Score Increase: +2 to one score and +1 to another, or +1 to three different scores",
    options: ABILITIES.map((a) => ({ key: a, name: a.toUpperCase() })),
  };
}

const STANDARD_LANGUAGES = ["Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc"];
const EXOTIC_LANGUAGES = ["Abyssal", "Celestial", "Deep Speech", "Draconic", "Infernal", "Primordial", "Sylvan", "Undercommon"];
const ARTISANS_TOOLS = [
  "Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies", "Carpenter's tools", "Cartographer's tools", "Cobbler's tools",
  "Cook's utensils", "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools", "Painter's supplies", "Potter's tools",
  "Smith's tools", "Tinker's tools", "Weaver's tools", "Woodcarver's tools",
];
const GAMING_SETS = ["Dice set", "Dragonchess set", "Playing card set", "Three-Dragon Ante set"];
const INSTRUMENTS = ["Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan flute", "Shawm", "Viol"];
const OTHER_TOOLS = ["Disguise kit", "Forgery kit", "Herbalism kit", "Navigator's tools", "Poisoner's kit", "Thieves' tools", "Vehicles (land)", "Vehicles (water)"];

/** Options behind a 5etools "any…" key, and how to describe it. */
const ANY_OPTIONS: Record<string, { label: string; options: string[] }> = {
  anyStandard: { label: "standard language", options: STANDARD_LANGUAGES },
  anyLanguage: { label: "language", options: [...STANDARD_LANGUAGES, ...EXOTIC_LANGUAGES] },
  anyExotic: { label: "exotic language", options: EXOTIC_LANGUAGES },
  anyGamingSet: { label: "gaming set", options: GAMING_SETS },
  anyMusicalInstrument: { label: "musical instrument", options: INSTRUMENTS },
  anyArtisansTool: { label: "artisan's tools", options: ARTISANS_TOOLS },
  anyTool: { label: "tool", options: [...ARTISANS_TOOLS, ...GAMING_SETS, ...INSTRUMENTS, ...OTHER_TOOLS] },
};

const titleCase = (s: string) => s.replace(/(^|[\s(-])(\w)/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
const profChoice = (id: string, prefix: string, count: number, label: string, names: string[]): Choice => ({
  id, kind: "proficiency", prefix, count, label: `${prefix}: choose ${count} ${label}${count > 1 ? "s" : ""}`,
  options: [...new Set(names)].map((n) => ({ key: lc(n), name: n })),
});

/**
 * 5etools language / tool / weapon / armor proficiency blocks → fixed proficiency lines plus real choices:
 * [{common: true, anyStandard: 1}], [{"disguise kit": true, anyMusicalInstrument: 1}], [{choose: {from, count}}],
 * [{other: true}] (the race's own language), [{light: true, medium: true}]. Only the first alternative is used.
 */
function profBlock(prefix: "Languages" | "Tools" | "Weapons" | "Armor", block: any[] | undefined, id: string, otherName?: string): { effects: Effect[]; choices: Choice[] } {
  const b = block?.[0];
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  if (!b) return { effects, choices };
  const fixed: string[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (v === false || v == null) continue;
    if (k === "choose") {
      const c = v as any;
      const from: string[] = (c.from ?? []).map((x: string) => (ANY_OPTIONS[x] ? ANY_OPTIONS[x].options : [titleCase(plain(`{@x ${x}}`))])).flat();
      if (from.length) choices.push(profChoice(`${id}-${choices.length}`, prefix, c.count ?? 1, prefix === "Languages" ? "language" : prefix === "Tools" ? "tool" : "", from));
    } else if (ANY_OPTIONS[k]) {
      choices.push(profChoice(`${id}-${choices.length}`, prefix, Number(v) || 1, ANY_OPTIONS[k].label, ANY_OPTIONS[k].options));
    } else if (k === "any") {
      const all = prefix === "Languages" ? ANY_OPTIONS.anyLanguage : ANY_OPTIONS.anyTool;
      choices.push(profChoice(`${id}-${choices.length}`, prefix, Number(v) || 1, prefix === "Languages" ? "language" : "tool", all.options));
    } else if (k === "other") {
      // "One other language": the race's own (Leonin, Tabaxi…) when it's named after it.
      if (otherName) fixed.push(otherName);
      else choices.push(profChoice(`${id}-${choices.length}`, prefix, 1, "language", ANY_OPTIONS.anyLanguage.options));
    } else if (prefix === "Armor") fixed.push(k === "shield" ? "shields" : `${k} armor`);
    else if (k === "firearms") fixed.push("firearms");
    else fixed.push(titleCase(plain(`{@x ${k.split("|")[0]}}`)));
  }
  if (fixed.length) effects.push({ kind: "proficiency", value: `${prefix}: ${fixed.join(", ")}` });
  return { effects, choices };
}

/** "Choose two from skills, tools or languages" (Githyanki, Skilled, Custom Background). */
function mixedBlock(block: any[] | undefined, id: string): Choice[] {
  const b = block?.[0];
  if (!b) return [];
  const out: Choice[] = [];
  // Alternatives of "any…" counts (Custom Background: 2 languages, or 1 language and 1 tool, …) are one pick of
  // that many from all the kinds involved.
  if (block!.length > 1 && block!.every((alt: any) => Object.keys(alt).every((k) => k.startsWith("any")))) {
    const kinds = [...new Set(block!.flatMap((alt: any) => Object.keys(alt)))];
    const count = Math.max(...block!.map((alt: any) => Object.values(alt).reduce((n: number, v: any) => n + (Number(v) || 0), 0)));
    return mixedBlock([Object.fromEntries(kinds.map((k) => [k, count]))], id).map((c) => ({ ...c, count, label: `Choose ${count} ${kinds.map((k) => k.replace(/^any/, "").toLowerCase()).join(" or ")} proficiencies` }));
  }
  const groups = b.choose ? (Array.isArray(b.choose) ? b.choose : [b.choose]) : [b];
  for (const c of groups) {
    const from: string[] = c.from ?? Object.keys(c).filter((k) => k.startsWith("any"));
    const count = c.count ?? (c.from ? 1 : from.reduce((n, k) => n + (Number(c[k]) || 0), 0)) ?? 1;
    const options = from.flatMap((k: string) =>
      k === "anySkill" ? SKILL_KEYS.map((s) => ({ key: `skill:${s}`, name: skillName(s) })) :
      k === "anyTool" ? ANY_OPTIONS.anyTool.options.map((n) => ({ key: `tool:${lc(n)}`, name: n })) :
      k === "anyLanguage" ? ANY_OPTIONS.anyLanguage.options.map((n) => ({ key: `language:${lc(n)}`, name: n })) : [],
    );
    if (options.length) out.push({ id: `${id}-${out.length}`, kind: "proficiency", prefix: "mixed", count, label: `Choose ${count} skill, tool or language proficiencies`, options });
  }
  return out;
}

function featDetail(ds: Dataset, f: any): ContentDetail {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  abilityBlock(f.ability, "ability", effects, choices);
  // Resilient: the save proficiency is for the ability you increase, not a separate pick.
  const save = f.savingThrowProficiencies?.[0]?.choose;
  const abilityChoice = choices.find((c) => c.kind === "ability");
  if (save && abilityChoice && JSON.stringify([...(save.from ?? [])].sort()) === JSON.stringify(abilityChoice.options.map((o) => o.key).sort())) {
    abilityChoice.grantsSave = true;
    abilityChoice.label += " (and gain proficiency in its saving throws)";
  } else if (save) {
    choices.push({ id: "save", kind: "save", count: save.count ?? 1, label: "Gain saving throw proficiency", options: (save.from ?? ABILITIES).map((a: string) => ({ key: a, name: a.toUpperCase() })) });
  }
  skillBlock(ds, f.skillProficiencies, "skills", effects, choices);
  for (const [prefix, prop] of [["Armor", "armorProficiencies"], ["Weapons", "weaponProficiencies"], ["Tools", "toolProficiencies"], ["Languages", "languageProficiencies"]] as const) {
    const block = f[prop];
    // Weapon Master: "four weapons of your choice" from a filter.
    const filter = block?.[0]?.choose?.fromFilter;
    if (filter) {
      const kinds = /martial/.test(filter) && !/simple/.test(filter) ? ["martial"] : ["simple", "martial"];
      const weapons = ds.baseitem.filter((i) => i.weaponCategory && kinds.includes(lc(i.weaponCategory)) && !i.age && i.source !== "XPHB").map((i) => titleCase(i.name));
      choices.push(profChoice(lc(prefix), prefix, block[0].choose.count ?? 1, "weapon", weapons));
      continue;
    }
    const p = profBlock(prefix, block, lc(prefix));
    effects.push(...p.effects);
    choices.push(...p.choices);
  }
  choices.push(...mixedBlock(f.skillToolLanguageProficiencies, "mixed"));
  // Skill Expert, Prodigy: expertise in a skill you're proficient in.
  const expertise = f.expertise?.[0]?.anyProficientSkill;
  if (expertise) choices.push({ ...expertiseChoice("expertise", expertise), options: SKILL_KEYS.map((k) => ({ key: k, name: skillName(k) })) });
  // Martial Adept, Metamagic Adept, Eldritch Adept, Fighting Initiate: options from a class pool.
  for (const prog of f.optionalfeatureProgression ?? []) {
    const count = Number(Object.values(prog.progression ?? {})[0]) || 1;
    const options = ds.optionalfeature
      .filter((o) => o.featureType?.some((t: string) => prog.featureType.includes(t)))
      .map((o) => ({ key: key("of", o.name, o.source), name: o.name, source: SOURCE, type: "feature" as const, prerequisite: prerequisiteText(o.prerequisite), requires: prerequisiteReq(o.prerequisite) }));
    if (options.length) choices.push({ id: `prog-${lc(prog.name)}`, kind: "feature", count, label: `Choose ${count} ${prog.name}`, options });
  }
  return {
    ...summary(ds, "feat", f.name, key(f.name, f.source), f.source),
    prerequisite: prerequisiteText(f.prerequisite),
    description: renderEntries(f.entries),
    meta: {},
    effects,
    choices,
    grantedSpells: grantedSpells(ds, f.additionalSpells),
    spellPicks: spellSet(ds, f.additionalSpells?.[0]).picks,
    spellVariants: spellVariants(ds, f.additionalSpells),
  };
}

/** Resolve a 5etools spell reference ("hellish rebuke#2", "fireball|xge") to a content ref. */
function spellRef(ds: Dataset, raw: string) {
  const [name, source] = raw.split("#")[0].split("|");
  const s = ds.spell.find((x) => lc(x.name) === lc(name) && (!source || lc(x.source) === lc(source))) ?? ds.spell.find((x) => lc(x.name) === lc(name));
  return s ? { source: SOURCE, key: key(s.name, s.source), name: s.name } : undefined;
}

/** Spells matching a 5etools filter: "level=0;1;2|class=Wizard|school=N". */
function spellsMatching(ds: Dataset, filter: string) {
  const parts = Object.fromEntries(filter.split("|").map((p) => p.split("=") as [string, string]));
  const levels = parts.level?.split(";").map(Number);
  const cls = parts.class?.split(";").map(lc);
  const schools = parts.school?.split(";");
  const ritual = /ritual/i.test(parts["components & miscellaneous"] ?? "");
  return ds.spell
    .filter((x) => (!levels || levels.includes(x.level)) && (!schools || schools.includes(x.school)) && (!cls || spellClasses(ds, x).some((c) => cls.includes(c))) && (!ritual || x.meta?.ritual))
    .map((x) => ({ source: SOURCE, key: key(x.name, x.source), name: x.name, level: x.level as number }))
    .sort((x, y) => x.level - y.level || x.name.localeCompare(y.name));
}

const describeFilter = (filter: string, count = 1) => {
  const parts = Object.fromEntries(filter.split("|").map((p) => p.split("=") as [string, string]));
  const levels = parts.level?.split(";") ?? [];
  const cantrips = levels.length > 0 && levels.every((l) => l === "0");
  const lv = cantrips ? "" : levels.map((l) => (l === "0" ? "cantrip" : `level ${l}`)).join("/");
  const ritual = /ritual/i.test(parts["components & miscellaneous"] ?? "") ? "ritual" : "";
  const noun = cantrips ? "cantrip" : "spell";
  return [parts.class, lv, parts.school && `school ${parts.school}`, ritual, count > 1 ? `${noun}s` : noun].filter(Boolean).join(" ");
};

/**
 * One 5etools additionalSpells entry: spells you get outright, and spells you choose ("choose" filters:
 * Nature Domain's druid cantrip, Lore's Additional Magical Secrets, Arcana's Arcane Mastery).
 * Keys are class levels. Innate "_" means at will; "ritual" spells are cast only as rituals;
 * "resource" spells cost class resource points (Shadow Arts: 2 ki).
 */
function spellSet(ds: Dataset, a: any): { granted: GrantedSpell[]; picks: SpellPick[] } {
  const granted: GrantedSpell[] = [];
  const picks: SpellPick[] = [];
  if (!a) return { granted, picks };
  const push = (mode: GrantedSpell["mode"], level: string, spells: any, uses?: string) => {
    const lv = Number(String(level).replace(/\D/g, "")) || 1;
    for (const raw of Array.isArray(spells) ? spells : []) {
      if (typeof raw === "string") {
        const spell = spellRef(ds, raw);
        if (spell) granted.push({ level: lv, spell, mode, uses });
      } else if (raw?.choose && typeof raw.choose === "string") {
        const options = spellsMatching(ds, raw.choose).map(({ level: _l, ...r }) => r);
        if (options.length) picks.push({ level: lv, count: raw.count ?? 1, label: `Choose ${raw.count ?? 1} ${describeFilter(raw.choose, raw.count ?? 1)}`, mode, uses, options });
      }
    }
  };
  for (const mode of ["innate", "known", "prepared"] as const) {
    for (const [level, v] of Object.entries(a[mode] ?? {})) {
      // A bare list under "_" (no level: invocations like Mask of Many Faces) is at will; under a class level
      // it says nothing about how often (Consult the Spirits is limited by its feature text).
      if (Array.isArray(v)) push(mode, level, v, mode === "innate" && level === "_" ? "at will" : undefined);
      else if (v && typeof v === "object") {
        for (const [k, inner] of Object.entries(v as any)) {
          if (k === "_") push(mode, level, inner, mode === "innate" ? "at will" : undefined);
          else if (k === "daily" || k === "rest") for (const [n, list] of Object.entries(inner as any)) push(mode, level, list, `${n.replace("e", "")}/${k === "daily" ? "long rest" : "short rest"}`);
          else if (k === "will") push(mode, level, inner, "at will");
          else if (k === "ritual") push(mode, level, inner, "ritual");
          else if (k === "resource") for (const [n, list] of Object.entries(inner as any)) push(mode, level, list, `${n} ${lc(a.resourceName ?? "resource")}`);
        }
      }
    }
  }
  return { granted, picks };
}

/** Spells granted by the first (or only) additionalSpells entry. */
function grantedSpells(ds: Dataset, additional: any[] | undefined): GrantedSpell[] {
  return spellSet(ds, additional?.[0]).granted;
}

/**
 * Alternatives when additionalSpells has several entries: Circle of the Land terrains, Divine Soul
 * affinities, Genie kinds, Arcane Archer's cantrip. Unnamed ones are named after their spells.
 */
function spellVariants(ds: Dataset, additional: any[] | undefined): SpellVariant[] | undefined {
  if (!additional || additional.length < 2) return undefined;
  return additional.map((a) => {
    const { granted, picks } = spellSet(ds, a);
    return { name: a.name ?? granted.map((g) => g.spell.name).join(", "), grantedSpells: granted, spellPicks: picks, expandedSpells: expandedSpells(ds, [a]) };
  });
}

/**
 * additionalSpells "expanded" lists: keys "s1".."s9" are spell levels; plain numbers are class
 * levels (the spell's own level is used then). {all: "level=1|class=Cleric"} adds a whole list.
 */
function expandedSpells(ds: Dataset, additional: any[] | undefined): ExpandedSpell[] {
  const out: ExpandedSpell[] = [];
  for (const [k, list] of Object.entries(additional?.[0]?.expanded ?? {})) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (raw?.all && typeof raw.all === "string") {
        for (const sp of spellsMatching(ds, raw.all)) out.push({ spellLevel: sp.level, spell: { source: sp.source, key: sp.key, name: sp.name } });
        continue;
      }
      if (typeof raw !== "string") continue;
      const spell = spellRef(ds, raw);
      if (!spell) continue;
      const own = ds.spell.find((x) => key(x.name, x.source) === spell.key)?.level ?? 1;
      out.push({ spellLevel: k.startsWith("s") ? Number(k.slice(1)) || own : own, spell });
    }
  }
  return out;
}

function raceDetail(ds: Dataset, r: { name: string; key: string; source: string; race: any; sub?: any }): ContentDetail {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  const race = r.race;
  const sub = r.sub ?? {};
  // A subrace's value replaces the race's; null removes it (Mark of Detection drops Skill Versatility).
  const pick = (k: string) => (k in sub ? sub[k] : race[k]);
  // A subrace's ability block adds to (or, with "overwrite", replaces) the base race's.
  const abilities = sub.overwrite?.ability ? sub.ability : [{ ...(race.ability?.[0] ?? {}), ...(sub.ability?.[0] ?? {}) }];
  abilityBlock(abilities, "ability", effects, choices);
  // Monsters of the Multiverse, Tasha's lineages, Van Richten's, Fizban's…: no fixed scores, "lineage" instead.
  if ((race.lineage || sub.lineage) && !effects.some((e) => e.kind === "ability") && !choices.some((c) => c.kind === "ability")) {
    choices.push(lineageChoice("ability"));
  }
  skillBlock(ds, pick("skillProficiencies"), "skills", effects, choices);
  const sp = pick("speed");
  const speed = typeof sp === "number" ? sp : sp?.walk;
  if (speed) effects.push({ kind: "speed", amount: speed });
  // Traits: a subrace trait with data.overwrite replaces the race's trait of that name (Drow's Superior Darkvision).
  const entries = [...(race.entries ?? [])];
  for (const e of sub.entries ?? []) {
    const i = e?.data?.overwrite ? entries.findIndex((x: any) => x?.name === e.data.overwrite) : -1;
    if (i >= 0) entries[i] = e;
    else entries.push(e);
  }
  // "Languages: Common and Leonin" → the "other" language is the race's own; otherwise it's a choice.
  const baseName = String(race.name).replace(/\s*\(.*\)$/, "");
  const langText = JSON.stringify(entries.find((e: any) => /^languages?$/i.test(e?.name ?? "")) ?? "");
  const ownLanguage = new RegExp(`\\b${baseName}\\b`, "i").test(langText) && !/one (?:other|extra|additional) language/i.test(langText) ? baseName : undefined;
  for (const [prefix, prop] of [["Languages", "languageProficiencies"], ["Weapons", "weaponProficiencies"], ["Tools", "toolProficiencies"], ["Armor", "armorProficiencies"]] as const) {
    const p = profBlock(prefix, pick(prop), lc(prefix), prefix === "Languages" ? ownLanguage : undefined);
    effects.push(...p.effects);
    choices.push(...p.choices);
  }
  choices.push(...mixedBlock(pick("skillToolLanguageProficiencies"), "mixed"));
  const additional = pick("additionalSpells");
  const speeds = typeof sp === "object" && sp ? Object.entries(sp).filter(([k, v]) => k !== "walk" && v).map(([k, v]) => `${k} ${v === true ? speed : typeof v === "object" ? (v as any).number : v} ft`) : [];
  const resist = [...(race.resist ?? []), ...(sub.resist ?? [])].filter((x: any) => typeof x === "string");
  const immune = [...(race.immune ?? []), ...(sub.immune ?? [])].filter((x: any) => typeof x === "string");
  const condImmune = [...(race.conditionImmune ?? []), ...(sub.conditionImmune ?? [])].filter((x: any) => typeof x === "string");
  return {
    ...summary(ds, "race", r.name, r.key, r.source),
    description: renderEntries(entries),
    meta: Object.fromEntries(
      Object.entries({
        Speed: speed ? [`${speed} ft`, ...speeds].join(", ") : undefined,
        Size: (race.size ?? []).map((x: string) => SIZES[x] ?? x).join(" or "),
        Darkvision: (sub.darkvision ?? race.darkvision) ? `${sub.darkvision ?? race.darkvision} ft` : undefined,
        Resistances: resist.length ? resist.join(", ") : undefined,
        Immunities: [...immune, ...condImmune].join(", ") || undefined,
      }).filter(([, v]) => v),
    ) as Record<string, string>,
    effects,
    choices,
    grantedSpells: raceSpellLimits(ds, grantedSpells(ds, additional), entries),
    spellPicks: spellSet(ds, additional?.[0]).picks,
    spellVariants: spellVariants(ds, additional),
    featChoice: featChoice(ds, pick("feats")),
    // Dragonmarks' "Spells of the Mark" join your class spell list.
    expandedSpells: expandedSpells(ds, additional),
  };
}

/**
 * Racial spells of 1st level or higher are cast once per rest with the trait ("Once you cast it with this
 * trait, you can't do so again until you finish a long rest"); 5etools often leaves that limit to the text.
 */
function raceSpellLimits(ds: Dataset, spells: GrantedSpell[], entries: any[]): GrantedSpell[] {
  const text = plain(renderEntries(entries));
  const limit = /(?:can't|cannot) (?:cast|do so|use)[^.]*?again until you finish (?:a )?(short or long|long|short) rest|regain the ability to cast [^.]*?when you finish (?:a )?(short or long|long|short) rest|once (?:per|each) (long|short) rest/i.exec(text);
  if (!limit) return spells;
  const rest = (limit[1] ?? limit[2] ?? limit[3]).toLowerCase().startsWith("short") ? "short rest" : "long rest";
  return spells.map((g) => {
    if (g.uses || g.mode === "prepared") return g;
    const level = ds.spell.find((x) => key(x.name, x.source) === g.spell.key)?.level ?? 0;
    return level > 0 ? { ...g, uses: `1/${rest}` } : g;
  });
}

/** Feats granted by a race or background: [{any: 1}] (Variant Human), [{"magic initiate|phb": true}], or alternatives. */
function featChoice(ds: Dataset, feats: any[] | undefined): ContentDetail["featChoice"] {
  if (!feats?.length) return undefined;
  const refs = feats.flatMap((alt: any) => Object.keys(alt).filter((k) => k !== "any" && alt[k]));
  if (feats.some((alt: any) => alt.any)) return { count: feats[0].any ?? 1 };
  const options = refs
    .map((ref) => {
      const [name, source] = ref.split("|");
      const f = ds.feat.find((x) => lc(x.name) === lc(name) && (!source || lc(x.source) === lc(source))) ?? ds.feat.find((x) => lc(x.name) === lc(name));
      return f ? { source: SOURCE, key: key(f.name, f.source), name: f.name } : null;
    })
    .filter(Boolean) as { source: "5etools"; key: string; name: string }[];
  return options.length ? { count: 1, options } : undefined;
}

const SIZES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", V: "Small or Medium" };

function backgroundDetail(ds: Dataset, b: any): ContentDetail {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  skillBlock(ds, b.skillProficiencies, "skills", effects, choices);
  for (const [prefix, prop] of [["Languages", "languageProficiencies"], ["Tools", "toolProficiencies"]] as const) {
    // Alternative sets (House Agent: each house's tools) are a choice between the sets.
    const alts = b[prop] ?? [];
    // Custom Background lists "two languages" again next to its "two tools or languages" pick.
    if (b.skillToolLanguageProficiencies && alts.every((a: any) => Object.keys(a).every((k) => k.startsWith("any")))) continue;
    if (alts.length > 1 && alts.every((a: any) => !("choose" in a))) {
      const sets = alts.map((a: any) => Object.keys(a).map((k) => (ANY_OPTIONS[k] ? `one ${ANY_OPTIONS[k].label}` : titleCase(plain(`{@x ${k.split("|")[0]}}`)))).join(", "));
      choices.push({ id: `${lc(prefix)}-set`, kind: "proficiency", prefix, count: 1, label: `${prefix}: choose one set`, options: sets.map((n: string) => ({ key: lc(n), name: n })) });
      continue;
    }
    const p = profBlock(prefix, alts, lc(prefix));
    effects.push(...p.effects);
    choices.push(...p.choices);
  }
  choices.push(...mixedBlock(b.skillToolLanguageProficiencies, "mixed"));
  return {
    ...summary(ds, "background", b.name, key(b.name, b.source), b.source),
    description: renderEntries(b.entries),
    meta: {},
    effects,
    choices,
    suggestions: backgroundTables(b.entries),
    startingEquipment: equipmentRows(b.startingEquipment ?? [], []),
    featChoice: featChoice(ds, b.feats),
    expandedSpells: expandedSpells(ds, b.additionalSpells),
  };
}

/** Pull the d8/d6 personality tables out of a background's entries. */
function backgroundTables(entries: any): { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] } {
  const out = { traits: [] as string[], ideals: [] as string[], bonds: [] as string[], flaws: [] as string[] };
  const walk = (e: any) => {
    if (Array.isArray(e)) return e.forEach(walk);
    if (!e || typeof e !== "object") return;
    if (e.type === "table" && Array.isArray(e.colLabels)) {
      // Usually the column says "Personality Trait"; some books only put it in the caption.
      const label = `${e.caption ?? ""} ${e.colLabels[1] ?? ""}`.toLowerCase();
      const target = label.includes("personality") ? out.traits : label.includes("ideal") ? out.ideals : label.includes("bond") ? out.bonds : label.includes("flaw") ? out.flaws : null;
      if (target) for (const row of e.rows ?? []) if (Array.isArray(row) && row[1] != null) target.push(plain(typeof row[1] === "string" ? row[1] : renderEntries(row[1])));
    }
    walk(e.entries);
  };
  walk(entries);
  return out;
}

const ITEM_TYPES: Record<string, string> = {
  M: "Melee Weapon", R: "Ranged Weapon", A: "Ammunition", LA: "Light Armor", MA: "Medium Armor", HA: "Heavy Armor", S: "Shield",
  G: "Adventuring Gear", AT: "Artisan's Tools", T: "Tools", GS: "Gaming Set", INS: "Instrument", P: "Potion", RG: "Ring",
  RD: "Rod", SC: "Scroll", ST: "Staff", WD: "Wand", W: "Wondrous Item", SCF: "Spellcasting Focus", MNT: "Mount", VEH: "Vehicle",
  TG: "Trade Good", "$": "Treasure", FD: "Food and Drink", EXP: "Explosive",
};
const DMG: Record<string, string> = {
  B: "Bludgeoning", P: "Piercing", S: "Slashing", A: "Acid", C: "Cold", F: "Fire", L: "Lightning", N: "Necrotic", O: "Force", R: "Radiant", I: "Poison", Y: "Psychic", T: "Thunder",
};
const PROPS: Record<string, string> = {
  V: "Versatile", F: "Finesse", L: "Light", H: "Heavy", T: "Thrown", "2H": "Two-Handed", R: "Reach", A: "Ammunition", LD: "Loading", S: "Special", RLD: "Reload", BF: "Burst Fire",
};

function itemDetail(ds: Dataset, it: any): ContentDetail {
  const type = it.type?.split("|")[0];
  const category = ITEM_TYPES[type] ?? (it.wondrous ? "Wondrous Item" : undefined);
  const meta: Record<string, string | undefined> = {
    Category: [category, it.weaponCategory && `(${it.weaponCategory})`].filter(Boolean).join(" ") || undefined,
    Rarity: it.rarity && it.rarity !== "none" ? it.rarity : undefined,
    Attunement: it.reqAttune ? (it.reqAttune === true ? "Required" : `Required ${it.reqAttune}`) : undefined,
    Cost: it.value ? `${it.value >= 100 ? `${it.value / 100} gp` : `${it.value} cp`}` : undefined,
    Weight: it.weight != null ? `${it.weight} lb` : undefined,
    Damage: it.dmg1 ? `${it.dmg1} ${DMG[it.dmgType] ?? ""}`.trim() : undefined,
    AC: it.ac ? `${it.ac}${type === "LA" ? " + Dex" : type === "MA" ? " + Dex (max 2)" : ""}` : undefined,
    Properties: [...(it.property ?? []).map((p: any) => PROPS[String(p.uid ?? p).split("|")[0]] ?? p), it.dmg2 && `versatile (${it.dmg2})`]
      .filter(Boolean)
      .join(", ") || undefined,
  };
  return {
    ...summary(ds, "item", it.name, key(it.name, it.source), it.source),
    description: renderEntries(it.entries ?? ""),
    meta: Object.fromEntries(Object.entries(meta).filter(([, v]) => v)) as Record<string, string>,
    item: { ...itemData(it, type), contents: packContents(ds, it) },
  };
}

/** A pack's contents ("backpack|phb", {item, quantity}, {special: "10 feet of string"}) as named items. */
function packContents(ds: Dataset, it: any): ItemData["contents"] {
  if (!Array.isArray(it.packContents)) return undefined;
  return it.packContents.map((e: any) => {
    const qty = typeof e === "object" && e.quantity ? Number(e.quantity) : 1;
    if (typeof e === "object" && e.special) return { name: e.special, qty };
    const [name, src = "PHB"] = String(typeof e === "string" ? e : e.item).split("|");
    const match = (x: any) => x.name.toLowerCase() === name.toLowerCase() && x.source.toLowerCase() === src.toLowerCase();
    const found = ds.baseitem.find(match) ?? ds.item.find(match);
    return found
      ? { name: found.name, qty, ref: { source: "5etools", key: key(found.name, found.source) } }
      : { name: titleCase(name), qty };
  });
}

const num = (v: unknown) => (v == null ? undefined : Number(String(v).replace(/[^\d-]/g, "")) || undefined);

/** 5etools item bonus fields → ItemBonuses. */
function itemBonuses(it: any): ItemData["bonuses"] {
  const b: NonNullable<ItemData["bonuses"]> = {
    ac: num(it.bonusAc),
    weaponAttack: num(it.bonusWeaponAttack ?? it.bonusWeapon),
    weaponDamage: num(it.bonusWeaponDamage ?? it.bonusWeapon),
    save: num(it.bonusSavingThrow),
    spellAttack: num(it.bonusSpellAttack),
    spellDc: num(it.bonusSpellSaveDc),
    check: num(it.bonusAbilityCheck),
    speed: num(it.modifySpeed?.bonus?.["*"] ?? it.modifySpeed?.bonus?.walk),
  };
  if (it.ability?.static) b.abilitySet = it.ability.static;
  const plain = Object.fromEntries(Object.entries(it.ability ?? {}).filter(([k, v]) => ABILITIES.includes(k as Ability) && typeof v === "number"));
  if (Object.keys(plain).length) b.abilityBonus = plain as Partial<Record<Ability, number>>;
  const clean = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  return Object.keys(clean).length ? (clean as ItemData["bonuses"]) : undefined;
}

function itemData(it: any, type: string): ItemData {
  const data: ItemData = {
    bonuses: itemBonuses(it),
    weight: it.weight,
    attunement: !!it.reqAttune,
    rarity: it.rarity && it.rarity !== "none" ? it.rarity : undefined,
    charges: typeof it.charges === "number" ? it.charges : undefined,
  };
  const armorType = ({ LA: "light", MA: "medium", HA: "heavy", S: "shield" } as const)[type as "LA"];
  if (armorType && it.ac != null) data.armor = { base: it.ac, type: armorType, stealthDisadvantage: !!it.stealth, strength: it.strength ? Number(it.strength) : undefined };
  if (it.dmg1) {
    const props: string[] = (it.property ?? []).map((p: any) => String(p.uid ?? p).split("|")[0]);
    data.weapon = {
      damage: it.dmg1,
      damageType: (DMG[it.dmgType] ?? "").toLowerCase(),
      versatile: it.dmg2,
      properties: props.map((p) => PROPS[p] ?? p),
      ranged: type === "R",
      finesse: props.includes("F"),
      range: it.range ? `${it.range} ft` : undefined,
      category: it.weaponCategory,
    };
  }
  return data;
}

// ---------------------------------------------------------------------------
// Features and their choices

/** Parse "Name|Class|ClassSource|Level|Source" (class) feature references. */
function parseClassFeatureRef(ref: string, defaultSource: string) {
  const [name, className, classSource, level, source] = ref.split("|");
  const cs = classSource || "PHB";
  return { name, className, classSource: cs, level: Number(level), source: source || cs || defaultSource };
}
/** Parse "Name|Class|ClassSource|SubShort|SubSource|Level|Source" (subclass) feature references. */
function parseSubclassFeatureRef(ref: string) {
  const [name, className, classSource, subShort, subSource, level, source] = ref.split("|");
  const cs = classSource || "PHB";
  return { name, className, classSource: cs, subShort, subSource: subSource || cs, level: Number(level), source: source || subSource || cs };
}

function findClassFeature(ds: Dataset, r: ReturnType<typeof parseClassFeatureRef>) {
  return ds.classFeature.find((f) => f.name === r.name && f.className === r.className && f.classSource === r.classSource && f.level === r.level && f.source === r.source)
    ?? ds.classFeature.find((f) => f.name === r.name && f.className === r.className && f.level === r.level);
}
function findSubclassFeature(ds: Dataset, r: ReturnType<typeof parseSubclassFeatureRef>) {
  return ds.subclassFeature.find(
    (f) => f.name === r.name && f.className === r.className && f.subclassShortName === r.subShort && f.level === r.level && (f.source === r.source || f.subclassSource === r.subSource),
  );
}

function optionalFeatureOption(ds: Dataset, ref: string): ChoiceOption {
  const [name, source = "PHB"] = ref.split("|");
  const of = ds.optionalfeature.find((o) => lc(o.name) === lc(name) && o.source === source) ?? ds.optionalfeature.find((o) => lc(o.name) === lc(name));
  return { key: key("of", of?.name ?? name, of?.source ?? source), name: of?.name ?? name, source: SOURCE, type: "feature", prerequisite: prerequisiteText(of?.prerequisite), requires: prerequisiteReq(of?.prerequisite) };
}

/** Option types (featureType) of the optional features an options block lists: ["MV:B"] for maneuvers. */
function optionTypes(ds: Dataset, entries: any[] | undefined): string[] {
  const refs = (entries ?? []).filter((o: any) => o?.type === "refOptionalfeature");
  if (!refs.length || refs.length !== (entries ?? []).length) return [];
  const types = new Set<string>();
  for (const r of refs) {
    const [name, source] = String(r.optionalfeature).split("|");
    const of = ds.optionalfeature.find((o) => lc(o.name) === lc(name) && (!source || lc(o.source) === lc(source)));
    for (const t of of?.featureType ?? []) types.add(t);
  }
  return [...types];
}

/** Choices embedded in a feature's entries as {type: "options"} blocks, plus Expertise. */
function featureChoices(ds: Dataset, name: string, entries: any, id: string): Choice[] {
  const choices: Choice[] = [];
  const seen = new Set<any>();
  const walk = (e: any, label = name) => {
    if (!e || typeof e !== "object") return;
    if (Array.isArray(e)) return e.forEach((x) => walk(x, label));
    // Choices inside inlined features: "Hunter" → "Hunter's Prey" → Colossus Slayer / Giant Killer / Horde Breaker.
    if (e.type === "refSubclassFeature" || e.type === "refClassFeature") {
      const f = e.type === "refSubclassFeature" ? findSubclassFeature(ds, parseSubclassFeatureRef(e.subclassFeature)) : findClassFeature(ds, parseClassFeatureRef(e.classFeature, "PHB"));
      if (f && !seen.has(f)) {
        seen.add(f);
        walk(f.entries, f.name);
      }
      return;
    }
    if (e.type === "options") {
      // No count: you get every entry (Psionic Power, Tipsy Sway, Genie's Vessel) or pick one each time
      // you use the feature (The Third Eye). Not a build choice; featureBody shows them all.
      if (e.count == null) return;
      // Maneuvers, Metamagic, Arcane Shots, Runes…: offer the whole pool of that option type, including
      // Tasha's additions ("Maneuver Options"), not just the options printed in this feature.
      const types = optionTypes(ds, e.entries);
      if (types.length) {
        const options = ds.optionalfeature
          .filter((o) => o.featureType?.some((t: string) => types.includes(t)))
          .map((o) => ({ key: key("of", o.name, o.source), name: o.name, source: SOURCE, type: "feature" as const, prerequisite: prerequisiteText(o.prerequisite), requires: prerequisiteReq(o.prerequisite) }));
        // Options you always get as one of the picks (Four Elements' Elemental Attunement).
        const required = (e.entries ?? []).filter((o: any) => o?.data?.isRequiredOption).map((o: any) => optionalFeatureOption(ds, o.optionalfeature).key);
        choices.push({ id: `${id}-${choices.length}`, label: `Choose ${e.count} ${label} option${e.count > 1 ? "s" : ""}`, kind: "feature", count: e.count, options, ...(required.length ? { required } : {}) });
        return;
      }
      const options: ChoiceOption[] = (e.entries ?? []).flatMap((o: any): ChoiceOption[] => {
        if (o.type === "refOptionalfeature") return [optionalFeatureOption(ds, o.optionalfeature)];
        if (o.type === "refClassFeature") {
          const r = parseClassFeatureRef(o.classFeature, "PHB");
          return [{ key: key("cf", r.name, r.className, r.classSource, r.level, r.source), name: r.name, source: SOURCE, type: "feature" }];
        }
        if (o.type === "refSubclassFeature") {
          const r = parseSubclassFeatureRef(o.subclassFeature);
          return [{ key: key("scf", r.name, r.className, r.classSource, r.subShort, r.subSource, r.level, r.source), name: r.name, source: SOURCE, type: "feature" }];
        }
        if (o.name) return [{ key: lc(o.name), name: o.name, description: renderEntries(o.entries ?? o.entry ?? "") }];
        return [];
      });
      if (options.length) {
        const count = e.count;
        choices.push({ id: `${id}-${choices.length}`, label: `Choose ${count} ${label} option${count > 1 ? "s" : ""}`, kind: "feature", count, options });
      }
      return;
    }
    walk(e.entries, label);
  };
  walk(entries);
  if (/^expertise/i.test(name) && !choices.length) choices.push(expertiseChoice(id));
  return choices;
}

/** "…optional feature, which replaces the Natural Explorer feature" → "Natural Explorer". */
function replacedFeature(obj: any): string | undefined {
  const first = typeof obj?.entries?.[0] === "string" ? renderTags(obj.entries[0]) : "";
  return first.match(/which replaces the (.+?) feature/i)?.[1];
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** Renders a feature, inlining any sub-features it references (e.g. a subclass's level-3 header). */
function featureBody(ds: Dataset, entries: any): string {
  const expand = (e: any): any => {
    if (Array.isArray(e)) return e.map(expand);
    // Inlined features carry a "*3rd-level Gloom Stalker feature*" line, as in the books, so the
    // sheet can tell them apart from option lists.
    if (e?.type === "refSubclassFeature") {
      const f = findSubclassFeature(ds, parseSubclassFeatureRef(e.subclassFeature));
      return f ? { type: "entries", name: f.name, entries: [`{@i ${ordinal(f.level)}-level ${f.subclassShortName} feature}`, ...expand(f.entries)] } : e;
    }
    if (e?.type === "refClassFeature") {
      const f = findClassFeature(ds, parseClassFeatureRef(e.classFeature, "PHB"));
      return f ? { type: "entries", name: f.name, entries: [`{@i ${ordinal(f.level)}-level ${f.className} feature}`, ...expand(f.entries)] } : e;
    }
    // Everything you get (no count): show each one in full, not just its name.
    if (e?.type === "options" && e.count == null) return { type: "entries", entries: expand(e.entries ?? []) };
    if (e && typeof e === "object" && e.type !== "options" && e.entries) return { ...e, entries: expand(e.entries) };
    if (e?.type === "list" && Array.isArray(e.items)) return { ...e, items: e.items.map((it: any) => (it?.type?.startsWith?.("ref") ? expand(it) : it)) };
    return e;
  };
  return renderEntries(expand(entries));
}

function featureDetail(ds: Dataset, k: string): ContentDetail | undefined {
  const [kind] = k.split("|");
  const rest = k.slice(kind.length + 1);
  let obj: any;
  if (kind === "of") {
    const [name, source] = rest.split("|");
    obj = ds.optionalfeature.find((o) => o.name === name && o.source === source);
  } else if (kind === "cf") obj = findClassFeature(ds, parseClassFeatureRef(rest, "PHB"));
  else if (kind === "scf") obj = findSubclassFeature(ds, parseSubclassFeatureRef(rest));
  if (!obj) return undefined;
  return {
    ...summary(ds, "feature", obj.name, k, obj.source),
    prerequisite: prerequisiteText(obj.prerequisite),
    description: featureBody(ds, obj.entries),
    meta: {},
    // Thieves' tools expertise is a rogue option; bards' Expertise is skills only.
    choices: featureChoices(ds, obj.name, obj.entries, lc(obj.name).replace(/\W+/g, "-")).map((ch) =>
      ch.kind === "expertise" && obj.className && obj.className !== "Rogue" ? { ...ch, options: ch.options.filter((o) => o.key !== "thieves-tools") } : ch,
    ),
    grantedSpells: obj.additionalSpells ? grantedSpells(ds, obj.additionalSpells) : tableSpells(ds, obj.entries),
    // Spells you choose (Pact of the Tome's three cantrips, Book of Ancient Secrets' rituals).
    spellPicks: obj.additionalSpells ? spellSet(ds, obj.additionalSpells[0]).picks : undefined,
  };
}

/**
 * Spells a feature teaches through a "Level | Spell" table (Primal Awareness: speak with animals at 3rd,
 * beast sense at 5th…). Spells castable once without a slot become 1/long rest innate uses.
 */
function tableSpells(ds: Dataset, entries: any): GrantedSpell[] {
  const text = JSON.stringify(entries ?? []);
  const free = /without expending a spell slot/i.test(text) && /until you finish a long rest/i.test(text);
  const out: GrantedSpell[] = [];
  const walk = (e: any) => {
    if (Array.isArray(e)) return e.forEach(walk);
    if (!e || typeof e !== "object") return;
    // Only "<Class> Level | Spell" tables teach spells; a patron's "Expanded Spells" table
    // ("Spell Level | Spells") only widens the list you choose from.
    if (e.type === "table" && /spells/i.test(e.caption ?? "") && !/expanded/i.test(e.caption ?? "") && /\w+ level/i.test(String(e.colLabels?.[0] ?? "")) && !/^\W*spell level/i.test(String(e.colLabels?.[0] ?? ""))) {
      for (const row of e.rows ?? []) {
        const level = Number(String(row?.[0] ?? "").replace(/\D/g, ""));
        for (const m of String(row?.[1] ?? "").matchAll(/\{@spell ([^}]+)\}/g)) {
          const spell = spellRef(ds, m[1]);
          if (spell && level) out.push({ level, spell, mode: free ? "innate" : "known", uses: free ? "1/long rest" : undefined });
        }
      }
      return;
    }
    walk(e.entries);
  };
  walk(entries);
  return out;
}

// ---------------------------------------------------------------------------
// Class progression

function findClass(ds: Dataset, k: string) {
  const [name, source] = k.split("|");
  return ds.class.find((c) => c.name === name && c.source === source);
}

function findSubclass(ds: Dataset, k: string) {
  const [shortName, source, className, classSource] = k.split("|");
  return ds.subclass.find((s) => s.shortName === shortName && s.source === source && s.className === className && s.classSource === classSource);
}

const CASTER: Record<string, ClassRules["casterType"]> = { full: "full", "1/2": "half", "1/3": "third", pact: "pact", artificer: "artificer" };

/** Total picks known at a level from an optionalfeatureProgression (array by level or {level: total}). */
function progressionTotal(prog: any, level: number): number {
  if (Array.isArray(prog)) return prog[level - 1] ?? 0;
  return Object.entries(prog ?? {}).reduce((t, [l, n]) => (Number(l) <= level ? Math.max(t, n as number) : t), 0);
}

/** Option types of counted options blocks in a feature's entries, following feature references. */
function embeddedOptionTypes(ds: Dataset, entries: any, seen = new Set<any>()): string[] {
  const out: string[] = [];
  const walk = (e: any) => {
    if (Array.isArray(e)) return e.forEach(walk);
    if (!e || typeof e !== "object") return;
    if (e.type === "options" && e.count != null) out.push(...optionTypes(ds, e.entries));
    if (e.type === "refSubclassFeature" || e.type === "refClassFeature") {
      const f = e.type === "refSubclassFeature" ? findSubclassFeature(ds, parseSubclassFeatureRef(e.subclassFeature)) : findClassFeature(ds, parseClassFeatureRef(e.classFeature, "PHB"));
      if (f && !seen.has(f)) {
        seen.add(f);
        walk(f.entries);
      }
    }
    walk(e.entries);
  };
  walk(entries);
  return out;
}

function progressionsAt(ds: Dataset, progs: any[] | undefined, level: number, featuresHere: { name: string; obj?: any }[]): Progression[] {
  return (progs ?? []).flatMap((p) => {
    const total = progressionTotal(p.progression, level);
    const gained = total - progressionTotal(p.progression, level - 1);
    // A feature at this level that already embeds the options (e.g. Fighting Style) covers the pick.
    // Also when the options sit in a feature the subclass entry references ("Battle Master" → "Maneuvers"),
    // matched by option type since names differ ("Rune Carver" vs "Runes").
    const covered = featuresHere.some((f) => f.name === p.name && JSON.stringify(f.obj?.entries ?? "").includes('"options"'))
      || featuresHere.some((f) => embeddedOptionTypes(ds, f.obj?.entries).some((t) => p.featureType.includes(t)));
    // Invocations, runes and infusions can be swapped at every level of the class; maneuvers, arcane shots
    // and disciplines only when new ones are learned; Metamagic, Fighting Style and Pact Boon never (2014).
    const swap = /invocation|rune|infusion/i.test(p.name) ? total > 0 : /maneuver|arcane shot|discipline/i.test(p.name) ? gained > 0 : false;
    if (covered || (gained <= 0 && !swap)) return [];
    const options = ds.optionalfeature
      .filter((o) => o.featureType?.some((t: string) => p.featureType.includes(t)))
      .map((o) => ({ key: key("of", o.name, o.source), name: o.name, source: SOURCE, type: "feature" as const, prerequisite: prerequisiteText(o.prerequisite), requires: prerequisiteReq(o.prerequisite) }));
    return [{ name: p.name, total, gained: Math.max(0, gained), options, swap }];
  });
}

/**
 * Tools a class lets you pick. Alternatives of "any…" (Monk: artisan's tools or a musical instrument) are one
 * pick from all of them.
 */
function classToolChoices(block: any[] | undefined, id: string): Choice[] {
  if (block && block.length > 1 && block.every((alt: any) => Object.keys(alt).every((k) => ANY_OPTIONS[k]))) {
    const kinds = [...new Set(block.flatMap((alt: any) => Object.keys(alt)))] as string[];
    const count = Math.max(...block.map((alt: any) => Number(Object.values(alt)[0]) || 1));
    const choice = profChoice(id, "Tools", count, kinds.map((k) => ANY_OPTIONS[k].label).join(" or "), kinds.flatMap((k) => ANY_OPTIONS[k].options));
    return [{ ...choice, label: `Tools: choose ${count} (${kinds.map((k) => ANY_OPTIONS[k].label).join(" or ")})` }];
  }
  return profBlock("Tools", block, id).choices;
}

function profStrings(block: any): string[] {
  if (!block) return [];
  // Optional entries (artificer firearms, at the DM's discretion) aren't granted.
  const fmt = (xs: any[]) => xs.map((x) => (typeof x === "string" ? plain(x) : x.proficiency && !x.optional ? plain(x.proficiency) : "")).filter(Boolean).join(", ");
  // Tools you pick ("one type of artisan's tools of your choice") are asked for as a choice (toolChoices).
  const picked = block.toolProficiencies?.[0] && Object.keys(block.toolProficiencies[0]).some((k) => k === "choose" || k.startsWith("any"));
  const tools = (block.tools ?? []).filter((t: any) => !(picked && typeof t === "string" && /your choice|^(one|two|three) /i.test(plain(t))));
  return [
    block.armor?.length && `Armor: ${fmt(block.armor)}`,
    block.weapons?.length && `Weapons: ${fmt(block.weapons)}`,
    tools.length && `Tools: ${fmt(tools)}`,
  ].filter(Boolean) as string[];
}

function skillChoices(block: any[] | undefined) {
  const s = block?.[0];
  if (!s) return null;
  if (s.any) return { count: s.any, from: SKILL_KEYS };
  if (s.choose) return { count: s.choose.count ?? 1, from: (s.choose.from ?? []).map(toSkillKey).filter((k: string) => SKILL_KEYS.includes(k)) };
  return null;
}

function itemName(ref: string) {
  const n = ref.split("|")[0];
  // Capitalize words, not letters after an apostrophe ("dungeoneer's pack" → "Dungeoneer's Pack").
  return n.replace(/(^|[\s(-])(\w)/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

const EQUIPMENT_TYPES: Record<string, string> = {
  weaponSimple: "Any simple weapon", weaponMartial: "Any martial weapon", weaponSimpleMelee: "Any simple melee weapon",
  weaponMartialMelee: "Any martial melee weapon", instrumentMusical: "Any musical instrument", toolArtisan: "Any artisan's tools",
  focusSpellcastingArcane: "Arcane focus", focusSpellcastingDruidic: "Druidic focus", focusSpellcastingHoly: "Holy symbol",
  setGaming: "Any gaming set", toolArtisan2: "Any artisan's tools",
};

function startingEquipment(cls: any): EquipmentChoice[] {
  return equipmentRows(cls.startingEquipment?.defaultData ?? [], cls.startingEquipment?.default ?? []);
}

/** Copper pieces as the coins a book would list: 1500 → "15 gp", 10 → "1 sp", 5 → "5 cp". */
const coins = (cp: number) => (cp % 100 === 0 ? `${cp / 100} gp` : cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`);

function equipmentRows(data: any[], labels: string[]): EquipmentChoice[] {
  const toItem = (x: any) => {
    if (typeof x === "string") return { name: itemName(x), qty: 1 };
    if (x.item) return { name: x.displayName ? plain(x.displayName) : itemName(x.item), qty: x.quantity ?? 1 };
    if (x.equipmentType) return { name: x.displayName ? plain(x.displayName) : EQUIPMENT_TYPES[x.equipmentType] ?? x.equipmentType, qty: x.quantity ?? 1 };
    if (x.special) return { name: x.special, qty: x.quantity ?? 1 };
    if (x.value) return { name: coins(x.value), qty: 1 };
    if (x.containsValue) return { name: coins(x.containsValue), qty: 1 };
    return { name: "?", qty: 1 };
  };
  return data.map((row, i) => ({
    label: labels[i] ? plain(labels[i]) : row._ ? "Included" : "Choose one",
    options: Object.entries(row).map(([opt, items]) => ({
      label: opt === "_" ? "Included" : `(${opt})`,
      // A pouch "containing 15 gp" yields the pouch and the coins.
      items: (items as any[]).flatMap((x) => (x?.containsValue && (x.item || x.special) ? [toItem(x), { name: coins(x.containsValue), qty: 1 }] : [toItem(x)])),
    })),
  }));
}

export async function classRules5etools(k: string): Promise<ClassRules> {
  const ds = await getDataset();
  const cls = findClass(ds, k);
  if (!cls) throw new HttpError(404, `No 5etools class '${k}'`);
  const casterType = CASTER[cls.casterProgression] ?? "none";
  const refs = (cls.classFeatures ?? []).map((f: any) => ({
    ...parseClassFeatureRef(typeof f === "string" ? f : f.classFeature, cls.source),
    gainSubclass: typeof f === "object" && f.gainSubclassFeature,
  }));
  const subclassLevel = refs.find((r: any) => r.gainSubclass)?.level ?? 3;
  const mc = cls.multiclassing ?? {};
  const req = mc.requirements;
  return {
    source: SOURCE,
    index: k,
    name: cls.name,
    sourceLabel: label(ds, cls.source),
    hitDie: cls.hd?.faces ?? 8,
    savingThrows: cls.proficiency ?? [],
    spellcastingAbility: cls.spellcastingAbility ?? null,
    casterType,
    spellModel: !cls.spellcastingAbility ? null : cls.spellsKnownProgressionFixed ? "spellbook" : cls.spellsKnownProgression ? "known" : "prepared",
    preparedDivisor: /\/\s*2/.test(cls.preparedSpells ?? "") ? 2 : 1,
    subclassLevel,
    subclassTitle: cls.subclassTitle ?? "Subclass",
    subclasses: ds.subclass
      .filter((s) => s.className === cls.name && s.classSource === cls.source)
      .map((s) => ({ source: SOURCE, key: key(s.shortName, s.source, s.className, s.classSource), name: s.name, sourceLabel: label(ds, s.source) })),
    proficiencies: profStrings(cls.startingProficiencies),
    skillChoices: skillChoices(cls.startingProficiencies?.skills),
    toolChoices: classToolChoices(cls.startingProficiencies?.toolProficiencies, "class-tools"),
    multiclass: {
      requirements: req ? { any: !!req.or, scores: req.or ? req.or[0] : req } : null,
      proficiencies: profStrings(mc.proficienciesGained),
      skillChoices: skillChoices(mc.proficienciesGained?.skills),
      toolChoices: classToolChoices(mc.proficienciesGained?.toolProficiencies, "mc-tools"),
    },
    startingEquipment: startingEquipment(cls),
    levels: Array.from({ length: 20 }, (_, i): LevelRules => {
      const level = i + 1;
      const here = refs.filter((r: any) => r.level === level);
      const features = here
        .filter((r: any) => !(r.gainSubclass && /feature$/i.test(r.name)))
        .map((r: any) => ({ ...r, obj: findClassFeature(ds, r) }));
      return {
        level,
        profBonus: Math.ceil(level / 4) + 1,
        abilityScoreBonuses: refs.filter((r: any) => r.level <= level && r.name === "Ability Score Improvement").length,
        features: features.map((r: any): FeatureRef => ({
          source: SOURCE, key: key("cf", r.name, r.className, r.classSource, r.level, r.source), name: r.name,
          ...(r.obj?.isClassFeatureVariant ? { optional: true, replaces: replacedFeature(r.obj) } : {}),
        })),
        spellcasting: cls.spellcastingAbility
          ? {
              cantripsKnown: cls.cantripProgression?.[i] ?? 0,
              spellsKnown: cls.spellsKnownProgression?.[i] ?? null,
              slots: singleClassSlots(casterType, level),
            }
          : null,
        progressions: progressionsAt(ds, cls.optionalfeatureProgression, level, features),
      };
    }),
  };
}

function subclassFeatures(ds: Dataset, sc: any) {
  return (sc.subclassFeatures ?? []).map((ref: string) => {
    const r = parseSubclassFeatureRef(ref);
    return { ...r, obj: findSubclassFeature(ds, r) };
  });
}

/** Per-level subclass features, progressions, and spellcasting for subclass casters (Eldritch Knight…). */
export async function subclassLevels5etools(k: string) {
  const ds = await getDataset();
  const sc = findSubclass(ds, k);
  if (!sc) throw new HttpError(404, `No 5etools subclass '${k}'`);
  const feats = subclassFeatures(ds, sc);
  const casterType = CASTER[sc.casterProgression];
  return {
    // Only subclasses with a caster progression (Eldritch Knight, Arcane Trickster) cast spells; others
    // (Ancestral Guardian, Four Elements) carry an ability just for their own granted spells.
    spellcastingAbility: casterType ? sc.spellcastingAbility ?? null : null,
    casterType: casterType ?? null,
    spellModel: casterType ? (sc.spellsKnownProgression ? "known" : "prepared") : null,
    grantedSpells: grantedSpells(ds, sc.additionalSpells),
    spellPicks: spellSet(ds, sc.additionalSpells?.[0]).picks,
    expandedSpells: expandedSpells(ds, sc.additionalSpells),
    spellVariants: spellVariants(ds, sc.additionalSpells),
    levels: Array.from({ length: 20 }, (_, i) => {
      const level = i + 1;
      const here = feats.filter((f: any) => f.level === level);
      return {
        level,
        features: here.map((r: any) => ({
          source: SOURCE, key: key("scf", r.name, r.className, r.classSource, r.subShort, r.subSource, r.level, r.source), name: r.name,
          ...(r.obj?.isClassFeatureVariant ? { optional: true, replaces: replacedFeature(r.obj) } : {}),
        })),
        progressions: progressionsAt(ds, sc.optionalfeatureProgression, level, here),
        spellcasting: casterType
          ? { cantripsKnown: sc.cantripProgression?.[i] ?? 0, spellsKnown: sc.spellsKnownProgression?.[i] ?? null, slots: singleClassSlots(casterType, level) }
          : null,
      };
    }),
  };
}

export { renderTags };
