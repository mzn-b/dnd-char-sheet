import { HttpError } from "../http.js";
import {
  ABILITIES, SKILL_KEYS, expertiseChoice, singleClassSlots, skillName, toSkillKey,
  type Ability, type Choice, type ChoiceOption, type ClassRules, type ContentDetail, type ContentSummary,
  type ContentType, type Effect, type EquipmentChoice, type ExpandedSpell, type FeatureRef, type GrantedSpell, type ItemData, type LevelRules, type Progression, type SpellDice,
} from "../types.js";
import { diceFromText, mergeDice } from "../spellDice.js";
import { getDataset, type Dataset } from "./data.js";
import {
  backgroundFacets5e, classFacets5e, featFacets5e, itemFacets5e, optionalFeatureFacets5e, raceFacets5e, spellFacets5e, subclassFacets5e,
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
      return ds.feat.filter((x) => !x._copy || x.entries).map((x) => summary(ds, type, x.name, key(x.name, x.source), x.source, { facets: featFacets5e(x) }));
    case "background":
      return ds.background.filter((x) => !x._copy || x.entries).map((x) => summary(ds, type, x.name, key(x.name, x.source), x.source, { facets: backgroundFacets5e(x) }));
    case "item":
      return [...ds.baseitem, ...ds.item].map((x) => summary(ds, type, x.name, key(x.name, x.source), x.source, { facets: itemFacets5e(x) }));
    case "race":
      return races(ds).map((r) => summary(ds, type, r.name, r.key, r.source, { facets: raceFacets5e(r.race, r.sub) }));
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
  const fromIndex = [...(entry?.class ?? []), ...(entry?.classVariant ?? [])].map((c: any) => lc(c.name));
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
    perSlot: higher.match(/\{@scale(?:damage|dice) [^|}]+\|[^|}]+\|(\d+d\d+)/)?.[1],
    byCharacterLevel: scaling?.scaling,
    addModifier: heal && /spellcasting ability modifier/.test(raw) ? true : undefined,
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

function prerequisiteText(prereqs?: any[]): string | undefined {
  if (!prereqs?.length) return undefined;
  return prereqs
    .map((p) =>
      Object.entries(p)
        .map(([k, v]: [string, any]) => {
          if (k === "ability") return v.map((a: any) => Object.entries(a).map(([ab, n]) => `${ab.toUpperCase()} ${n}+`).join(" or ")).join(", ");
          if (k === "level") return typeof v === "number" ? `Level ${v}` : `${v.class?.name ?? ""} level ${v.level}`.trim();
          if (k === "race") return v.map((r: any) => r.displayEntry ?? `${r.name}${r.subrace ? ` (${r.subrace})` : ""}`).join(" or ");
          if (k === "spellcasting" || k === "spellcasting2020") return "The ability to cast at least one spell";
          if (k === "pact") return `Pact of the ${v}`;
          if (k === "patron") return `${v} patron`;
          if (k === "spell") return v.map((s: string) => plain(`{@spell ${s.split("#")[0]}}`)).join(", ");
          if (k === "proficiency") return v.map((x: any) => Object.entries(x).map(([t, n]) => `${n} ${t} proficiency`).join(", ")).join(" or ");
          if (k === "feature") return v.join(", ");
          if (k === "other") return v;
          return "";
        })
        .filter(Boolean)
        .join("; "),
    )
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

function profText(label: string, block: any[] | undefined): Effect[] {
  const b = block?.[0];
  if (!b) return [];
  const parts = Object.entries(b).map(([k, v]) =>
    k === "anyStandard" || k === "any" ? `${v} of your choice` : k === "choose" ? `choose ${(v as any).count ?? 1}` : plain(`{@x ${k}}`),
  );
  return parts.length ? [{ kind: "proficiency", value: `${label}: ${parts.join(", ")}` }] : [];
}

function featDetail(ds: Dataset, f: any): ContentDetail {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  abilityBlock(f.ability, "ability", effects, choices);
  skillBlock(ds, f.skillProficiencies, "skills", effects, choices);
  const save = f.savingThrowProficiencies?.[0]?.choose;
  if (save) choices.push({ id: "save", kind: "save", count: save.count ?? 1, label: "Gain saving throw proficiency", options: (save.from ?? ABILITIES).map((a: string) => ({ key: a, name: a.toUpperCase() })) });
  return {
    ...summary(ds, "feat", f.name, key(f.name, f.source), f.source),
    prerequisite: prerequisiteText(f.prerequisite),
    description: renderEntries(f.entries),
    meta: {},
    effects,
    choices,
  };
}

/** Resolve a 5etools spell reference ("hellish rebuke#2", "fireball|xge") to a content ref. */
function spellRef(ds: Dataset, raw: string) {
  const [name, source] = raw.split("#")[0].split("|");
  const s = ds.spell.find((x) => lc(x.name) === lc(name) && (!source || lc(x.source) === lc(source))) ?? ds.spell.find((x) => lc(x.name) === lc(name));
  return s ? { source: SOURCE, key: key(s.name, s.source), name: s.name } : undefined;
}

/**
 * Translate 5etools additionalSpells (first option) into granted spells.
 * Keys are levels; values are spell lists or {daily: {"1": [...]}, rest: {...}}. "expanded" lists
 * only widen what can be learned, so they're not granted.
 */
function grantedSpells(ds: Dataset, additional: any[] | undefined): GrantedSpell[] {
  const a = additional?.[0];
  if (!a) return [];
  const out: GrantedSpell[] = [];
  const push = (mode: GrantedSpell["mode"], level: string, spells: any, uses?: string) => {
    for (const raw of Array.isArray(spells) ? spells : []) {
      if (typeof raw !== "string") continue;
      const spell = spellRef(ds, raw);
      if (spell) out.push({ level: Number(String(level).replace(/\D/g, "")) || 1, spell, mode, uses });
    }
  };
  for (const mode of ["innate", "known", "prepared"] as const) {
    for (const [level, v] of Object.entries(a[mode] ?? {})) {
      if (Array.isArray(v)) push(mode, level, v);
      else if (v && typeof v === "object") {
        for (const [k, inner] of Object.entries(v as any)) {
          if (k === "_") push(mode, level, inner);
          else if (k === "daily" || k === "rest") for (const [n, list] of Object.entries(inner as any)) push(mode, level, list, `${n.replace("e", "")}/${k === "daily" ? "long rest" : "short rest"}`);
          else if (k === "will") push(mode, level, inner, "at will");
        }
      }
    }
  }
  return out;
}

/**
 * additionalSpells "expanded" lists: keys "s1".."s9" are spell levels; plain numbers are class
 * levels (the spell's own level is used then).
 */
function expandedSpells(ds: Dataset, additional: any[] | undefined): ExpandedSpell[] {
  const out: ExpandedSpell[] = [];
  for (const [k, list] of Object.entries(additional?.[0]?.expanded ?? {})) {
    for (const raw of Array.isArray(list) ? list : []) {
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
  // A subrace's ability block adds to (or, with "overwrite", replaces) the base race's.
  const abilities = sub.overwrite?.ability ? sub.ability : [{ ...(race.ability?.[0] ?? {}), ...(sub.ability?.[0] ?? {}) }];
  abilityBlock(abilities, "ability", effects, choices);
  // Monsters of the Multiverse, Tasha's lineages, Van Richten's, Fizban's…: no fixed scores, "lineage" instead.
  if ((race.lineage || sub.lineage) && !effects.some((e) => e.kind === "ability") && !choices.some((c) => c.kind === "ability")) {
    choices.push(lineageChoice("ability"));
  }
  skillBlock(ds, sub.skillProficiencies ?? race.skillProficiencies, "skills", effects, choices);
  const speed = typeof race.speed === "number" ? race.speed : race.speed?.walk;
  if (speed) effects.push({ kind: "speed", amount: speed });
  effects.push(...profText("Languages", sub.languageProficiencies ?? race.languageProficiencies));
  effects.push(...profText("Weapons", sub.weaponProficiencies ?? race.weaponProficiencies));
  effects.push(...profText("Tools", sub.toolProficiencies ?? race.toolProficiencies));
  return {
    ...summary(ds, "race", r.name, r.key, r.source),
    description: renderEntries([...(race.entries ?? []), ...(sub.entries ?? [])]),
    meta: Object.fromEntries(
      Object.entries({
        Speed: speed ? `${speed} ft` : undefined,
        Size: (race.size ?? []).map((s: string) => SIZES[s] ?? s).join(" or "),
        Darkvision: (sub.darkvision ?? race.darkvision) ? `${sub.darkvision ?? race.darkvision} ft` : undefined,
      }).filter(([, v]) => v),
    ) as Record<string, string>,
    effects,
    choices,
    grantedSpells: grantedSpells(ds, sub.additionalSpells ?? race.additionalSpells),
  };
}

const SIZES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large" };

function backgroundDetail(ds: Dataset, b: any): ContentDetail {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  skillBlock(ds, b.skillProficiencies, "skills", effects, choices);
  effects.push(...profText("Languages", b.languageProficiencies), ...profText("Tools", b.toolProficiencies));
  return {
    ...summary(ds, "background", b.name, key(b.name, b.source), b.source),
    description: renderEntries(b.entries),
    meta: {},
    effects,
    choices,
    suggestions: backgroundTables(b.entries),
    startingEquipment: equipmentRows(b.startingEquipment ?? [], []),
  };
}

/** Pull the d8/d6 personality tables out of a background's entries. */
function backgroundTables(entries: any): { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] } {
  const out = { traits: [] as string[], ideals: [] as string[], bonds: [] as string[], flaws: [] as string[] };
  const walk = (e: any) => {
    if (Array.isArray(e)) return e.forEach(walk);
    if (!e || typeof e !== "object") return;
    if (e.type === "table" && Array.isArray(e.colLabels)) {
      const label = String(e.colLabels[1] ?? "").toLowerCase();
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
    item: itemData(it, type),
  };
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
  return { key: key("of", of?.name ?? name, of?.source ?? source), name: of?.name ?? name, source: SOURCE, type: "feature", prerequisite: prerequisiteText(of?.prerequisite) };
}

/** Choices embedded in a feature's entries as {type: "options"} blocks, plus Expertise. */
function featureChoices(ds: Dataset, name: string, entries: any, id: string): Choice[] {
  const choices: Choice[] = [];
  const walk = (e: any) => {
    if (!e || typeof e !== "object") return;
    if (Array.isArray(e)) return e.forEach(walk);
    if (e.type === "options") {
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
        const count = e.count ?? 1;
        choices.push({ id: `${id}-${choices.length}`, label: `Choose ${count} ${name} option${count > 1 ? "s" : ""}`, kind: "feature", count, options });
      }
      return;
    }
    walk(e.entries);
  };
  walk(entries);
  if (/^expertise/i.test(name) && !choices.length) choices.push(expertiseChoice(id));
  return choices;
}

/** Renders a feature, inlining any sub-features it references (e.g. a subclass's level-3 header). */
function featureBody(ds: Dataset, entries: any): string {
  const expand = (e: any): any => {
    if (Array.isArray(e)) return e.map(expand);
    if (e?.type === "refSubclassFeature") {
      const f = findSubclassFeature(ds, parseSubclassFeatureRef(e.subclassFeature));
      return f ? { type: "entries", name: f.name, entries: expand(f.entries) } : e;
    }
    if (e?.type === "refClassFeature") {
      const f = findClassFeature(ds, parseClassFeatureRef(e.classFeature, "PHB"));
      return f ? { type: "entries", name: f.name, entries: expand(f.entries) } : e;
    }
    if (e && typeof e === "object" && e.type !== "options" && e.entries) return { ...e, entries: expand(e.entries) };
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
    choices: featureChoices(ds, obj.name, obj.entries, lc(obj.name).replace(/\W+/g, "-")),
  };
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

function progressionsAt(ds: Dataset, progs: any[] | undefined, level: number, featuresHere: { name: string; obj?: any }[]): Progression[] {
  return (progs ?? []).flatMap((p) => {
    const total = progressionTotal(p.progression, level);
    const gained = total - progressionTotal(p.progression, level - 1);
    // A feature at this level that already embeds the options (e.g. Fighting Style) covers the pick.
    const covered = featuresHere.some((f) => f.name === p.name && JSON.stringify(f.obj?.entries ?? "").includes('"options"'));
    if (gained <= 0 || covered) return [];
    const options = ds.optionalfeature
      .filter((o) => o.featureType?.some((t: string) => p.featureType.includes(t)))
      .map((o) => ({ key: key("of", o.name, o.source), name: o.name, source: SOURCE, type: "feature" as const, prerequisite: prerequisiteText(o.prerequisite) }));
    return [{ name: p.name, total, gained, options }];
  });
}

function profStrings(block: any): string[] {
  if (!block) return [];
  const fmt = (xs: any[]) => xs.map((x) => (typeof x === "string" ? plain(x) : x.proficiency ? plain(x.proficiency) : "")).filter(Boolean).join(", ");
  return [
    block.armor?.length && `Armor: ${fmt(block.armor)}`,
    block.weapons?.length && `Weapons: ${fmt(block.weapons)}`,
    block.tools?.length && `Tools: ${fmt(block.tools)}`,
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
};

function startingEquipment(cls: any): EquipmentChoice[] {
  return equipmentRows(cls.startingEquipment?.defaultData ?? [], cls.startingEquipment?.default ?? []);
}

function equipmentRows(data: any[], labels: string[]): EquipmentChoice[] {
  const toItem = (x: any) => {
    if (typeof x === "string") return { name: itemName(x), qty: 1 };
    if (x.item) return { name: x.displayName ? plain(x.displayName) : itemName(x.item), qty: x.quantity ?? 1 };
    if (x.equipmentType) return { name: EQUIPMENT_TYPES[x.equipmentType] ?? x.equipmentType, qty: x.quantity ?? 1 };
    if (x.special) return { name: x.special, qty: x.quantity ?? 1 };
    if (x.value) return { name: `${x.value / 100} gp`, qty: 1 };
    if (x.containsValue) return { name: `${x.containsValue / 100} gp`, qty: 1 };
    return { name: "?", qty: 1 };
  };
  return data.map((row, i) => ({
    label: labels[i] ? plain(labels[i]) : row._ ? "Included" : "Choose one",
    options: Object.entries(row).map(([opt, items]) => ({
      label: opt === "_" ? "Included" : `(${opt})`,
      // A pouch "containing 15 gp" yields the pouch and the coins.
      items: (items as any[]).flatMap((x) => (x?.item && x.containsValue ? [toItem(x), { name: `${x.containsValue / 100} gp`, qty: 1 }] : [toItem(x)])),
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
    multiclass: {
      requirements: req ? { any: !!req.or, scores: req.or ? req.or[0] : req } : null,
      proficiencies: profStrings(mc.proficienciesGained),
      skillChoices: skillChoices(mc.proficienciesGained?.skills),
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
          ...(r.obj?.isClassFeatureVariant ? { optional: true } : {}),
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
    spellcastingAbility: sc.spellcastingAbility ?? null,
    casterType: casterType ?? null,
    spellModel: sc.spellcastingAbility ? (sc.spellsKnownProgression ? "known" : "prepared") : null,
    grantedSpells: grantedSpells(ds, sc.additionalSpells),
    expandedSpells: expandedSpells(ds, sc.additionalSpells),
    levels: Array.from({ length: 20 }, (_, i) => {
      const level = i + 1;
      const here = feats.filter((f: any) => f.level === level);
      return {
        level,
        features: here.map((r: any) => ({
          source: SOURCE, key: key("scf", r.name, r.className, r.classSource, r.subShort, r.subSource, r.level, r.source), name: r.name,
          ...(r.obj?.isClassFeatureVariant ? { optional: true } : {}),
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
