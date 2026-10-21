import { Router } from "express";
import { getContent, resolveSpellByName, searchContent } from "../content/index.js";
import { archetypeRules } from "../content/open5e.js";
import { getClassRules, getSubclassLevels } from "../content/srd.js";
import { classRules5etools, subclassLevels5etools } from "../content/fivetools/index.js";
import { getHomebrew } from "../content/homebrew.js";
import { HttpError } from "../content/http.js";
import {
  CONTENT_TYPES, singleClassSlots, type ClassRules, type ContentDetail, type ContentSource, type ContentType,
} from "../content/types.js";

export const content = Router();

const num = (v: unknown) => (v == null || v === "" ? undefined : Number(v));

function contentType(t: string): ContentType {
  if (!CONTENT_TYPES.includes(t as ContentType)) throw new HttpError(400, `Unknown content type '${t}'`);
  return t as ContentType;
}

/** GET /api/content/spell?q=fire&class=wizard&maxLevel=3 */
content.get("/content/:type", async (req, res) => {
  res.json(
    await searchContent(contentType(req.params.type), {
      q: req.query.q as string | undefined,
      cls: req.query.class as string | undefined,
      level: num(req.query.level),
      maxLevel: num(req.query.maxLevel),
    }),
  );
});

/** GET /api/content/spell/srd/fireball */
content.get("/content/:type/:source/:key", async (req, res) => {
  res.json(await getContent(contentType(req.params.type), req.params.source as ContentSource, req.params.key));
});

/** Class progression for the level-up wizard. */
content.get("/rules/classes/:source/:key", async (req, res) => {
  const { source, key } = req.params;
  if (source === "srd") return void res.json(await getClassRules(key));
  if (source === "5etools") return void res.json(await classRules5etools(key));
  const hb = await getHomebrew(key);
  if (!hb || hb.type !== "class") throw new HttpError(404, "Homebrew class not found");
  res.json(await homebrewClassRules(hb));
});

content.get("/rules/subclasses/:source/:key/levels", async (req, res) => {
  const { source, key } = req.params;
  if (source === "srd") return void res.json(await getSubclassLevels(key));
  if (source === "5etools") return void res.json(await subclassLevels5etools(key));
  if (source === "open5e") {
    const SUBCLASS_AT: Record<string, number> = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };
    const rules = await archetypeRules(key, SUBCLASS_AT[key.split("/")[0]] ?? 3, resolveSpellByName);
    if (!rules) throw new HttpError(404, "Open5e archetype not found");
    return void res.json(rules);
  }
  const hb = await getHomebrew(key);
  if (!hb) throw new HttpError(404, "Homebrew subclass not found");
  res.json({ spellcastingAbility: null, casterType: null, spellModel: null, levels: featuresByLevel((hb as any).featureLevels).map((l) => ({ ...l, progressions: [], spellcasting: null })) });
});

type FeatureLevel = { level: number; key: string; name: string };

function featuresByLevel(featureLevels: FeatureLevel[] = []) {
  return Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    features: featureLevels.filter((f) => f.level === i + 1 && f.key).map((f) => ({ key: f.key, name: f.name, source: "homebrew" as const })),
  }));
}

/**
 * A homebrew class is stored compactly: hit die, ASI levels, features per level, and
 * optionally "spellProgressionFrom" to borrow an SRD class's spell tables.
 */
async function homebrewClassRules(hb: ContentDetail): Promise<ClassRules> {
  const d = hb as any;
  const asiLevels: number[] = d.asiLevels ?? [4, 8, 12, 16, 19];
  const borrowed = d.spellProgressionFrom ? await getClassRules(d.spellProgressionFrom).catch(() => null) : null;
  const casterType = d.casterType ?? (d.spellcastingAbility ? "full" : "none");
  return {
    source: "homebrew",
    index: hb.key,
    name: hb.name,
    sourceLabel: "Homebrew",
    hitDie: Number(d.hitDie ?? 8),
    savingThrows: d.savingThrows ?? [],
    spellcastingAbility: d.spellcastingAbility || null,
    casterType,
    spellModel: borrowed?.spellModel ?? (d.spellcastingAbility ? "known" : null),
    preparedDivisor: borrowed?.preparedDivisor ?? 1,
    subclassLevel: Number(d.subclassLevel ?? 3),
    subclassTitle: "Subclass",
    subclasses: [],
    proficiencies: d.proficiencies ? [d.proficiencies] : [],
    skillChoices: d.skillChoices ?? null,
    multiclass: { requirements: d.multiclassRequirements ?? null, proficiencies: [], skillChoices: null },
    startingEquipment: [],
    levels: featuresByLevel(d.featureLevels).map((l) => ({
      ...l,
      profBonus: Math.ceil(l.level / 4) + 1,
      abilityScoreBonuses: asiLevels.filter((a) => a <= l.level).length,
      spellcasting:
        borrowed?.levels[l.level - 1]?.spellcasting ??
        (d.spellcastingAbility ? { cantripsKnown: 0, spellsKnown: null, slots: singleClassSlots(casterType, l.level) } : null),
      progressions: [],
    })),
  };
}
