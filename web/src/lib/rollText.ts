/**
 * Finds every roll in a rules text: base dice, conditional dice ("instead takes 1d12 if…"),
 * per-turn effects, flat bonuses, and how they scale with slot level or character level.
 *
 * No public API exposes this (5etools and Open5e only structure the primary damage), so this
 * reads the prose. It works sentence by sentence: find dice, then classify each by the words
 * around it (damage type, "instead", "if…", "on a hit", "half as much"…).
 */

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant",
  "slashing", "thunder",
];
const TYPE_RE = DAMAGE_TYPES.join("|");

export type RollKind = "damage" | "healing" | "temp hp" | "bonus" | "die" | "roll";

export interface RollInfo {
  /** "1d8", "2d8 + mod", "1d4 + 4", "5", "+2". */
  dice: string;
  kind: RollKind;
  /** Damage type(s), e.g. "necrotic" or "radiant or necrotic"; "chosen" when the caster picks. */
  type?: string;
  /** "if the target is missing any of its hit points" */
  condition?: string;
  /** "on a hit", "on a failed save", "when a creature starts its turn there"… */
  timing?: string;
  /** This roll replaces the previous one when its condition applies ("instead"). */
  instead?: boolean;
  /** Half damage on a successful save. */
  halfOnSave?: boolean;
  /** Only from this character level (cantrip upgrades like Booming Blade at 5th). */
  minCharacterLevel?: number;
  scaling?: Scaling;
  /** The sentence it came from, for tooltips. */
  context: string;
}

export interface Scaling {
  /** Extra dice per step of slot levels above `aboveLevel`. */
  perSlot?: { dice: string; every: number; aboveLevel: number };
  /** Cantrip dice count grows at character levels 5, 11, 17. */
  cantripTiers?: boolean;
  /** Cap, e.g. Divine Smite's "maximum of 5d8". */
  max?: string;
}

const ABILITY_MOD = /your (?:spellcasting ability|strength|dexterity|constitution|intelligence|wisdom|charisma) modifier/i;
const DICE = String.raw`(\d+d\d+|(?<![\w])d\d+\b)`;
const MOD_TAIL = String.raw`(?:\s*([+\-−])\s*(\d+d\d+|\d+(?!d)|your (?:spellcasting ability|strength|dexterity|constitution|intelligence|wisdom|charisma) modifier|your [a-z]+ level))?`;
const DICE_RE = new RegExp(DICE + MOD_TAIL, "gi");


/** Split prose into sentences without breaking on "5 ft." style abbreviations or decimals. */
export function sentences(paragraph: string): string[] {
  return paragraph
    .replace(/\*\*/g, "")
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanTail(s: string) {
  return s.replace(/[,;.]\s*$/, "").replace(/\s+/g, " ").trim();
}

/** Condition clause attached to a dice mention, if any. */
function conditionFor(sentence: string, index: number): { condition?: string; instead?: boolean } {
  const before = sentence.slice(0, index);
  const after = sentence.slice(index);
  const instead = /\binstead\b/i.test(sentence);
  // Leading clause: "If the target is missing any of its hit points, it instead takes…"
  const lead = before.match(/^(?:if|when|whenever|while|unless)\b([^,]+),/i);
  if (lead && !/^when you cast this spell$/i.test(lead[0].replace(/,$/, ""))) return { condition: cleanTail(lead[0]), instead };
  // Trailing clause: "…increases by 1d8 if the target is an undead or a fiend…"
  const trail = after.match(/\b(if (?:the|a|an|it|you|that|its|any|your)\b[^,.;]+)/i);
  if (trail) return { condition: cleanTail(trail[1]), instead };
  // Parenthetical: "3d8 radiant damage (if you are good or neutral)"
  const paren = after.match(/^\S+(?:\s+\w+){0,3}\s*\((if [^)]+)\)/i);
  if (paren) return { condition: paren[1], instead };
  return { instead };
}

function timingFor(sentence: string): string | undefined {
  const s = sentence.toLowerCase();
  if (/starts? its turn|enters? the (?:spell's )?area|ends? its turn/.test(s)) {
    const parts = [];
    if (/enters? the (?:spell's )?area/.test(s)) parts.push("enters the area");
    if (/starts? its turn/.test(s)) parts.push("starts its turn there");
    if (/ends? its turn/.test(s)) parts.push("ends its turn nearby");
    return `when a creature ${parts.join(" or ")}`;
  }
  if (/on each of your turns|on each of your subsequent turns|until the spell ends, you can/.test(s)) return "again on later turns";
  if (/whenever you hit|when you hit/.test(s)) return "whenever you hit";
  if (/on a hit|if the attack hits|hits? (?:you|it|the target) with/.test(s)) return "on a hit";
  if (/on a failed save|fails? (?:the|its|a) sav|must succeed on .* or take|must make .* saving throw/.test(s)) return "on a failed save";
  if (/as a bonus action/.test(s)) return "as a bonus action";
  if (/hit or miss/.test(s)) return "hit or miss";
  if (/moves?\b/.test(s) && /willingly/.test(s)) return "if the target willingly moves";
  return undefined;
}

/** Damage type for a dice mention: right after it, right before "damage equal to", or elsewhere in the paragraph. */
function typeFor(sentence: string, index: number, matchEnd: number, paragraph: string): string | undefined {
  const after = sentence.slice(matchEnd, matchEnd + 60);
  const direct = after.match(new RegExp(`^\\s*(${TYPE_RE})(?:\\s+or\\s+(${TYPE_RE}))?\\b`, "i"));
  if (direct) return direct[2] ? `${direct[1]} or ${direct[2]}`.toLowerCase() : direct[1].toLowerCase();
  if (/^\s*damage of the type you chose/i.test(after)) return "chosen";
  const ofType = after.match(/^\s*(?:extra\s+)?damage of (?:the |its )?(chosen|same|triggering|weapon's|its)(?: damage)? type/i);
  if (ofType) return ofType[1].toLowerCase() === "chosen" ? "chosen" : `${ofType[1].toLowerCase()} type`;
  const before = sentence.slice(Math.max(0, index - 60), index);
  const equal = before.match(new RegExp(`(${TYPE_RE}) damage equal to\\s*$`, "i"));
  if (equal) return equal[1].toLowerCase();
  // Divine Smite: "deal radiant damage … The extra damage is 2d8"
  const para = paragraph.match(new RegExp(`(${TYPE_RE}) damage`, "i"));
  if (para && /damage/i.test(sentence)) return para[1].toLowerCase();
  return undefined;
}

function kindFor(sentence: string, index: number, matchEnd: number): RollKind {
  const after = sentence.slice(matchEnd, matchEnd + 50).toLowerCase();
  const before = sentence.slice(Math.max(0, index - 80), index).toLowerCase();
  if (/temporary hit points/.test(after) || /temporary hit points equal to\s*$/.test(before)) return "temp hp";
  if (/^\s*(?:\w+\s+){0,2}damage/.test(after) || /^\s*to damage/.test(after) || /damage (?:equal to|is)\s*$/.test(before) || /extra\s*$/.test(before)) return "damage";
  if (/regains?|restore|hit points equal to|heal/.test(before) || /^\s*hit points/.test(after)) return "healing";
  if (/\b(?:die|dice)\b/.test(before + after) && !/damage/.test(after)) return "die";
  return "roll";
}

function normalizeDice(m: RegExpMatchArray): string {
  const base = m[1].startsWith("d") ? `1${m[1]}` : m[1];
  if (!m[2]) return base;
  const sign = m[2] === "+" ? "+" : "−";
  const tail = m[3];
  if (/^\d+(?:d\d+)?$/.test(tail)) return `${base} ${sign} ${tail}`;
  if (ABILITY_MOD.test(tail)) return `${base} ${sign} mod`;
  return `${base} ${sign} ${tail.replace(/^your /, "")}`;
}

/** "the damage increases by 1d8 for each slot level above 1st" / "for every two slot levels above 2nd". */
function slotScaling(text: string): { dice: string; every: number; aboveLevel: number; target?: string }[] {
  const out = [];
  const re = /(?:the\s+)?(?:(\w+)\s+)?(damage|healing|temporary hit points[^.]*?)\s+increases? by (\d+d\d+|\d+)(?:\s+\w+)?\s+for (?:each|every) (two |2 )?(?:slot |spell )?levels? (?:above|higher than) (\d)(?:st|nd|rd|th)/gi;
  for (const m of text.matchAll(re)) {
    out.push({ dice: m[3], every: m[4] ? 2 : 1, aboveLevel: Number(m[5]), target: m[1]?.toLowerCase() });
  }
  // Divine Smite style: "2d8 for a 1st-level spell slot, plus 1d8 for each spell level higher than 1st"
  for (const m of text.matchAll(/plus (\d+d\d+) for each (?:spell |slot )?level higher than (\d)/gi)) {
    out.push({ dice: m[1], every: 1, aboveLevel: Number(m[2]) });
  }
  return out;
}

export function extractRolls(text: string, opts: { spellLevel?: number } = {}): RollInfo[] {
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/);
  const rolls: RollInfo[] = [];
  const isCantrip = opts.spellLevel === 0;
  const cantripTiers = isCantrip && /(?:when you reach|at) 5th level/i.test(text);

  for (const paragraph of paragraphs) {
    const higher = /^\**\s*at higher levels/i.test(paragraph);
    const cantripScaling = /(?:damage|spell's damage) increases?.*(?:5th level|when you reach)/i.test(paragraph) || /^this spell's damage increases when you reach/i.test(paragraph);
    // Area triggers are usually stated a sentence before the damage (Moonbeam, Spirit Guardians).
    const areaTiming = timingFor(paragraph.match(/[^.]*(?:starts? its turn|enters? the (?:spell's )?area|ends? its turn)[^.]*\./i)?.[0] ?? "");
    for (const original of sentences(paragraph)) {
      if (higher) continue;
      // Cantrip upgrades add a new roll at a character level (Booming Blade's extra hit damage at 5th).
      const upgrade = cantripScaling ? original.match(/^at (\d+)(?:st|nd|rd|th) level,/i) : null;
      if (cantripScaling && !upgrade) continue;
      // Scaling phrases are applied to rolls afterwards, so remove them before looking for dice.
      const sentence = original
        .replace(/(?:,\s*)?(?:plus )?\d+d\d+ for (?:each|every)[^,.;]*/gi, "")
        .replace(/(?:,\s*)?to a maximum of \d+d\d+/gi, "")
        .replace(/increases? by (?:\d+d\d+|one die) (?:for (?:each|every)|when you reach)[^.;]*/gi, "")
        .replace(/both damage rolls increase[^.;]*/gi, "")
        .replace(/\(\d+d\d+(?: (?:or|and) \d+d\d+)?\)/g, "");
      if (upgrade && !/\d+d\d+/.test(sentence)) continue;

      for (const m of sentence.matchAll(DICE_RE)) {
        const index = m.index ?? 0;
        const end = index + m[0].length;
        // Skip the d20 itself ("roll a d20") and spelled-out die counts in tier lists.
        if (/^1?d20$/i.test(m[1]) && !m[2]) continue;
        const kind = kindFor(sentence, index, end);
        const { condition, instead } = conditionFor(sentence, index);
        rolls.push({
          dice: normalizeDice(m),
          kind,
          type: kind === "damage" ? typeFor(sentence, index, end, paragraph) : undefined,
          condition,
          instead: instead || undefined,
          timing: areaTiming && !/hit|attack/i.test(sentence) ? areaTiming : timingFor(sentence),
          halfOnSave: /half as much/i.test(sentence) || undefined,
          minCharacterLevel: upgrade ? Number(upgrade[1]) : undefined,
          context: original,
        });
      }

      // Flat damage/temp HP without dice: "you gain 5 temporary hit points", "the creature takes 5 cold damage".
      for (const m of sentence.matchAll(new RegExp(`\\b(?:takes?|deals?|gain) (\\d+) (?:(${TYPE_RE}) damage|temporary hit points)`, "gi"))) {
        rolls.push({
          dice: m[1],
          kind: m[2] ? "damage" : "temp hp",
          type: m[2]?.toLowerCase(),
          ...conditionFor(sentence, m.index ?? 0),
          timing: timingFor(sentence),
          context: sentence,
        });
      }
      // Damage equal to a modifier only (Green-Flame Blade's second target at low levels).
      for (const m of sentence.matchAll(new RegExp(`(${TYPE_RE}) damage equal to your (spellcasting ability|strength|dexterity) modifier`, "gi"))) {
        if (new RegExp(DICE).test(sentence.slice(m.index ?? 0))) continue;
        rolls.push({ dice: "mod", kind: "damage", type: m[1].toLowerCase(), context: sentence, timing: timingFor(sentence) });
      }
      // Flat bonuses: "+2 bonus to the damage roll", "add +10 to the attack's damage", "-5 penalty to the attack roll".
      for (const m of sentence.matchAll(/([+\-−]\s?\d+) (?:bonus |penalty )?to (?:the |your )?(attack(?:'s)? damage|damage rolls?|attack rolls?|AC|armor class)/gi)) {
        rolls.push({ dice: m[1].replace(/\s/g, "").replace("-", "−"), kind: "bonus", type: m[2].toLowerCase(), ...conditionFor(sentence, m.index ?? 0), context: sentence });
      }
      // "Roll 5d8" style pools are caught above as kind "roll"; spelled bonuses like "an extra 1d6" are damage via kindFor.
    }
  }

  // Attach scaling.
  const slot = slotScaling(text);
  const max = text.match(/to a maximum of (\d+d\d+)/i)?.[1];
  for (const r of rolls) {
    if (r.kind === "bonus") continue;
    const s =
      slot.find((x) => x.target && r.type && x.target === r.type) ??
      slot.find((x) => x.target && /^(?:initial|the)$/.test(x.target) === false && r.kind === "healing" && x.target === undefined) ??
      slot.find((x) => !x.target || ["the", "spell's", "initial", "both"].includes(x.target ?? ""));
    const applies =
      s && (r.kind === "damage" || r.kind === "healing" || r.kind === "temp hp") &&
      (!s.target || !DAMAGE_TYPES.includes(s.target) || s.target === r.type) &&
      // "the initial damage increases" (Witch Bolt) applies only to the first roll, not the per-turn one.
      !(s.target === "initial" && r.timing === "again on later turns");
    if (applies || cantripTiers || max) {
      r.scaling = {
        perSlot: applies ? { dice: s!.dice, every: s!.every, aboveLevel: s!.aboveLevel } : undefined,
        cantripTiers: cantripTiers && (r.kind === "damage" || r.kind === "healing") && r.dice !== "mod" ? true : undefined,
        max: max && r === rolls.find((x) => x.kind === "damage") ? max : undefined,
      };
    }
  }

  // Remove duplicates (same dice, type and condition mentioned twice).
  const seen = new Set<string>();
  return rolls.filter((r) => {
    const k = `${r.dice}|${r.kind}|${r.type}|${r.condition}|${r.minCharacterLevel}|${r.timing}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Add `times` extra dice to an expression: "2d6" + 3×"1d6" → "5d6"; mixed sizes are appended. */
export function addDice(expr: string, extra: string, times: number): string {
  if (!times) return expr;
  const b = expr.match(/^(\d+)d(\d+)(.*)$/);
  const e = extra.match(/^(\d+)d(\d+)$/);
  if (b && e && b[2] === e[2]) return `${Number(b[1]) + Number(e[1]) * times}d${b[2]}${b[3]}`;
  if (e) return `${expr} + ${Number(e[1]) * times}d${e[2]}`;
  if (/^\d+$/.test(extra) && /^\d+$/.test(expr)) return String(Number(expr) + Number(extra) * times);
  return `${expr} + ${times}×${extra}`;
}

const cantripTierCount = (level: number) => [5, 11, 17].filter((l) => level >= l).length;

/**
 * Resolve a roll for a specific cast: slot level for leveled spells, character level for cantrips.
 * Returns undefined when the roll isn't available yet (cantrip upgrade below its level).
 */
export function resolveRoll(r: RollInfo, at: { spellLevel?: number; slotLevel?: number; characterLevel?: number }): string | undefined {
  const charLevel = at.characterLevel ?? 1;
  if (r.minCharacterLevel && charLevel < r.minCharacterLevel) return undefined;
  let dice = r.dice;
  const die = dice.match(/^(\d+)d(\d+)/);
  if (r.scaling?.cantripTiers && die) {
    // Upgrades that start at 5th already include the first tier.
    const tiers = cantripTierCount(charLevel) - (r.minCharacterLevel ? cantripTierCount(r.minCharacterLevel) : 0);
    dice = addDice(dice, `1d${die[2]}`, tiers);
  }
  const p = r.scaling?.perSlot;
  if (p && at.slotLevel != null) {
    const steps = Math.floor(Math.max(0, at.slotLevel - p.aboveLevel) / p.every);
    dice = addDice(dice, p.dice, steps);
  }
  const cap = r.scaling?.max?.match(/^(\d+)d(\d+)$/);
  const now = dice.match(/^(\d+)d(\d+)(.*)$/);
  if (cap && now && now[2] === cap[2] && Number(now[1]) > Number(cap[1])) dice = `${cap[1]}d${cap[2]}${now[3]}`;
  return dice;
}

/** One-line description: "1d12 necrotic, instead, if the target is missing any of its hit points". */
export function describeRoll(r: RollInfo, dice = r.dice): string {
  const what =
    r.kind === "damage" ? (r.type && r.type !== "chosen" ? `${r.type} damage` : r.type === "chosen" ? "damage (type of your choice)" : "damage")
    : r.kind === "healing" ? "healing"
    : r.kind === "temp hp" ? "temporary HP"
    : r.kind === "bonus" ? `to ${r.type}`
    : r.kind === "die" ? "die"
    : "";
  const parts = [`${dice} ${what}`.trim()];
  if (r.instead) parts.push("instead");
  if (r.condition) parts.push(r.condition);
  if (r.timing && !r.condition?.toLowerCase().includes(r.timing)) parts.push(r.timing);
  if (r.halfOnSave) parts.push("half on a successful save");
  if (r.minCharacterLevel) parts.push(`from level ${r.minCharacterLevel}`);
  return parts.join(" · ");
}

export function scalingText(r: RollInfo): string | undefined {
  const s = r.scaling;
  if (!s) return undefined;
  const bits = [];
  if (s.perSlot) bits.push(`+${s.perSlot.dice} per ${s.perSlot.every === 2 ? "two slot levels" : "slot level"} above ${s.perSlot.aboveLevel}`);
  if (s.cantripTiers) bits.push("+1 die at levels 5, 11, 17");
  if (s.max) bits.push(`max ${s.max}`);
  return bits.join(", ") || undefined;
}
