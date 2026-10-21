import type { Facets } from "./types.js";

/**
 * Filterable values for search results ("facets"): school, casting time, damage types, ability
 * increases, cost, AC, CR, speeds… Each provider maps its own fields to the same keys, so the
 * client can build filters from whatever values the results have.
 */

const cap = (v: unknown) => {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const ABILITY: Record<string, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
  strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA",
};
const abilityName = (a: string) => ABILITY[a.toLowerCase()] ?? a.toUpperCase();

/** Removes empty values so payloads stay small. */
/** Facet values as they're built (undefined/null are dropped by clean). */
type RawFacets = Record<string, string | number | boolean | string[] | undefined | null>;

export function clean(f: RawFacets): Facets | undefined {
  for (const [k, v] of Object.entries(f)) if (Array.isArray(v)) f[k] = [...new Set(v.filter((x) => typeof x === "string" && x))];
  const out = Object.fromEntries(
    Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "number" && Number.isNaN(v))),
  );
  return Object.keys(out).length ? (out as Facets) : undefined;
}

/** Which of action / bonus action / reaction a rules text lets you spend. */
export function actionsIn(text: string): string[] {
  const out: string[] = [];
  if (/\b(?:as an|use an|use your|take an) action\b|\baction to (?:magically|activate|use|channel)/i.test(text)) out.push("Action");
  if (/\bbonus action\b/i.test(text)) out.push("Bonus action");
  if (/\breaction\b/i.test(text)) out.push("Reaction");
  return out;
}

/** "30 feet" → 30, "1 mile" → 5280, "Touch" → 5, "Self" → 0. */
export function rangeFeet(text?: string): number | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (t.startsWith("self")) return 0;
  if (t.startsWith("touch")) return 5;
  const m = t.match(/([\d,]+)\s*(feet|foot|ft|miles?)/);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return /mile/.test(m[2]) ? n * 5280 : n;
}

/** "1 action" → Action, "1 bonus action" → Bonus action, "1 reaction, which…" → Reaction, else the text. */
export function castingTimeLabel(text?: string): string | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/bonus/.test(t)) return "Bonus action";
  if (/reaction/.test(t)) return "Reaction";
  if (/^1 action/.test(t) || t === "action") return "Action";
  // "1minute", "10 Minutes" → "1 minute", "10 minutes"
  return text.split(",")[0].trim().replace(/^(\d+)\s*/, "$1 ").toLowerCase();
}

/** "15 gp" → 15, "5 sp" → 0.5. */
export function costGp(text?: string): number | undefined {
  const m = text?.match(/([\d,.]+)\s*(cp|sp|ep|gp|pp)/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return n * ({ cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 } as Record<string, number>)[m[2].toLowerCase()];
}

/** "darkvision 60 ft., tremorsense 30 ft." → ["Darkvision", "Tremorsense"]. */
export function senseNames(text?: string): string[] {
  return ["darkvision", "blindsight", "tremorsense", "truesight"].filter((s) => text?.toLowerCase().includes(s)).map(cap);
}

const splitList = (s?: string | null) =>
  (s ?? "").split(/[,;]/).map((x) => x.trim()).filter((x) => x && !/^(none|—|-)$/i.test(x)).map((x) => cap(x.replace(/\s+from nonmagical attacks.*$/i, " (nonmagical)")));

const DAMAGE_WORDS = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
/** Damage types mentioned in a text ("takes 3d6 fire damage"). */
export const damageTypesIn = (text: string) => DAMAGE_WORDS.filter((d) => new RegExp(`\\b${d} damage`, "i").test(text)).map(cap);

/** Save abilities a text forces ("a Dexterity saving throw"). */
export const savesIn = (text: string) =>
  ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"].filter((a) => new RegExp(`${a} saving throw`, "i").test(text)).map(abilityName);

// ---------------------------------------------------------------------------
// 5etools

const SCHOOLS: Record<string, string> = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment", V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation", P: "Psionic",
};
const SIZES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
const DMG: Record<string, string> = {
  B: "Bludgeoning", P: "Piercing", S: "Slashing", A: "Acid", C: "Cold", F: "Fire", L: "Lightning", N: "Necrotic", O: "Force", R: "Radiant", I: "Poison", Y: "Psychic", T: "Thunder",
};
const PROPS: Record<string, string> = {
  V: "Versatile", F: "Finesse", L: "Light", H: "Heavy", T: "Thrown", "2H": "Two-handed", R: "Reach", A: "Ammunition", LD: "Loading", S: "Special", RLD: "Reload", BF: "Burst fire",
};
const ITEM_TYPES: Record<string, string> = {
  M: "Melee weapon", R: "Ranged weapon", A: "Ammunition", LA: "Light armor", MA: "Medium armor", HA: "Heavy armor", S: "Shield",
  G: "Adventuring gear", AT: "Artisan's tools", T: "Tools", GS: "Gaming set", INS: "Instrument", P: "Potion", RG: "Ring",
  RD: "Rod", SC: "Scroll", ST: "Staff", WD: "Wand", W: "Wondrous item", SCF: "Spellcasting focus", MNT: "Mount", VEH: "Vehicle",
  TG: "Trade good", $: "Treasure", FD: "Food and drink", EXP: "Explosive",
};
const FEATURE_TYPES: Record<string, string> = {
  EI: "Eldritch Invocation", MM: "Metamagic", "MV:B": "Maneuver", MV: "Maneuver", "FS:F": "Fighting Style", "FS:R": "Fighting Style", "FS:P": "Fighting Style", "FS:B": "Fighting Style",
  PB: "Pact Boon", AI: "Artificer Infusion", ED: "Elemental Discipline", AS: "Arcane Shot", RN: "Rune", AF: "Alchemical Formula", OTH: "Other",
};
const code = (v: any) => String(v?.uid ?? v ?? "").split("|")[0];
const json = (v: unknown) => JSON.stringify(v ?? "");

function spellFacets5eRaw(s: any): Facets | undefined {
  const t = s.time?.[0];
  const unit = t?.unit;
  const range = s.range?.distance;
  const text = json([s.entries, s.entriesHigherLevel]);
  return clean({
    school: SCHOOLS[s.school] ?? s.school,
    castingTime: unit === "action" ? "Action" : unit === "bonus" ? "Bonus action" : unit === "reaction" ? "Reaction" : t ? `${t.number} ${unit}${t.number > 1 ? "s" : ""}` : undefined,
    concentration: !!s.duration?.some((d: any) => d.concentration),
    ritual: !!s.meta?.ritual,
    components: ["v", "s", "m"].filter((k) => s.components?.[k]).map((k) => k.toUpperCase()),
    costlyMaterial: !!(s.components?.m?.cost || /\d+\s*gp/.test(json(s.components?.m))),
    damageTypes: (s.damageInflict ?? []).map(cap),
    save: (s.savingThrow ?? []).map(abilityName),
    attack: (s.spellAttack ?? []).map((a: string) => (a === "M" ? "Melee" : a === "R" ? "Ranged" : a)),
    conditions: (s.conditionInflict ?? []).map(cap),
    healing: (s.miscTags ?? []).includes("HL") || /regains? (a number of )?hit points/i.test(text),
    range: range?.type === "self" ? 0 : range?.type === "touch" ? 5 : range?.type === "feet" ? range.amount : range?.type === "miles" ? range.amount * 5280 : undefined,
    duration: s.duration?.[0]?.type === "instant" ? "Instantaneous" : s.duration?.[0]?.duration ? `${s.duration[0].duration.amount} ${s.duration[0].duration.type}` : s.duration?.[0]?.type ? cap(s.duration[0].type) : undefined,
    upcast: !!s.entriesHigherLevel,
  });
}

function abilityPicks5e(ability: any[] | undefined): string[] {
  const out = new Set<string>();
  for (const a of ability ?? []) {
    for (const [k, v] of Object.entries(a)) {
      if (k === "choose") out.add("Any (choice)");
      else if (typeof v === "number" && v > 0) out.add(abilityName(k));
    }
  }
  return [...out];
}

function raceFacets5eRaw(race: any, sub?: any): Facets | undefined {
  const r = { ...race, ...(sub ?? {}) };
  const speed = typeof r.speed === "number" ? { walk: r.speed } : r.speed ?? {};
  const fast = (v: any) => (v === true ? true : typeof v === "number" ? v > 0 : typeof v?.number === "number");
  const skills = [...(race.skillProficiencies ?? []), ...(sub?.skillProficiencies ?? [])].flatMap((x: any) => Object.keys(x).filter((k) => k !== "choose" && k !== "any"));
  return clean({
    abilityIncreases: race.lineage || sub?.lineage ? ["Any (choice)"] : abilityPicks5e([...(race.ability ?? []), ...(sub?.ability ?? [])]),
    size: (r.size ?? []).map((x: string) => SIZES[x] ?? x),
    speed: typeof speed.walk === "number" ? speed.walk : undefined,
    movement: ["fly", "swim", "climb", "burrow"].filter((k) => fast(speed[k])).map(cap),
    darkvision: r.darkvision ?? 0,
    resistances: [...(race.resist ?? []), ...(sub?.resist ?? [])].filter((x: any) => typeof x === "string").map(cap),
    skills: skills.map(cap),
    innateSpells: !!(race.additionalSpells || sub?.additionalSpells),
    actions: actionsIn(json([race.entries, sub?.entries])),
  });
}

function prereqKinds(prereqs: any[] | undefined): string[] {
  if (!prereqs?.length) return ["None"];
  const out = new Set<string>();
  for (const p of prereqs) {
    if (p.ability) out.add("Ability score");
    if (p.race) out.add("Race");
    if (p.spellcasting || p.spellcasting2020 || p.spellcastingFeature) out.add("Spellcasting");
    if (p.level) out.add("Level");
    if (p.proficiency) out.add("Proficiency");
    if (p.feat) out.add("Another feat");
    if (p.background) out.add("Background");
    if (p.other || p.otherSummary) out.add("Other");
  }
  return out.size ? [...out] : ["Other"];
}

function featFacets5eRaw(f: any): Facets | undefined {
  return clean({
    prerequisite: prereqKinds(f.prerequisite),
    abilityIncrease: abilityPicks5e(f.ability).length ? abilityPicks5e(f.ability) : ["None"],
    actions: actionsIn(json(f.entries)),
    grantsSpells: !!f.additionalSpells,
    damageTypes: damageTypesIn(json(f.entries)),
  });
}

function backgroundFacets5eRaw(b: any): Facets | undefined {
  const skills = (b.skillProficiencies ?? []).flatMap((x: any) => Object.keys(x).filter((k) => k !== "choose" && k !== "any"));
  const langs = (b.languageProficiencies ?? []).reduce((n: number, x: any) => n + Object.values(x).reduce((m: number, v: any) => m + (typeof v === "number" ? v : 1), 0), 0);
  return clean({
    skills: skills.map(cap),
    toolProficiency: !!b.toolProficiencies?.length,
    languages: langs,
    startingGold: (() => {
      const m = json(b.startingEquipment).match(/"value":\s*(\d+)/);
      return m ? Number(m[1]) / 100 : undefined;
    })(),
  });
}

function itemFacets5eRaw(it: any): Facets | undefined {
  const type = code(it.type);
  const bonus = Number(String(it.bonusWeapon ?? it.bonusAc ?? it.bonusSpellAttack ?? "").replace(/[^\d-]/g, "")) || undefined;
  return clean({
    category: ITEM_TYPES[type] ?? (it.wondrous ? "Wondrous item" : it.weapon ? "Weapon" : it.armor ? "Armor" : "Other"),
    rarity: it.rarity && it.rarity !== "none" && it.rarity !== "unknown" ? cap(it.rarity) : "Mundane",
    magic: !!(it.rarity && it.rarity !== "none"),
    attunement: !!it.reqAttune,
    cost: typeof it.value === "number" ? it.value / 100 : undefined,
    weight: typeof it.weight === "number" ? it.weight : undefined,
    ac: typeof it.ac === "number" ? it.ac : undefined,
    damage: it.dmg1,
    damageType: DMG[it.dmgType],
    properties: (it.property ?? []).map((p: any) => PROPS[code(p)] ?? code(p)),
    weaponCategory: it.weaponCategory ? cap(it.weaponCategory) : undefined,
    bonus,
    charges: typeof it.charges === "number" ? it.charges : undefined,
    stealthDisadvantage: it.stealth ? true : undefined,
    actions: actionsIn(json(it.entries)),
  });
}

const CASTER: Record<string, string> = { full: "Full caster", "1/2": "Half caster", "1/3": "Third caster", pact: "Pact magic", artificer: "Half caster" };

function classFacets5eRaw(c: any): Facets | undefined {
  return clean({
    hitDie: c.hd?.faces,
    caster: CASTER[c.casterProgression] ?? "None",
    saves: (c.proficiency ?? []).map(abilityName),
    spellAbility: c.spellcastingAbility ? abilityName(c.spellcastingAbility) : undefined,
  });
}

function subclassFacets5eRaw(sc: any): Facets | undefined {
  return clean({
    caster: CASTER[sc.casterProgression] ?? (sc.spellcastingAbility ? "Third caster" : "None"),
    grantsSpells: !!sc.additionalSpells,
  });
}

function optionalFeatureFacets5eRaw(o: any): Facets | undefined {
  const level = (o.prerequisite ?? []).map((p: any) => p.level?.level ?? p.level).find((x: any) => typeof x === "number");
  return clean({
    featureType: [...new Set((o.featureType ?? []).map((t: string) => FEATURE_TYPES[t] ?? t))] as string[],
    minLevel: level ?? 0,
    prerequisite: prereqKinds(o.prerequisite),
    actions: actionsIn(json(o.entries)),
  });
}

function monsterFacets5eRaw(m: any): Facets | undefined {
  const speed = m.speed ?? {};
  const num = (v: any) => (typeof v === "number" ? v : typeof v?.number === "number" ? v.number : 0);
  const list = (x: any[] | undefined) =>
    (x ?? []).flatMap((e: any) => (typeof e === "string" ? [e] : e.special ? [] : e.resist ?? e.immune ?? e.vulnerable ?? e.conditionImmune ?? [])).map(cap);
  const type = typeof m.type === "string" ? m.type : m.type?.type?.choose?.[0] ?? m.type?.type ?? "";
  const ac0 = m.ac?.[0];
  return clean({
    size: (m.size ?? []).map((s: string) => SIZES[s] ?? s),
    type: cap(type),
    ac: typeof ac0 === "number" ? ac0 : ac0?.ac,
    hp: m.hp?.average,
    speed: num(speed.walk),
    fly: num(speed.fly),
    swim: num(speed.swim),
    climb: num(speed.climb),
    burrow: num(speed.burrow),
    str: m.str, dex: m.dex, con: m.con, int: m.int, wis: m.wis, cha: m.cha,
    alignment: (m.alignment ?? []).map((a: any) => ({ L: "Lawful", N: "Neutral", C: "Chaotic", G: "Good", E: "Evil", U: "Unaligned", A: "Any" } as Record<string, string>)[a] ?? "").filter(Boolean),
    resistances: list(m.resist),
    immunities: list(m.immune),
    vulnerabilities: list(m.vulnerable),
    conditionImmunities: list(m.conditionImmune),
    senses: senseNames((m.senses ?? []).join(" ")),
    legendary: !!m.legendary,
    spellcaster: !!m.spellcasting,
    bonusActions: !!m.bonus?.length,
    reactions: !!m.reaction?.length,
    environment: (m.environment ?? []).map(cap),
    damageTypes: damageTypesIn(json(m.action)),
  });
}

// ---------------------------------------------------------------------------
// Open5e

function spellFacetsOpen5eRaw(x: any): Facets | undefined {
  const text = `${x.desc ?? ""} ${x.higher_level ?? ""}`;
  return clean({
    school: x.school ? cap(String(x.school)) : undefined,
    castingTime: castingTimeLabel(x.casting_time),
    concentration: x.requires_concentration ?? /yes/i.test(String(x.concentration ?? "")),
    ritual: x.can_be_cast_as_ritual ?? /yes/i.test(String(x.ritual ?? "")),
    components: String(x.components ?? "").split(/[,\s]+/).filter((c) => /^[VSM]$/.test(c)),
    costlyMaterial: /\d+\s*gp/i.test(x.material ?? ""),
    damageTypes: damageTypesIn(text),
    save: savesIn(text),
    attack: /melee spell attack/i.test(text) ? ["Melee"] : /ranged spell attack/i.test(text) ? ["Ranged"] : [],
    healing: /regains? (a number of )?hit points/i.test(text),
    range: rangeFeet(x.range),
    duration: x.duration ? cap(String(x.duration).replace(/^concentration, up to /i, "")) : undefined,
    upcast: !!x.higher_level,
  });
}

function raceFacetsOpen5eRaw(r: any, sub?: any): Facets | undefined {
  const asi = [...(r.asi ?? []), ...(sub?.asi ?? [])];
  const picks = new Set<string>();
  for (const a of asi) for (const attr of a.attributes ?? []) picks.add(/other|any/i.test(attr) ? "Any (choice)" : abilityName(attr));
  const speed = r.speed ?? {};
  const vision = `${r.vision ?? ""} ${sub?.traits ?? ""} ${r.traits ?? ""}`;
  const dv = vision.match(/darkvision[^.]*?(\d+)\s*f(ee)?t/i);
  return clean({
    abilityIncreases: [...picks],
    size: r.size_raw ? [cap(r.size_raw)] : undefined,
    speed: typeof speed.walk === "number" ? speed.walk : undefined,
    movement: ["fly", "swim", "climb", "burrow"].filter((k) => speed[k]).map(cap),
    darkvision: dv ? Number(dv[1]) : 0,
    actions: actionsIn(vision),
  });
}

function featFacetsOpen5eRaw(x: any): Facets | undefined {
  return clean({
    prerequisite: x.prerequisite ? ["Has prerequisite"] : ["None"],
    actions: actionsIn(`${x.desc ?? ""} ${(x.effects_desc ?? []).join(" ")}`),
  });
}

function backgroundFacetsOpen5eRaw(x: any): Facets | undefined {
  return clean({
    skills: String(x.skill_proficiencies ?? "").split(/,|\band\b/).map((s) => s.trim()).filter((s) => s && s.length < 25).map(cap),
    toolProficiency: !!x.tool_proficiencies,
  });
}

function magicItemFacetsOpen5eRaw(x: any): Facets | undefined {
  const type = String(x.type ?? "");
  return clean({
    category: /weapon/i.test(type) ? "Weapon" : /armor/i.test(type) ? "Armor" : cap(type.split(/[(,]/)[0].trim()) || "Other",
    rarity: x.rarity ? cap(String(x.rarity)) : undefined,
    magic: true,
    attunement: !!x.requires_attunement,
    bonus: Number(String(x.name).match(/^\+(\d)/)?.[1] ?? "") || undefined,
    actions: actionsIn(x.desc ?? ""),
  });
}

function weaponFacetsOpen5eRaw(x: any): Facets | undefined {
  return clean({
    category: /ranged/i.test(x.category ?? "") ? "Ranged weapon" : "Melee weapon",
    rarity: "Mundane",
    magic: false,
    weaponCategory: /martial/i.test(x.category ?? "") ? "Martial" : "Simple",
    cost: costGp(x.cost),
    weight: parseFloat(x.weight) || undefined,
    damage: x.damage_dice,
    damageType: x.damage_type ? cap(x.damage_type) : undefined,
    properties: (x.properties ?? []).map((p: string) => cap(p.split(/[ (]/)[0])),
  });
}

function armorFacetsOpen5eRaw(x: any): Facets | undefined {
  return clean({
    category: /shield/i.test(x.category ?? x.name) ? "Shield" : `${cap(String(x.category ?? "").replace(/ armor/i, ""))} armor`,
    rarity: "Mundane",
    magic: false,
    cost: costGp(x.cost),
    weight: parseFloat(x.weight) || undefined,
    ac: x.base_ac ?? x.ac_base,
    stealthDisadvantage: x.stealth_disadvantage || undefined,
  });
}

function monsterFacetsOpen5eRaw(m: any): Facets | undefined {
  const speed = m.speed ?? {};
  return clean({
    size: m.size ? [cap(m.size)] : undefined,
    type: m.type ? cap(m.type) : undefined,
    ac: m.armor_class,
    hp: m.hit_points,
    speed: speed.walk ?? 0,
    fly: speed.fly ?? 0,
    swim: speed.swim ?? 0,
    climb: speed.climb ?? 0,
    burrow: speed.burrow ?? 0,
    str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma,
    alignment: String(m.alignment ?? "").split(/\s+/).filter((w) => /^(lawful|neutral|chaotic|good|evil|unaligned|any)$/i.test(w)).map(cap),
    resistances: splitList(m.damage_resistances),
    immunities: splitList(m.damage_immunities),
    vulnerabilities: splitList(m.damage_vulnerabilities),
    conditionImmunities: splitList(m.condition_immunities),
    senses: senseNames(m.senses),
    legendary: !!m.legendary_actions?.length,
    spellcaster: !!m.spell_list?.length || (m.special_abilities ?? []).some((s: any) => /spellcasting/i.test(s.name)),
    bonusActions: !!m.bonus_actions?.length,
    reactions: !!m.reactions?.length,
    environment: (m.environments ?? []).map(cap),
    damageTypes: damageTypesIn((m.actions ?? []).map((a: any) => a.desc).join(" ")),
  });
}

// ---------------------------------------------------------------------------
// SRD (GraphQL)

function spellFacetsSrdRaw(s: any): Facets | undefined {
  return clean({
    school: s.school?.name,
    castingTime: castingTimeLabel(s.casting_time),
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    components: s.components ?? [],
    costlyMaterial: /\d+\s*gp/i.test(s.material ?? ""),
    damageTypes: (Array.isArray(s.damage) ? s.damage : s.damage ? [s.damage] : []).map((d: any) => d?.damage_type?.name).filter(Boolean),
    save: s.dc?.dc_type?.name ? [abilityName(s.dc.dc_type.name)] : [],
    attack: s.attack_type ? [cap(s.attack_type)] : [],
    healing: !!s.heal_at_slot_level,
    range: rangeFeet(s.range),
    duration: s.duration,
  });
}

function raceFacetsSrdRaw(r: any, sub?: any): Facets | undefined {
  const bonuses = [...(r.ability_bonuses ?? []), ...(sub?.ability_bonuses ?? [])];
  return clean({
    abilityIncreases: bonuses.map((b: any) => abilityName(b.ability_score.index)),
    size: r.size ? [r.size] : undefined,
    speed: r.speed,
  });
}

function monsterFacetsSrdRaw(m: any): Facets | undefined {
  const ft = (v: any) => parseInt(String(v ?? ""), 10) || 0;
  return clean({
    size: m.size ? [m.size] : undefined,
    type: m.type ? cap(m.type) : undefined,
    ac: m.armor_class?.[0]?.value,
    hp: m.hit_points,
    speed: ft(m.speed?.walk),
    fly: ft(m.speed?.fly),
    swim: ft(m.speed?.swim),
    climb: ft(m.speed?.climb),
    burrow: ft(m.speed?.burrow),
    str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma,
    alignment: String(m.alignment ?? "").split(/\s+/).filter((w) => /^(lawful|neutral|chaotic|good|evil|unaligned|any)$/i.test(w)).map(cap),
    resistances: (m.damage_resistances ?? []).map(cap),
    immunities: (m.damage_immunities ?? []).map(cap),
    conditionImmunities: (m.condition_immunities ?? []).map((c: any) => c.name),
    senses: Object.entries(m.senses ?? {}).filter(([k, v]) => v && k !== "passive_perception").map(([k]) => cap(k)),
    legendary: !!m.legendary_actions?.length,
  });
}

// One odd entry must never break a whole list: on error it just has no filter values.
const safe = <A extends unknown[]>(fn: (...a: A) => Facets | undefined) => (...a: A): Facets | undefined => {
  try {
    return fn(...a);
  } catch {
    return undefined;
  }
};
export const spellFacets5e = safe(spellFacets5eRaw);
export const raceFacets5e = safe(raceFacets5eRaw);
export const featFacets5e = safe(featFacets5eRaw);
export const backgroundFacets5e = safe(backgroundFacets5eRaw);
export const itemFacets5e = safe(itemFacets5eRaw);
export const classFacets5e = safe(classFacets5eRaw);
export const subclassFacets5e = safe(subclassFacets5eRaw);
export const optionalFeatureFacets5e = safe(optionalFeatureFacets5eRaw);
export const monsterFacets5e = safe(monsterFacets5eRaw);
export const spellFacetsOpen5e = safe(spellFacetsOpen5eRaw);
export const raceFacetsOpen5e = safe(raceFacetsOpen5eRaw);
export const featFacetsOpen5e = safe(featFacetsOpen5eRaw);
export const backgroundFacetsOpen5e = safe(backgroundFacetsOpen5eRaw);
export const magicItemFacetsOpen5e = safe(magicItemFacetsOpen5eRaw);
export const weaponFacetsOpen5e = safe(weaponFacetsOpen5eRaw);
export const armorFacetsOpen5e = safe(armorFacetsOpen5eRaw);
export const monsterFacetsOpen5e = safe(monsterFacetsOpen5eRaw);
export const spellFacetsSrd = safe(spellFacetsSrdRaw);
export const raceFacetsSrd = safe(raceFacetsSrdRaw);
export const monsterFacetsSrd = safe(monsterFacetsSrdRaw);
