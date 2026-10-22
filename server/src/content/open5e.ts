import { cachedFetch } from "./http.js";
import { pool } from "../db.js";
import { diceFromText } from "./spellDice.js";
import {
  armorFacetsOpen5e, backgroundFacetsOpen5e, featFacetsOpen5e, magicItemFacetsOpen5e, raceFacetsOpen5e, spellFacetsOpen5e, abilityTextOpen5e, weaponFacetsOpen5e,
} from "./facets.js";
import {
  ABILITIES, SKILL_KEYS, skillName, toSkillKey,
  type Ability, type Choice, type ContentDetail, type ContentSummary, type ContentType, type Effect, type ExpandedSpell, type ItemData,
} from "./types.js";

/**
 * Open5e (api.open5e.com): free OGL content from Kobold Press (Deep Magic, Tome of Heroes,
 * Vault of Magic, Warlock Archives), EN Publishing (Level Up A5E), Green Ronin (Tal'Dorei) and
 * Open5e originals. Each endpoint is fetched once on demand and then served from the Postgres cache.
 */
const BASE = (process.env.OPEN5E_API_URL ?? "https://api.open5e.com") + "/v1";
const all = <T = any>(endpoint: string) =>
  cachedFetch<{ results: T[] }>(`${BASE}/${endpoint}/?limit=5000`).then((r) => r.results);

/** Which Open5e documents (books) are hidden. The SRD copy is hidden by default: the SRD provider covers it. */
export async function excludedDocuments(): Promise<string[]> {
  const { rows } = await pool.query<{ value: string[] }>("SELECT value FROM settings WHERE key = 'open5eExcluded'");
  return rows[0]?.value ?? ["wotc-srd"];
}

export async function setExcludedDocuments(excluded: string[]) {
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('open5eExcluded', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(excluded)],
  );
}

/**
 * Books that only exist in Open5e's v2 API (v1 mirrors the rest). Fetched from v2 and shaped
 * like v1 so the rest of the adapter is shared.
 */
const V2_ONLY: { key: string; title: string; organization: string; types: ("spells" | "backgrounds")[] }[] = [
  { key: "spells-that-dont-suck", title: "Spells That Don't Suck", organization: "Open5e community", types: ["spells"] },
];
/** Open5e documents written for another ruleset: Level Up A5E and its Monstrous Menagerie. */
export const NOT_2014 = /^(a5e|menagerie)/;

const V2_BASE = (process.env.OPEN5E_API_URL ?? "https://api.open5e.com") + "/v2";

async function v2(endpoint: "spells" | "backgrounds"): Promise<any[]> {
  const docs = V2_ONLY.filter((d) => d.types.includes(endpoint));
  const pages = await Promise.all(
    docs.map((d) =>
      cachedFetch<{ results: any[] }>(`${V2_BASE}/${endpoint}/?document__key=${d.key}&limit=1000`)
        .then((r) => r.results.map((x) => ({ ...x, document__slug: d.key, document__title: d.title })))
        .catch(() => []),
    ),
  );
  return pages.flat().map((x) => (endpoint === "spells" ? v2Spell(x) : v2Background(x)));
}

/** v2 spell → v1 shape. */
function v2Spell(x: any) {
  return {
    ...x,
    slug: `v2:${x.key}`,
    level_int: x.level,
    spell_lists: (x.classes ?? []).map((c: any) => c.name.toLowerCase()),
    school: x.school?.name?.toLowerCase(),
    casting_time: x.casting_time === "action" ? "1 action" : x.casting_time === "bonus_action" ? "1 bonus action" : x.casting_time === "reaction" ? `1 reaction${x.reaction_condition ? `, ${x.reaction_condition}` : ""}` : x.casting_time,
    range: x.range_text,
    components: [x.verbal && "V", x.somatic && "S", x.material && "M"].filter(Boolean).join(", "),
    material: x.material_specified,
    requires_concentration: x.concentration,
    can_be_cast_as_ritual: x.ritual,
  };
}

/** v2 background (list of "benefits") → v1 shape. */
function v2Background(x: any) {
  const benefit = (type: string) => x.benefits?.find((b: any) => b.type === type)?.desc ?? "";
  const feature = x.benefits?.find((b: any) => b.type === "feature");
  return {
    ...x,
    slug: `v2:${x.key}`,
    desc: x.desc ?? "",
    skill_proficiencies: benefit("skill_proficiency"),
    tool_proficiencies: benefit("tool_proficiency"),
    languages: benefit("language"),
    equipment: benefit("equipment"),
    feature: feature?.name,
    feature_desc: feature?.desc,
    suggested_characteristics: benefit("suggested_characteristics") || benefit("connection_and_memento"),
  };
}

/** v1 endpoint plus any v2-only books for it. */
async function allWithV2(endpoint: "spells" | "backgrounds") {
  const [v1, extra] = await Promise.all([all(endpoint), v2(endpoint)]);
  return [...v1, ...extra];
}

export const listDocuments = () =>
  all<any>("documents").then((docs) => [
    ...docs.map((d) => ({ slug: d.slug, title: d.title, organization: d.organization })),
    ...V2_ONLY.map((d) => ({ slug: d.key, title: d.title, organization: d.organization })),
  ]);

/** Open5e markdown uses ***bold italic*** headings; the client renders **bold**. */
const md = (s?: string) => (s ?? "").replace(/\*\*\*(.+?)\*\*\*/g, "**$1**").replace(/\r/g, "");

const summary = (type: ContentType, x: any, key: string, extra: Partial<ContentSummary> = {}): ContentSummary => ({
  source: "open5e", key, type, name: x.name, sourceLabel: x.document__title, ...extra,
});

const ABILITY_BY_NAME: Record<string, Ability> = {
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
};

// ---------------------------------------------------------------------------
// Listing

export async function listOpen5e(type: ContentType, opts: { cls?: string }): Promise<ContentSummary[]> {
  const excluded = new Set(await excludedDocuments());
  // Level Up Advanced 5e (A5E) is a different ruleset (new skills, maneuvers, exploration rules), not 2014 5e.
  const keep = (x: any) => !excluded.has(x.document__slug) && !NOT_2014.test(x.document__slug ?? "");
  switch (type) {
    case "spell":
      return (await allWithV2("spells"))
        .filter(keep)
        .map((x) => ({ x, classes: (x.spell_lists ?? []).map((c: string) => c.toLowerCase()) }))
        .filter(({ classes }) => !opts.cls || classes.includes(opts.cls))
        .map(({ x, classes }) => summary(type, x, x.slug, { level: x.level_int, classes, facets: spellFacetsOpen5e(x) }));
    case "feat":
      return (await all("feats")).filter(keep).map((x) => summary(type, x, x.slug, { facets: featFacetsOpen5e(x) }));
    case "background":
      return (await allWithV2("backgrounds")).filter(keep).map((x) => summary(type, x, x.slug, { facets: backgroundFacetsOpen5e(x) }));
    case "race":
      return (await all("races")).filter(keep).flatMap((r) =>
        r.subraces?.length
          ? r.subraces.map((s: any) => summary(type, { ...r, name: `${r.name} (${s.name})` }, `${r.slug}/${s.slug}`, { facets: raceFacetsOpen5e(r, s), abilities: abilityTextOpen5e(r, s) }))
          : [summary(type, r, r.slug, { facets: raceFacetsOpen5e(r), abilities: abilityTextOpen5e(r) })],
      );
    case "item": {
      const [magic, weapons, armor] = await Promise.all([all("magicitems"), all("weapons"), all("armor")]);
      return [
        ...magic.filter(keep).map((x) => summary(type, x, `magic/${x.slug}`, { facets: magicItemFacetsOpen5e(x) })),
        ...weapons.filter(keep).map((x) => summary(type, x, `weapon/${x.slug}`, { facets: weaponFacetsOpen5e(x) })),
        ...armor.filter(keep).map((x) => summary(type, x, `armor/${x.slug}`, { facets: armorFacetsOpen5e(x) })),
      ];
    }
    case "subclass": {
      const classes = await all("classes");
      return classes
        .filter((c) => !opts.cls || c.slug === opts.cls || c.name.toLowerCase() === opts.cls)
        .flatMap((c) =>
          (c.archetypes ?? [])
            .filter(keep)
            .map((a: any) => summary(type, a, `${c.slug}/${a.slug}`, { classes: [c.name.toLowerCase()] })),
        );
    }
    default:
      return [];
  }
}

/** "*Wisdom 13 or higher*" → "Wisdom 13 or higher"; "N/A" → none. */
export const openPrerequisite = (p?: string) => {
  const t = (p ?? "").replace(/^Prerequisite:\s*/i, "").replace(/\*/g, "").trim();
  return t && !/^(n\/a|none)$/i.test(t) ? t : undefined;
};

const ABILITY_KEYS: Record<string, Ability> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

/** "Increase your Constitution score by 1" (fixed) or "your Strength or Dexterity score by 1" (a choice). */
function featAbility(text: string): Pick<ContentDetail, "effects" | "choices"> {
  const m = text.match(/increase your ((?:strength|dexterity|constitution|intelligence|wisdom|charisma)(?:,? (?:or )?(?:strength|dexterity|constitution|intelligence|wisdom|charisma))*) score by (\d)/i);
  if (!m) return {};
  const abilities = [...m[1].matchAll(/strength|dexterity|constitution|intelligence|wisdom|charisma/gi)].map((x) => ABILITY_KEYS[x[0].toLowerCase()]);
  const amount = Number(m[2]);
  if (abilities.length === 1) return { effects: [{ kind: "ability", ability: abilities[0], amount }] };
  return { choices: [{ id: "ability", kind: "ability", count: 1, amount, label: `Increase one ability score by ${amount}`, options: abilities.map((a) => ({ key: a, name: a.toUpperCase() })) }] };
}

// ---------------------------------------------------------------------------
// Detail

export async function getOpen5e(type: ContentType, key: string): Promise<ContentDetail | undefined> {
  switch (type) {
    case "spell": {
      const x = (await allWithV2("spells")).find((s) => s.slug === key);
      return x && spellDetail(x);
    }
    case "feat": {
      const f = (await all("feats")).find((x) => x.slug === key);
      if (!f) return undefined;
      const lines: string[] = (f.effects_desc ?? []).map((e: string) => md(e).replace(/^\s*[*-]\s*/, ""));
      return {
        ...summary(type, f, f.slug),
        prerequisite: openPrerequisite(f.prerequisite),
        description: [md(f.desc), ...lines.map((e) => `- ${e}`)].filter(Boolean).join("\n\n"),
        meta: {},
        ...featAbility(lines.join(" ")),
      };
    }
    case "background": {
      const b = (await allWithV2("backgrounds")).find((x) => x.slug === key);
      return b && backgroundDetail(b);
    }
    case "race": {
      const [raceSlug, subSlug] = key.split("/");
      const r = (await all("races")).find((x) => x.slug === raceSlug);
      return r && raceDetail(r, r.subraces?.find((s: any) => s.slug === subSlug), key);
    }
    case "item":
      return itemDetail(key);
    case "subclass": {
      const found = await findArchetype(key);
      return found && {
        ...summary(type, found.arch, key, { classes: [found.cls.name.toLowerCase()] }),
        description: archetypeSections(found.arch.desc).intro,
        meta: {},
      };
    }
    case "feature": {
      // Archetype features: "<class>/<archetype>#<section index>"
      const [archKey, idx] = key.split("#");
      const found = await findArchetype(archKey);
      const section = found && archetypeSections(found.arch.desc).sections[Number(idx)];
      return section && {
        source: "open5e", key, type, name: section.name, sourceLabel: found!.arch.document__title,
        description: section.body, meta: {},
      };
    }
    default:
      return undefined;
  }
}

function spellDetail(x: any): ContentDetail {
  const conc = x.requires_concentration || x.concentration === "yes";
  return {
    ...summary("spell", x, x.slug, { level: x.level_int, classes: (x.spell_lists ?? []).map((c: string) => c.toLowerCase()) }),
    description: md(x.desc) + (x.higher_level ? `\n\n**At Higher Levels.** ${md(x.higher_level)}` : ""),
    meta: {
      Level: x.level_int === 0 ? "Cantrip" : String(x.level_int),
      School: x.school ? x.school[0].toUpperCase() + x.school.slice(1) : "",
      "Casting Time": x.casting_time,
      Range: x.range,
      Components: x.components + (x.material ? ` (${x.material})` : ""),
      Duration: (conc && !/concentration/i.test(x.duration) ? "Concentration, " : "") + x.duration,
    },
    spell: {
      school: x.school ? x.school[0].toUpperCase() + x.school.slice(1) : undefined,
      ritual: x.can_be_cast_as_ritual || x.ritual === "yes",
      concentration: conc,
      dice: diceFromText(x.desc ?? "", x.higher_level ?? ""),
    },
  };
}

function asiEffects(asi: any[] | undefined, effects: Effect[], choices: Choice[], desc = "") {
  const plainDesc = desc.replace(/\*/g, "");
  // "Your Strength or Dexterity score increases by 1" is one pick, though the data lists both.
  const either = plainDesc.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma) or (strength|dexterity|constitution|intelligence|wisdom|charisma) score increases by (\d)/i);
  const eitherAbilities = either ? [either[1], either[2]].map((n) => ABILITY_BY_NAME[n.toLowerCase()]) : [];
  if (either) choices.push({ id: "asi-either", kind: "ability", count: 1, amount: Number(either[3]), label: `Increase ${either[1]} or ${either[2]} by ${either[3]}`, options: eitherAbilities.map((k) => ({ key: k, name: k.toUpperCase() })) });
  const anyByValue = new Map<number, number>();
  for (const a of asi ?? []) {
    const known = (a.attributes ?? []).map((n: string) => ABILITY_BY_NAME[n.toLowerCase()]).filter(Boolean) as Ability[];
    if (known.length === 1 && eitherAbilities.includes(known[0]) && a.value === Number(either?.[3])) continue;
    if (known.length === 1 && (a.attributes ?? []).length === 1) effects.push({ kind: "ability", ability: known[0], amount: a.value });
    else if ((a.attributes ?? []).length) anyByValue.set(a.value, (anyByValue.get(a.value) ?? 0) + 1);
  }
  // "Two different ability scores of your choice increase by 1": one choice of two different scores.
  for (const [value, count] of anyByValue) {
    choices.push({
      id: `asi-${choices.length}`, kind: "ability", count, amount: value,
      label: `Increase ${count > 1 ? `${count} different ability scores` : "one ability score"} by ${value}`,
      options: ABILITIES.map((k) => ({ key: k, name: k.toUpperCase() })),
    });
  }
}

function raceDetail(r: any, sub: any | undefined, key: string): ContentDetail {
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  asiEffects([...(r.asi ?? []), ...(sub?.asi ?? [])], effects, choices, `${r.asi_desc ?? ""} ${sub?.asi_desc ?? ""}`);
  if (r.speed?.walk) effects.push({ kind: "speed", amount: r.speed.walk });
  const traits = `${md(r.traits)}\n\n${md(sub?.traits)}`;
  // "proficiency in the Perception skill", "in the Perception and Stealth skills".
  for (const m of traits.matchAll(/proficiency in the (\w+(?: \w+)?)(?: and (?:the )?(\w+(?: \w+)?))? skills?/gi)) {
    for (const n of [m[1], m[2]].filter(Boolean)) {
      const k = toSkillKey(n);
      if (SKILL_KEYS.includes(k)) effects.push({ kind: "skill", skill: k });
    }
  }
  const darkvision = `${md(r.vision)} ${traits}`.replace(/\*/g, "").match(/darkvision[\s\S]{0,300}?(\d+) feet/i);
  return {
    source: "open5e", key, type: "race", name: sub ? `${r.name} (${sub.name})` : r.name, sourceLabel: r.document__title,
    description: [md(r.desc), md(r.vision), traits, md(sub?.desc)].filter((s) => s?.trim()).join("\n\n"),
    meta: Object.fromEntries(Object.entries({
      Speed: r.speed?.walk ? `${r.speed.walk} ft` : undefined,
      Size: r.size_raw ?? undefined,
      Darkvision: darkvision ? `${darkvision[1]} ft` : undefined,
    }).filter(([, v]) => v)) as Record<string, string>,
    effects: [...effects, ...(r.languages ? [{ kind: "proficiency" as const, value: `Languages: ${md(r.languages).replace(/\*\*[^*]+\*\*\s*/g, "")}` }] : [])],
    choices,
  };
}

/** Rows of markdown tables whose header mentions the label ("Personality Trait", "Ideal"…). */
function tableRows(markdown: string, label: RegExp): string[] {
  const out: string[] = [];
  for (const table of markdown.split(/\n\s*\n/)) {
    const lines = table.trim().split("\n").filter((l) => l.trim().startsWith("|"));
    if (lines.length < 3 || !label.test(lines[0])) continue;
    for (const line of lines.slice(2)) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells[1]) out.push(cells[1]);
    }
  }
  return out;
}

const NUM_WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };

/**
 * Skill text from Open5e: "History, Insight", "Deception, and either Culture, Insight, or Sleight of Hand",
 * "Insight plus one of your choice from among …", "choice of two from among Arcana, History, and Persuasion",
 * "Two of your choice." → fixed skills and a choice.
 */
export function skillsFromText(raw: string, id = "skills"): { effects: Effect[]; choices: Choice[] } {
  const text = raw.replace(/[.*]+\s*$/g, "").trim();
  const effects: Effect[] = [];
  const choices: Choice[] = [];
  const keysIn = (t: string) => SKILL_KEYS.filter((k) => new RegExp(`\\b${k.replace(/-/g, "[ -]")}\\b`, "i").test(t));
  const m =
    text.match(/^(.*?)(?:,?\s*(?:and|plus)\s+)?(?:either|(one|two|three) (?:other )?(?:skill )?of your choice(?: from among| from)?|(?:a )?choice of (one|two|three)(?: from among| from)?)\s*:?\s*(.*)$/i);
  if (m) {
    const fixed = keysIn(m[1]);
    for (const k of fixed) effects.push({ kind: "skill", skill: k });
    const count = NUM_WORD[(m[2] ?? m[3] ?? "one").toLowerCase()] ?? 1;
    const from = keysIn(m[4]).filter((k) => !fixed.includes(k));
    choices.push({ id, kind: "skill", count, label: `Choose ${count} skill proficienc${count > 1 ? "ies" : "y"}`, options: (from.length ? from : SKILL_KEYS).map((k) => ({ key: k, name: skillName(k) })) });
  } else {
    for (const k of keysIn(text)) effects.push({ kind: "skill", skill: k });
  }
  return { effects, choices };
}

const isNone = (v?: string) => !v || /^\W*(none|no additional|n\/a)/i.test(v.trim());

/** Split an equipment sentence on commas outside parentheses and numbers ("1,000 ball bearings"); pull out coins. */
export function equipmentFromText(text: string): { name: string; qty: number }[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0 && !(/\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? ""))) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const out: { name: string; qty: number }[] = [];
  for (let p of parts.flatMap((x) => x.split(/^\s*and\s+|\s+and\s+(?![^(]*\))/))) {
    p = p.replace(/^\s*(?:and\s+)?/, "").replace(/[.\s]+$/, "").trim();
    if (!p) continue;
    const coins = p.match(/(\d+)\s*(gp|sp|cp)\b/i);
    if (coins) {
      out.push({ name: `${coins[1]} ${coins[2].toLowerCase()}`, qty: 1 });
      p = p.replace(/\s*(?:containing|with)\s*\d+\s*(?:gp|sp|cp)\b/i, "").replace(/^\d+\s*(?:gp|sp|cp)$/i, "").trim();
      if (!p) continue;
    }
    const qty = p.match(/^(\d+)\s+(.*)$/);
    out.push(qty ? { name: qty[2], qty: Number(qty[1]) } : { name: p.replace(/^(a|an|one)\s+/i, ""), qty: 1 });
  }
  return out;
}

function backgroundDetail(b: any): ContentDetail {
  const { effects, choices } = skillsFromText(b.skill_proficiencies ?? "");
  if (!isNone(b.tool_proficiencies)) effects.push({ kind: "proficiency", value: `Tools: ${b.tool_proficiencies.replace(/\.$/, "")}` });
  if (!isNone(b.languages)) effects.push({ kind: "proficiency", value: `Languages: ${b.languages.replace(/\.$/, "")}` });
  const sc = b.suggested_characteristics ?? "";
  return {
    source: "open5e", key: b.slug, type: "background", name: b.name, sourceLabel: b.document__title,
    description: [md(b.desc), b.feature && `**${b.feature}.** ${md(b.feature_desc)}`].filter(Boolean).join("\n\n"),
    meta: Object.fromEntries(Object.entries({ "Skill Proficiencies": b.skill_proficiencies, Equipment: b.equipment }).filter(([, v]) => v)),
    effects,
    choices,
    suggestions: {
      traits: tableRows(sc, /personality/i),
      ideals: tableRows(sc, /ideal/i),
      bonds: tableRows(sc, /bond/i),
      flaws: tableRows(sc, /flaw/i),
    },
    startingEquipment: b.equipment ? [{ label: "Included", options: [{ label: "Included", items: equipmentFromText(b.equipment) }] }] : [],
  };
}

/** Open5e magic items have no structured bonuses; read the common phrasings. */
function bonusesFromText(text: string): ItemData["bonuses"] {
  const b: NonNullable<ItemData["bonuses"]> = {};
  const weapon = text.match(/\+(\d) bonus to attack and damage rolls/i);
  if (weapon) b.weaponAttack = b.weaponDamage = Number(weapon[1]);
  const ac = text.match(/\+(\d) bonus to (?:AC|Armor Class)/i);
  if (ac) b.ac = Number(ac[1]);
  const save = text.match(/\+(\d) bonus to (?:AC and )?saving throws/i) ?? text.match(/bonus to AC and saving throws[^.]*?\+(\d)/i);
  if (save) b.save = Number(save[1]);
  const spell = text.match(/\+(\d) bonus to spell attack rolls/i);
  if (spell) b.spellAttack = Number(spell[1]);
  const dc = text.match(/\+(\d) bonus to (?:your )?spell save DC/i) ?? text.match(/spell attack rolls and (?:your )?spell save DC/i);
  if (dc) b.spellDc = Number(dc[1] ?? b.spellAttack);
  const set = text.match(/your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score (?:changes to|is|becomes) (\d+)/i);
  if (set) b.abilitySet = { [ABILITY_BY_NAME[set[1].toLowerCase()]]: Number(set[2]) };
  return Object.keys(b).length ? b : undefined;
}

const lb = (w?: string) => parseFloat(String(w ?? "").replace(/[^\d.]/g, "")) || undefined;

async function itemDetail(key: string): Promise<ContentDetail | undefined> {
  const [kind, slug] = key.split("/");
  if (kind === "magic") {
    const x = (await all("magicitems")).find((i) => i.slug === slug);
    return x && {
      ...summary("item", x, key),
      description: md(x.desc),
      meta: Object.fromEntries(Object.entries({ Category: x.type, Rarity: x.rarity, Attunement: x.requires_attunement || undefined }).filter(([, v]) => v)) as Record<string, string>,
      item: { attunement: !!x.requires_attunement, rarity: x.rarity, bonuses: bonusesFromText(x.desc ?? "") },
    };
  }
  if (kind === "weapon") {
    const x = (await all("weapons")).find((i) => i.slug === slug);
    if (!x) return undefined;
    const props: string[] = x.properties ?? [];
    const item: ItemData = {
      weight: lb(x.weight),
      weapon: {
        damage: x.damage_dice, damageType: x.damage_type, properties: props,
        ranged: /ranged/i.test(x.category), finesse: props.some((p) => /finesse/i.test(p)),
        versatile: props.map((p) => p.match(/versatile \((\d+d\d+)\)/i)?.[1]).find(Boolean),
        category: x.category,
      },
    };
    return { ...summary("item", x, key), description: "", meta: { Category: x.category, Cost: x.cost, Damage: `${x.damage_dice} ${x.damage_type}`, Properties: props.join(", ") }, item };
  }
  if (kind === "armor") {
    const x = (await all("armor")).find((i) => i.slug === slug);
    if (!x) return undefined;
    const type = /shield/i.test(x.category) ? "shield" : /heavy/i.test(x.category) ? "heavy" : /medium/i.test(x.category) ? "medium" : "light";
    return {
      ...summary("item", x, key),
      description: "",
      meta: { Category: x.category, AC: x.ac_string, Cost: x.cost },
      item: { weight: lb(x.weight), armor: { base: type === "shield" ? x.base_ac || 2 : x.base_ac, type, stealthDisadvantage: x.stealth_disadvantage, strength: x.strength_requirement || undefined } },
    };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Archetypes (subclasses) are a markdown document; sections become features.

async function findArchetype(key: string) {
  const [classSlug, archSlug] = key.split("/");
  const cls = (await all("classes")).find((c) => c.slug === classSlug);
  const arch = cls?.archetypes?.find((a: any) => a.slug === archSlug);
  return arch ? { cls, arch } : undefined;
}

const ORDINAL_LEVEL = /(?:at|starting at|beginning at|when you reach|by|from) (\d+)(?:st|nd|rd|th) level/i;

export function archetypeSections(desc: string) {
  const text = md(desc);
  const parts = text.split(/^#{3,6}\s+(.+)$/m);
  const sections: { name: string; body: string; level: number | null }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1]?.trim() ?? "";
    const m = body.match(ORDINAL_LEVEL);
    sections.push({ name: parts[i].trim(), body, level: m ? Number(m[1]) : null });
  }
  return { intro: parts[0].trim(), sections };
}

/** Subclass levels for an Open5e archetype, plus any "Expanded Spells" table. */
export async function archetypeRules(key: string, subclassLevel: number, resolveSpell: (name: string) => Promise<ExpandedSpell["spell"] | undefined>) {
  const found = await findArchetype(key);
  if (!found) return null;
  const { sections } = archetypeSections(found.arch.desc);
  // Sections without a stated level belong to the level the subclass is chosen at.
  const levelOf = (s: (typeof sections)[number]) => s.level ?? subclassLevel;
  const expanded: ExpandedSpell[] = [];
  const isWarlock = found.cls.slug === "warlock";
  for (const table of md(found.arch.desc).split(/\n\s*\n/)) {
    const lines = table.trim().split("\n").filter((l) => l.trim().startsWith("|"));
    if (lines.length < 3 || !/spells?/i.test(lines[0])) continue;
    for (const line of lines.slice(2)) {
      const [lvl, names] = line.split("|").map((c) => c.trim()).filter(Boolean);
      const n = parseInt(lvl, 10);
      if (!n || !names) continue;
      for (const name of names.split(",").map((s) => s.replace(/\*/g, "").trim()).filter(Boolean)) {
        const spell = await resolveSpell(name);
        // Warlock tables list spell levels; others list class levels.
        if (spell) expanded.push({ spellLevel: isWarlock ? n : Math.ceil(n / 2), spell });
      }
    }
  }
  return {
    spellcastingAbility: null,
    casterType: null,
    spellModel: null,
    grantedSpells: [],
    expandedSpells: isWarlock ? expanded : [],
    levels: Array.from({ length: 20 }, (_, i) => ({
      level: i + 1,
      features: sections
        .map((s, idx) => ({ s, idx }))
        .filter(({ s }) => levelOf(s) === i + 1)
        .map(({ s, idx }) => ({ source: "open5e" as const, key: `${key}#${idx}`, name: s.name })),
      progressions: [],
      spellcasting: null,
    })),
  };
}

// Back-compat for the earlier feat-only adapter.
export const listOpen5eFeats = () => listOpen5e("feat", {});
export const getOpen5eFeat = (key: string) => getOpen5e("feat", key);
