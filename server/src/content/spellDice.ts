import type { SpellDice } from "./types.js";

const DAMAGE_TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";
const ABILITY_NAMES = "Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma";

/**
 * Pull roll information out of spell text. Used for sources without structured data
 * (Open5e, homebrew) and to fill gaps in structured ones.
 */
export function diceFromText(desc: string, higher = ""): SpellDice | undefined {
  const text = `${desc}\n${higher}`.replace(/\*/g, "");
  const out: Partial<SpellDice> = {};
  const damage = [...text.matchAll(new RegExp(`(\\d+d\\d+(?:\\s*\\+\\s*\\d+)?)\\s+(${DAMAGE_TYPES})\\s+damage`, "gi"))];
  const heal = text.match(/regains?[^.]*?(\d+d\d+)(\s*\+\s*your spellcasting ability modifier)?/i);
  if (damage.length) {
    out.kind = "damage";
    out.base = damage[0][1].replace(/\s+/g, "");
    out.types = [...new Set(damage.map((m) => m[2].toLowerCase()))];
  } else if (text.match(/(\d+d\d+) (?:\w+ )?damage of the (?:chosen )?type|extra (\d+d\d+) damage/i)) {
    // "an extra 1d4 damage of the chosen type" (Elemental Weapon)
    const m = text.match(/(\d+d\d+) (?:\w+ )?damage of the (?:chosen )?type|extra (\d+d\d+) damage/i)!;
    out.kind = "damage";
    out.base = m[1] ?? m[2];
  } else if (heal) {
    out.kind = "heal";
    out.base = heal[1];
    out.addModifier = !!heal[2];
  }
  const per = higher.match(/increases? by (\d+d\d+) for (?:each|every) (?:slot )?level above/i) ?? text.match(/increases? by (\d+d\d+) for (?:each|every) (?:slot )?level above/i);
  if (per) out.perSlot = per[1];
  // Tiers: "When you cast this spell using a spell slot of 5th or 6th level, … the extra damage increases to 2d4."
  if (!per) {
    const tiers = higher
      .split(/(?<=\.)\s+/)
      .map((sentence) => [sentence.match(/spell slot of (\d)(?:st|nd|rd|th)/i)?.[1], sentence.match(/increases to (\d+d\d+)/i)?.[1]] as const)
      .filter(([lvl, dice]) => lvl && dice);
    if (tiers.length) out.bySlot = Object.fromEntries(tiers.map(([lvl, dice]) => [lvl!, dice!]));
  }
  const cantrip = text.match(/5th level \((\d+d\d+)\),\s*11th level \((\d+d\d+)\),\s*and 17th level \((\d+d\d+)\)/i);
  if (cantrip && out.base) out.byCharacterLevel = { "1": out.base, "5": cantrip[1], "11": cantrip[2], "17": cantrip[3] };
  // "advantage on Constitution saving throws" / "make Constitution saving throws with advantage"
  // (Guardian of Nature) aren't saves the spell forces.
  const save = [...text.matchAll(new RegExp(`(?<!advantage on |disadvantage on |bonus to |you make )(${ABILITY_NAMES}) saving throws?(?! with (?:dis)?advantage)`, "gi"))][0];
  if (save) out.save = save[1][0].toUpperCase() + save[1].slice(1).toLowerCase();
  const attack = text.match(/(melee|ranged) spell attack/i);
  if (attack) out.attack = attack[1].toLowerCase() as "melee" | "ranged";
  if (!out.kind && !out.save && !out.attack) return undefined;
  return { kind: out.kind ?? "damage", ...out } as SpellDice;
}

/** Structured data wins; text fills whatever it doesn't say. */
export function mergeDice(structured: Partial<SpellDice> | undefined, fromText: SpellDice | undefined): SpellDice | undefined {
  if (!structured && !fromText) return undefined;
  const merged = { ...fromText, ...Object.fromEntries(Object.entries(structured ?? {}).filter(([, v]) => v !== undefined && v !== null)) };
  return { kind: "damage", ...merged } as SpellDice;
}
