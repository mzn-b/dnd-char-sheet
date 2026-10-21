import { Router } from "express";
import { getContent, searchContent } from "../content/index.js";
import { getClassRules, getSubclassLevels } from "../content/srd.js";
import { getHomebrew } from "../content/homebrew.js";
import { HttpError } from "../content/http.js";
import { CONTENT_TYPES, type ContentDetail, type ContentSource, type ContentType } from "../content/types.js";

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

/** Class progression for the level-up wizard. Homebrew classes are expanded from their compact definition. */
content.get("/rules/classes/:source/:key", async (req, res) => {
  if (req.params.source === "srd") return void res.json(await getClassRules(req.params.key));
  const hb = await getHomebrew(req.params.key);
  if (!hb || hb.type !== "class") throw new HttpError(404, "Homebrew class not found");
  res.json(await homebrewClassRules(hb));
});

content.get("/rules/subclasses/:source/:key/levels", async (req, res) => {
  if (req.params.source === "srd") return void res.json(await getSubclassLevels(req.params.key));
  const hb = await getHomebrew(req.params.key);
  if (!hb) throw new HttpError(404, "Homebrew subclass not found");
  res.json(featuresByLevel((hb as any).featureLevels));
});

type FeatureLevel = { level: number; key: string; name: string };

function featuresByLevel(featureLevels: FeatureLevel[] = []) {
  return Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    features: featureLevels.filter((f) => f.level === i + 1).map((f) => ({ key: f.key, name: f.name, source: "homebrew" })),
  }));
}

/**
 * A homebrew class is stored compactly: hit die, ASI levels, features per level, and
 * optionally "spellProgressionFrom" to borrow an SRD class's spell slot table.
 */
async function homebrewClassRules(hb: ContentDetail) {
  const d = hb as any;
  const asiLevels: number[] = d.asiLevels ?? [4, 8, 12, 16, 19];
  const borrowed = d.spellProgressionFrom ? await getClassRules(d.spellProgressionFrom).catch(() => null) : null;
  return {
    source: "homebrew",
    index: hb.key,
    name: hb.name,
    hitDie: Number(d.hitDie ?? 8),
    savingThrows: d.savingThrows ?? [],
    spellcastingAbility: d.spellcastingAbility || null,
    casterType: d.casterType ?? (d.spellcastingAbility ? "full" : "none"),
    subclassLevel: Number(d.subclassLevel ?? 3),
    subclasses: [],
    levels: featuresByLevel(d.featureLevels).map((l) => ({
      ...l,
      profBonus: Math.ceil(l.level / 4) + 1,
      abilityScoreBonuses: asiLevels.filter((a) => a <= l.level).length,
      spellcasting: borrowed?.levels[l.level - 1]?.spellcasting ?? null,
    })),
  };
}
