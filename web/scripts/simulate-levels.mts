/**
 * Simulates a level 1 → 20 build for every 2014 class and subclass with the app's own level-up code
 * (components/levelup/levelUp.ts), against a running API, and checks the results against the PHB
 * tables and the raw 5etools feature lists.
 *
 *   npx tsx scripts/simulate-levels.mts [class name filter] [--out report.json]
 *
 * Needs the API on http://localhost:4000 (or API_URL). Picks are automatic: the first allowed options,
 * +2 CON at every ASI, average HP, ability scores of 14.
 */
import { writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:4000";
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  realFetch(typeof input === "string" && input.startsWith("/") ? API + input : input, init)) as typeof fetch;

const { api } = await import("../src/lib/api.ts");
const { newCharacter } = await import("../src/lib/defaults.ts");
const { planLevel } = await import("../src/components/levelup/plan.ts");
const { applyLevelUp, hpGainFor, newFeaturesFor, prepareLevelUp } = await import("../src/components/levelup/levelUp.ts");
const { classResources } = await import("../src/lib/resources.ts");
const { attacksPerAction, featureKind } = await import("../src/lib/economy.ts");
const { maxPrepared, profBonus, totalLevel, hpMax } = await import("../src/lib/rules.ts");
const { prereqContext, unmetRequirement } = await import("../src/lib/prereqs.ts");
const { withRequired } = await import("../src/lib/apply.ts");
const { featureDuration } = await import("../src/lib/featureDuration.ts");
const { effectiveScore } = await import("../src/lib/modifiers.ts");
import type { Character, ClassRules, ContentSummary, Selections, SubclassRules } from "../src/lib/types.ts";

type Issue = { cls: string; sub: string; level: number; what: string };
const issues: Issue[] = [];
const featureLog: { cls: string; sub: string; level: number; name: string; kind?: string; uses?: string; duration?: string }[] = [];

// ---------------------------------------------------------------------------
// Expected values (PHB 2014 / TCE tables), written independently of the app.

const FULL = [[2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const HALF = [[], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]];
const ARTIFICER = [[2], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]];
const THIRD = [[], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1]];
const PACT_COUNT = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
const PACT_LEVEL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
const tier = (lvl: number, t: [number, number][]) => t.filter(([l]) => lvl >= l).pop()?.[1] ?? 0;

const CANTRIPS: Record<string, [number, number][]> = {
  bard: [[1, 2], [4, 3], [10, 4]], cleric: [[1, 3], [4, 4], [10, 5]], druid: [[1, 2], [4, 3], [10, 4]], sorcerer: [[1, 4], [4, 5], [10, 6]],
  warlock: [[1, 2], [4, 3], [10, 4]], wizard: [[1, 3], [4, 4], [10, 5]], artificer: [[1, 2], [10, 3], [14, 4]],
  "eldritch knight": [[3, 2], [10, 3]], "arcane trickster": [[3, 3], [10, 4]],
};
const KNOWN: Record<string, number[]> = {
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  "eldritch knight": [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
  "arcane trickster": [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
};
const HIT_DIE: Record<string, number> = { barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8, paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6, artificer: 8 };
const ASI_LEVELS: Record<string, number[]> = { fighter: [4, 6, 8, 12, 14, 16, 19], rogue: [4, 8, 10, 12, 16, 19] };

function expectedResources(cls: string, sub: string, lvl: number): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  if (cls === "barbarian") out.Rage = lvl >= 20 ? 99 : tier(lvl, [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]]);
  if (cls === "bard") out["Bardic Inspiration"] = 2; // CHA 14
  if (cls === "cleric" && lvl >= 2) out["Channel Divinity"] = tier(lvl, [[2, 1], [6, 2], [18, 3]]);
  if (cls === "druid" && lvl >= 2) out["Wild Shape"] = lvl >= 20 ? 99 : 2;
  if (cls === "fighter") {
    out["Second Wind"] = 1;
    if (lvl >= 2) out["Action Surge"] = lvl >= 17 ? 2 : 1;
    if (lvl >= 9) out.Indomitable = tier(lvl, [[9, 1], [13, 2], [17, 3]]);
    if (/battle master/i.test(sub) && lvl >= 3) out["Superiority Dice"] = tier(lvl, [[3, 4], [7, 5], [15, 6]]);
  }
  if (cls === "monk" && lvl >= 2) out["Ki Points"] = lvl;
  if (cls === "paladin") {
    out["Lay on Hands"] = 5 * lvl;
    out["Divine Sense"] = 3; // 1 + CHA 2
    if (lvl >= 3) out["Channel Divinity"] = 1;
  }
  if (cls === "sorcerer" && lvl >= 2) out["Sorcery Points"] = lvl;
  if (cls === "wizard") out["Arcane Recovery"] = 1;
  if (cls === "artificer" && lvl >= 7) out["Flash of Genius"] = 2;
  return out;
}

/** Action type and own use limit of individual features (D&D Beyond / the books). "-" = no own counter. */
const FEATURE_EXPECT: Record<string, { kind?: string; uses?: string }> = {
  Rage: { kind: "bonus", uses: "-" }, "Reckless Attack": { kind: "free" }, "Second Wind": { kind: "bonus", uses: "-" }, "Action Surge": { kind: "free", uses: "-" },
  "Cunning Action": { kind: "bonus" }, "Uncanny Dodge": { kind: "reaction" }, "Sneak Attack": { kind: "free" }, "Steady Aim": { kind: "bonus" },
  "Bardic Inspiration": { kind: "bonus", uses: "-" }, "Cutting Words": { kind: "reaction" }, "Wild Shape": { kind: "action", uses: "-" },
  "Lay on Hands": { kind: "action", uses: "-" }, "Divine Sense": { kind: "action", uses: "-" }, "Divine Smite": { kind: "free" },
  "Flurry of Blows": { kind: "bonus" }, "Patient Defense": { kind: "bonus" }, "Step of the Wind": { kind: "bonus" }, "Deflect Missiles": { kind: "reaction" },
  "Stunning Strike": { kind: "free" }, "Slow Fall": { kind: "reaction" }, "Wholeness of Body": { kind: "action", uses: "1/long" },
  "Radiant Sun Bolt": { kind: "action" }, "Breath of the Dragon": { kind: "action", uses: "prof/long" },
  "Favored Foe": { kind: "free", uses: "prof/long" }, "Nature's Veil": { kind: "bonus", uses: "prof/long" }, Tireless: { kind: "action", uses: "prof/long" },
  "Hexblade's Curse": { kind: "bonus", uses: "1/short" }, "Fey Presence": { kind: "action", uses: "1/short" }, "Dark Delirium": { kind: "action", uses: "1/short" },
  "Healing Light": { kind: "bonus", uses: "-" }, "Misty Escape": { kind: "reaction", uses: "1/short" }, "Necrotic Husk": { kind: "reaction", uses: "1/long" },
  "Tides of Chaos": { uses: "1/long" }, "Wild Magic Surge": { kind: "other" }, "Bend Luck": { kind: "reaction" },
  "Bladesong": { kind: "bonus", uses: "prof/long" }, "Arcane Ward": { uses: "1/long" }, "The Third Eye": { kind: "action", uses: "1/short" },
  "Illusory Self": { kind: "reaction", uses: "1/short" }, "Master Transmuter": { kind: "action", uses: "1/long" }, Portent: { uses: "-" },
  "Warding Flare": { kind: "reaction", uses: "wis/long" }, "Wrath of the Storm": { kind: "reaction", uses: "wis/long" }, "War Priest": { kind: "bonus", uses: "wis/long" },
  "Channel Divinity: Turn Undead": { kind: "action", uses: "-" }, "Channel Divinity: Harness Divine Power": { kind: "bonus", uses: "-" },
  "Channel Divinity: Guided Strike": { kind: "free" }, "Channel Divinity: War God's Blessing": { kind: "reaction" }, "Channel Divinity: Artisan's Blessing": { kind: "other" },
  "Sacred Weapon": { kind: "action" }, "Vow of Enmity": { kind: "bonus" }, "Rebuke the Violent": { kind: "reaction" },
  "Dread Lord": { kind: "action", uses: "1/long" }, "Avenging Angel": { kind: "action", uses: "1/long" }, "Holy Nimbus": { kind: "action", uses: "1/long" },
  "Intimidating Presence": { kind: "action" }, "Spirit Shield": { kind: "reaction" }, "Consult the Spirits": { uses: "1/short" },
  "Arcane Shot": { uses: "2/short" }, "Giant's Might": { kind: "bonus", uses: "prof/long" }, "War Magic": { kind: "bonus" }, "Fighting Spirit": { kind: "bonus", uses: "3/long" },
  "Starry Form": { kind: "bonus", uses: "-" }, "Symbiotic Entity": { kind: "action", uses: "-" }, "Halo of Spores": { kind: "reaction" },
  "Flash of Genius": { kind: "reaction", uses: "-" }, "Magical Tinkering": { kind: "action" },
};

// ---------------------------------------------------------------------------
// Raw 5etools feature lists (the reference for which features each level grants).

const RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/class";
const rawCache = new Map<string, any>();
async function rawClass(name: string) {
  if (!rawCache.has(name)) rawCache.set(name, await (await realFetch(`${RAW}/class-${name.toLowerCase()}.json`)).json());
  return rawCache.get(name);
}
const refName = (r: any) => String(typeof r === "string" ? r : r.classFeature ?? r.subclassFeature).split("|")[0];
const refLevel = (r: any, i: number) => Number(String(typeof r === "string" ? r : r.classFeature ?? r.subclassFeature).split("|")[i]);

// ---------------------------------------------------------------------------

async function pickSpells(classFilter: string, level: number, maxLevel: number, n: number, owned: Set<string>, schools?: string[]) {
  if (n <= 0) return [];
  const list = await api.search("spell", { class: classFilter, maxLevel });
  return list
    .filter((s) => (level === 0 ? s.level === 0 : (s.level ?? 0) >= 1 && (s.level ?? 0) <= maxLevel))
    .filter((s) => !owned.has(`${s.source}:${s.key}`) && s.source === "5etools")
    .filter((s) => !schools || level === 0 || schools.includes(String(s.facets?.school ?? "")))
    .slice(0, n);
}

async function simulate(rules: ClassRules, sub: ContentSummary) {
  const cls = rules.name.toLowerCase();
  const subName = sub.name;
  const note = (level: number, what: string) => issues.push({ cls: rules.name, sub: subName, level, what });
  let c: Character = newCharacter(`${rules.name} ${subName}`);
  c.abilities = { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 };
  c.hp = { max: 0, current: 0, temp: 0 };
  let subRules: SubclassRules | undefined;
  const raw = await rawClass(rules.name);
  const rawCls = raw.class.find((k: any) => k.source !== "XPHB" && k.name === rules.name);
  const rawSub = raw.subclass.find((s: any) => s.className === rules.name && s.classSource === rawCls.source && sub.key.startsWith(`${s.shortName}|${s.source}|`));
  let expectHp = 0;

  for (let level = 1; level <= 20; level++) {
    try {
      const plan = planLevel(c, rules, subRules);
      if (plan.newLevel !== level) note(level, `plan level ${plan.newLevel}`);
      let subclass: ContentSummary | null = null;
      if (plan.needsSubclass) {
        subclass = sub;
        subRules = await api.subclassRules(sub.source, sub.key);
      }
      const plan2 = subclass ? planLevel(c, rules, subRules) : plan;
      const newFeatures = newFeaturesFor(c, plan2, subRules, true, {});
      const featureDetails = await Promise.all(newFeatures.map((f) => api.detail("feature", f.source, f.key).catch(() => undefined)));
      const pickedNames: string[] = [];
      const skillPicks = level === 1 ? (rules.skillChoices?.from ?? []).slice(0, rules.skillChoices?.count ?? 0) : [];
      const preview = { ...c, skills: { ...c.skills, ...Object.fromEntries(skillPicks.map((k) => [k, Math.max(1, c.skills[k] ?? 0)])) } } as Character;
      const ctx = () => prereqContext(c, { classKey: rules.index, newLevel: level, picked: pickedNames });

      // Feature choices: first allowed options.
      const featureSel: Record<string, Selections> = {};
      newFeatures.forEach((f, i) => {
        const sel: Selections = {};
        for (const ch of featureDetails[i]?.choices ?? []) {
          if (!ch.options.length) note(level, `${f.name}: choice "${ch.label}" has no options`);
          const req = ch.required ?? [];
          const free = ch.options.filter((o) => !req.includes(o.key) && !unmetRequirement(o, ctx(), rules.name) && !(ch.kind === "expertise" && !ch.grantsProficiency && (preview.skills[o.key] ?? 1) < 1));
          const want = Math.max(0, ch.count - req.length);
          const picks = ch.maxPerOption ? Array(ch.count).fill(free[0]?.key).filter(Boolean) : free.slice(0, want).map((o) => o.key);
          if (!ch.maxPerOption && picks.length < want && free.length < want) note(level, `${f.name}: choice "${ch.label}" offers ${free.length} allowed options for ${want} picks`);
          sel[ch.id] = picks;
          pickedNames.push(...withRequired(ch, picks).map((k) => ch.options.find((o) => o.key === k)?.name ?? ""));
        }
        featureSel[f.key] = sel;
      });
      // Progressions (invocations, maneuvers, metamagic…).
      const progressionSel: Record<string, string[]> = {};
      for (const p of plan2.progressions) {
        const taken = c.features.find((f) => f.name === p.name)?.subfeatures?.map((s) => s.key) ?? [];
        const ok = p.options.filter((o) => !taken.includes(o.key) && !unmetRequirement(o, ctx(), rules.name)).slice(0, p.gained);
        if (ok.length < p.gained) note(level, `${p.name}: only ${ok.length} of ${p.gained} options allowed`);
        progressionSel[p.name] = ok.map((o) => o.key);
        pickedNames.push(...ok.map((o) => o.name));
      }

      // Spells.
      const owned = new Set(c.spellcasting.spells.map((s) => `${s.ref.source}:${s.ref.key}`));
      const subCaster = !rules.spellcastingAbility && !!subRules?.casterType;
      const classFilter = subCaster ? "Wizard" : rules.name;
      const schools = /eldritch knight/i.test(subName) ? ["Abjuration", "Evocation"] : /arcane trickster/i.test(subName) ? ["Enchantment", "Illusion"] : undefined;
      const cantrips = await pickSpells(classFilter, 0, 0, plan2.cantripPicks, owned);
      const spells = await pickSpells(classFilter, 1, Math.max(1, plan2.maxSpellLevel), plan2.spellPicks, owned, schools && ![3, 8, 14, 20].includes(level) ? schools : undefined);
      if (cantrips.length < plan2.cantripPicks) note(level, `only ${cantrips.length}/${plan2.cantripPicks} cantrips available`);
      if (spells.length < plan2.spellPicks) note(level, `only ${spells.length}/${plan2.spellPicks} spells available`);
      const arcanumLevel = Number(newFeatures.map((f) => f.name.match(/^mystic arcanum \((\d)th level\)/i)?.[1]).find(Boolean) ?? 0);
      const arcanum = arcanumLevel ? (await pickSpells(classFilter, 1, arcanumLevel, 999, owned)).find((s) => s.level === arcanumLevel) ?? null : null;
      if (arcanumLevel && !arcanum) note(level, `no ${arcanumLevel}th-level warlock spell for Mystic Arcanum`);
      const variant = subRules?.spellVariants?.find((v) => v.name === c.classes[0]?.subclass?.variant) ?? subRules?.spellVariants?.[0];
      const spellPicks = (variant?.spellPicks ?? subRules?.spellPicks ?? []).filter((p) => (subclass ? p.level <= level : p.level === level));
      const spellPickSel: Record<number, string[]> = {};
      spellPicks.forEach((p, i) => (spellPickSel[i] = p.options.filter((o) => !owned.has(`${o.source}:${o.key}`)).slice(0, p.count).map((o) => o.key)));

      const asi = plan2.grantsAsi ? { con: Math.min(2, 20 - c.abilities.con) } : {};
      const hpGain = hpGainFor(c, plan2, rules.hitDie, { hpMode: "average", hpRoll: null, conGain: plan2.grantsAsi ? asi.con ?? 0 : 0 });
      const picks = {
        subclass, activeSubclass: c.classes[0]?.subclass ?? (subclass ? { source: subclass.source, key: subclass.key, name: subclass.name } : undefined), variant,
        newFeatures, featureDetails, featureSel, asiMode: "asi" as const, asi, featDetail: undefined, featSel: {}, progressionSel, swapSel: {},
        spellPicks, spellPickSel, cantrips, spells, swapOut: "", swapIn: [], arcanum, arcanumLevel,
        skillPicks,
        profLines: level === 1 ? rules.proficiencies : [], hpGain,
      };
      const prep = await prepareLevelUp(c, rules, plan2, picks, subRules, (type, ref) => api.detail(type, ref.source, ref.key), (ref) => api.subclassRules(ref.source, ref.key));
      // Like the app's update(): apply to a fresh copy (derived values are cached per character object).
      c = structuredClone(c);
      applyLevelUp(c, rules, plan2, picks, prep);

      // ---- checks
      const entry = c.classes[0];
      if (entry.level !== level || totalLevel(c) !== level) note(level, `class level ${entry.level}`);
      if (profBonus(c) !== Math.ceil(level / 4) + 1) note(level, `proficiency bonus ${profBonus(c)}`);
      const hd = HIT_DIE[cls] ?? rules.hitDie;
      if (rules.hitDie !== hd) note(level, `hit die d${rules.hitDie}, expected d${hd}`);
      // Effective CON (Primal Champion's +4 raises HP for every level).
      const con = Math.floor((effectiveScore(c, "con") - 10) / 2);
      expectHp = hd + con + (level - 1) * (Math.floor(hd / 2) + 1 + con) + (/draconic/i.test(subName) ? level : 0);
      if (hpMax(c) !== expectHp) note(level, `HP max ${hpMax(c)}, expected ${expectHp} (CON ${c.abilities.con})`);
      const asiLv = ASI_LEVELS[cls] ?? [4, 8, 12, 16, 19];
      if (plan2.grantsAsi !== asiLv.includes(level)) note(level, `ASI ${plan2.grantsAsi ? "granted" : "missing"}`);

      // Spell slots.
      const slots = c.spellcasting.slots.map((s) => s.max).filter((n, i, a) => a.slice(i).some((x) => x > 0));
      const sc = cls === "warlock" ? null : cls === "artificer" ? ARTIFICER : ["paladin", "ranger"].includes(cls) ? HALF : ["bard", "cleric", "druid", "sorcerer", "wizard"].includes(cls) ? FULL : /eldritch knight|arcane trickster/i.test(subName) ? THIRD : [];
      const want = sc ? (sc[level - 1] ?? []) : [];
      if (JSON.stringify(slots) !== JSON.stringify(want)) note(level, `slots ${JSON.stringify(slots)}, expected ${JSON.stringify(want)}`);
      if (cls === "warlock") {
        const p = c.spellcasting.pactSlots;
        if (p.max !== PACT_COUNT[level - 1] || p.level !== PACT_LEVEL[level - 1]) note(level, `pact slots ${p.max}×${p.level}, expected ${PACT_COUNT[level - 1]}×${PACT_LEVEL[level - 1]}`);
      }
      // Cantrips / spells known (granted spells don't count).
      const mine = c.spellcasting.spells.filter((s) => s.classKey === rules.index && !s.grantedBy);
      const cKey = CANTRIPS[cls] ? cls : /eldritch knight/i.test(subName) ? "eldritch knight" : /arcane trickster/i.test(subName) ? "arcane trickster" : "";
      if (cKey) {
        const wantC = tier(level, CANTRIPS[cKey]);
        // Arcane Trickster's Mage Hand is granted on top of its known cantrips.
        const haveC = mine.filter((s) => s.level === 0).length + (cKey === "arcane trickster" && c.spellcasting.spells.some((s) => /^mage hand$/i.test(s.ref.name) && s.grantedBy) ? 1 : 0);
        if (haveC !== wantC) note(level, `cantrips known ${haveC}, expected ${wantC}`);
      }
      const kKey = KNOWN[cls] ? cls : /eldritch knight/i.test(subName) ? "eldritch knight" : /arcane trickster/i.test(subName) ? "arcane trickster" : "";
      if (kKey) {
        const haveK = mine.filter((s) => s.level > 0).length;
        if (haveK !== KNOWN[kKey][level - 1]) note(level, `spells known ${haveK}, expected ${KNOWN[kKey][level - 1]}`);
      }
      if (cls === "wizard") {
        const book = mine.filter((s) => s.level > 0).length;
        if (book !== 6 + 2 * (level - 1)) note(level, `spellbook ${book}, expected ${6 + 2 * (level - 1)}`);
      }
      const prepared = maxPrepared(c, entry);
      const prepWant = cls === "cleric" || cls === "druid" || cls === "wizard" ? 2 + level : cls === "paladin" ? (level >= 2 ? Math.max(1, 2 + Math.floor(level / 2)) : null) : cls === "artificer" ? Math.max(1, 2 + Math.floor(level / 2)) : null;
      if (prepared !== prepWant) note(level, `prepared limit ${prepared}, expected ${prepWant}`);

      // Resources.
      const res = Object.fromEntries(classResources(c).map((r) => [r.name, r.max]));
      for (const [name, max] of Object.entries(expectedResources(cls, subName, level))) {
        if (res[name] !== max) note(level, `${name} ${res[name] ?? "missing"}, expected ${max}`);
      }
      // Attacks per Attack action.
      const extraAttack = cls === "fighter" ? tier(level, [[1, 1], [5, 2], [11, 3], [20, 4]]) : ["barbarian", "monk", "paladin", "ranger"].includes(cls) && level >= 5 ? 2 : /valor|swords|bladesing|bladesong/i.test(subName) && level >= 6 ? 2 : cls === "artificer" && /armorer|battle smith/i.test(subName) && level >= 5 ? 2 : 1;
      if (attacksPerAction(c) !== extraAttack) note(level, `attacks per action ${attacksPerAction(c)}, expected ${extraAttack}`);

      // Features vs raw 5etools.
      const rawFeatures = [
        // "Path feature" / "Divine Domain feature" placeholders just mark subclass levels.
        ...(rawCls.classFeatures ?? []).filter((r: any) => refLevel(r, 3) === level && !r.gainSubclassFeature).map(refName),
        ...((rawSub?.subclassFeatures ?? []) as any[]).filter((r: any) => refLevel(r, 5) === level).map(refName),
      ].filter((n) => !/^ability score improvement$/i.test(n));
      const got = c.features.filter((f) => f.origin === `${rules.name} ${level}`).map((f) => f.name);
      const rawObj = (n: string) => raw.classFeature.find((x: any) => x.name === n && x.className === rules.name && x.level === level && x.classSource === rawCls.source) ?? raw.subclassFeature.find((x: any) => x.name === n && x.level === level && x.subclassShortName === rawSub?.shortName);
      for (const n of rawFeatures) {
        const o = rawObj(n);
        const replacedBy = got.find((g) => (rawObj(g)?.entries?.[0] ?? "").toString().includes(`replaces the ${n} feature`));
        if (!got.includes(n) && !replacedBy && !/improvements?$/i.test(n)) note(level, `missing feature "${n}"${o?.isClassFeatureVariant ? " (optional)" : ""}`);
      }
      for (const f of c.features.filter((x) => x.origin === `${rules.name} ${level}`)) {
        const u = f.uses;
        const kind = featureKind(c, f);
        const usesText = u ? `${u.formula ?? u.max}/${u.reset}` : undefined;
        featureLog.push({ cls: rules.name, sub: subName, level, name: f.name, kind, uses: usesText, duration: featureDuration(f)?.label });
        const exp = FEATURE_EXPECT[f.name];
        // Circle of the Moon: Combat Wild Shape makes it a bonus action.
        if (exp?.kind && kind !== exp.kind && !(f.name === "Wild Shape" && /moon/i.test(subName))) note(level, `${f.name}: action type ${kind ?? "none"}, expected ${exp.kind}`);
        if (exp?.uses && (usesText ?? "-") !== exp.uses) note(level, `${f.name}: uses ${usesText ?? "-"}, expected ${exp.uses}`);
        if (/\{@|\]\(|undefined|\[object/.test(f.description)) note(level, `"${f.name}" text has unrendered markup`);
      }
      for (const ch of c.features.flatMap((f) => f.choices ?? [])) if (ch.count > ch.options.length && !ch.maxPerOption) note(level, `choice "${ch.label}" wants ${ch.count} of ${ch.options.length}`);
    } catch (e) {
      note(level, `ERROR ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`);
      break;
    }
  }
  return c;
}

// ---------------------------------------------------------------------------

const outIdx = process.argv.indexOf("--out");
const filter = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--out")?.toLowerCase();
const OFFICIAL_CLASSES = ["Artificer|TCE", "Barbarian|PHB", "Bard|PHB", "Cleric|PHB", "Druid|PHB", "Fighter|PHB", "Monk|PHB", "Paladin|PHB", "Ranger|PHB", "Rogue|PHB", "Sorcerer|PHB", "Warlock|PHB", "Wizard|PHB"];
// 2014-era official and semi-official books; Unearthed Arcana and homebrew are skipped.
const UNOFFICIAL = /^UA|Unearthed|homebrew/i;
const characters: Record<string, Character> = {};
let count = 0;
for (const key of OFFICIAL_CLASSES) {
  if (filter && !key.toLowerCase().startsWith(filter)) continue;
  const rules = await api.classRules("5etools", key);
  for (const sub of rules.subclasses) {
    if (UNOFFICIAL.test(sub.key.split("|")[1]) || UNOFFICIAL.test(sub.sourceLabel ?? "")) continue;
    const summary = { ...sub, type: "subclass" as const };
    const c = await simulate(rules, summary);
    characters[`${rules.name} / ${sub.name}`] = c;
    count++;
    const mine = issues.filter((i) => i.cls === rules.name && i.sub === sub.name);
    console.log(`${mine.length ? "✗" : "✓"} ${rules.name} / ${sub.name}${mine.length ? ` — ${mine.length} issue(s)` : ""}`);
  }
}
console.log(`\n${count} class/subclass builds, ${issues.length} issues`);
const grouped = new Map<string, Issue[]>();
for (const i of issues) {
  const k = i.what.replace(/\d+/g, "N");
  grouped.set(k, [...(grouped.get(k) ?? []), i]);
}
for (const [k, list] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n[${list.length}] ${k}`);
  for (const i of list.slice(0, 6)) console.log(`   ${i.cls} / ${i.sub} L${i.level}: ${i.what}`);
}
if (outIdx > 0) writeFileSync(process.argv[outIdx + 1], JSON.stringify({ issues, featureLog }, null, 1));
