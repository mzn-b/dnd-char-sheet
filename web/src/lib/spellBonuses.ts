import { featureParts } from "./featureSections";
import { abilityMod } from "./rules";
import type { Character, ContentDetail, SpellEntry } from "./types";

/** A flat bonus a feature adds to a spell's damage roll. */
export interface SpellDamageBonus {
  amount: number;
  source: string;
}

const classOf = (c: Character, s: SpellEntry) => c.classes.find((k) => k.key === s.classKey)?.name.toLowerCase();

/**
 * Damage bonuses from features you have (PHB):
 * - Agonizing Blast: + Charisma modifier to each Eldritch Blast beam.
 * - Potent Spellcasting (Knowledge, Light, Nature, Arcana… domains): + Wisdom modifier to cleric cantrip damage.
 * - Empowered Evocation: + Intelligence modifier to one damage roll of a wizard evocation spell.
 */
export function spellDamageBonuses(c: Character, spell: SpellEntry, detail?: ContentDetail): SpellDamageBonus[] {
  if (detail?.spell?.dice && detail.spell.dice.kind !== "damage") return [];
  const have = new Set(featureParts(c).map((p) => p.name.toLowerCase()));
  const out: SpellDamageBonus[] = [];
  const name = spell.ref.name.toLowerCase();
  if (have.has("agonizing blast") && name === "eldritch blast") out.push({ amount: abilityMod(c, "cha"), source: "Agonizing Blast" });
  if (have.has("potent spellcasting") && spell.level === 0 && classOf(c, spell) === "cleric") out.push({ amount: abilityMod(c, "wis"), source: "Potent Spellcasting" });
  if (have.has("empowered evocation") && classOf(c, spell) === "wizard" && /^evocation$/i.test(detail?.spell?.school ?? "")) {
    out.push({ amount: abilityMod(c, "int"), source: "Empowered Evocation" });
  }
  return out;
}

/** Eldritch Blast fires more beams as you level: two at 5th, three at 11th, four at 17th. Each is its own attack. */
export function eldritchBlastBeams(characterLevel: number) {
  return 1 + [5, 11, 17].filter((l) => characterLevel >= l).length;
}
