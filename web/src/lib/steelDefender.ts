import { uid } from "./defaults";
import { featureParts } from "./featureSections";
import { abilityMod, fmt, profBonus, spellAttack } from "./rules";
import type { Character, Companion, MonsterData } from "./types";

/**
 * The Battle Smith's Steel Defender (Tasha's Cauldron of Everything, p. 14). Its numbers follow your
 * artificer level, Intelligence and proficiency bonus, so the sheet keeps it in step with them.
 */
export const hasSteelDefender = (c: Character) => featureParts(c).some((p) => /^steel defender$/i.test(p.name));

const artificerLevel = (c: Character) => c.classes.find((k) => k.name.toLowerCase() === "artificer")?.level ?? 0;

export function steelDefenderBlock(c: Character): MonsterData {
  const lvl = artificerLevel(c);
  const int = abilityMod(c, "int");
  const pb = profBonus(c);
  const improved = lvl >= 15; // Improved Defender
  const hp = 2 + int + 5 * lvl;
  return {
    size: "Medium",
    type: "construct",
    alignment: "",
    ac: improved ? 17 : 15,
    acNote: improved ? "natural armor, Improved Defender" : "natural armor",
    hp,
    hpFormula: `2 + your Intelligence modifier + 5 × your artificer level`,
    speed: { walk: 40 },
    abilities: { str: 14, dex: 12, con: 14, int: 4, wis: 10, cha: 6 },
    saves: { dex: 1 + pb, con: 2 + pb },
    skills: { athletics: 2 + pb, perception: 2 * pb },
    senses: `darkvision 60 ft., passive Perception ${10 + 2 * pb}`,
    languages: "understands the languages you speak",
    cr: "—",
    immunities: "poison",
    conditionImmunities: "charmed, exhaustion, poisoned",
    traits: [
      { name: "Vigilant", text: "The defender can't be surprised." },
      { name: "In combat", text: "It shares your initiative count and takes its turn right after yours. It can move and use its reaction on its own, but the only action it takes is the Dodge action unless you use a bonus action to command it to take another action. If you're incapacitated, it can take any action of its choice." },
      { name: "Restoring it", text: "If the mending spell is cast on it within an hour of its death, it returns to life after 1 minute with all its hit points. At the end of a long rest you can create a new one; if you already have one, the first one perishes. You can also create one with an action and a spell slot of 1st level or higher." },
    ],
    actions: [
      { name: "Force-Empowered Rend", text: `Melee Weapon Attack: ${fmt(spellAttack(c, "int"))} to hit, reach 5 ft., one target you can see. Hit: 1d8 + ${pb} force damage.` },
      { name: "Repair (3/Day)", text: `The magical mechanisms inside the defender restore 2d8 + ${pb} hit points to itself or to one construct or object within 5 feet of it.` },
    ],
    bonusActions: [],
    reactions: [
      {
        name: "Deflect Attack",
        text: `The defender imposes disadvantage on the attack roll of one creature it can see that is within 5 feet of it, provided the attack roll is against a creature other than the defender.${improved ? ` The attacker takes 1d4 + ${int} force damage.` : ""}`,
      },
    ],
    legendary: [],
  };
}

/**
 * Add the Steel Defender once the feature is gained, keep its AC, HP and attacks up to date, and take it
 * away again if the feature goes (a level undone).
 */
export function syncSteelDefender(d: Character) {
  if (!hasSteelDefender(d)) {
    if (d.companions?.some((p) => p.derived === "steel-defender")) d.companions = d.companions.filter((p) => p.derived !== "steel-defender");
    return;
  }
  // Derived scores are cached per character object; read them from a copy taken now.
  const block = steelDefenderBlock(structuredClone(d));
  const list = d.companions ?? [];
  const existing = list.find((p) => p.derived === "steel-defender") ?? list.find((p) => /^steel defender$/i.test(p.name));
  if (!existing) {
    const p: Companion = {
      id: uid(), name: "Steel Defender", kind: "Medium construct", ac: block.ac, hp: { max: block.hp, current: block.hp, temp: 0 },
      speed: "40 ft", notes: "", role: "companion", monster: block, derived: "steel-defender",
    };
    d.companions = [...list, p];
    return;
  }
  // A level gained raises its maximum and current HP alike; damage taken stays taken.
  const gained = block.hp - existing.hp.max;
  existing.derived = "steel-defender";
  existing.ac = block.ac;
  existing.hp = { ...existing.hp, max: block.hp, current: Math.max(0, Math.min(block.hp, existing.hp.current + gained)) };
  existing.monster = block;
}
