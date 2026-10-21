import { SKILLS } from "./rules";
import type { Character } from "./types";

/**
 * A random v4 UUID. crypto.randomUUID only exists on HTTPS or localhost, so this builds one from
 * crypto.getRandomValues, which also works on plain HTTP (e.g. a home cluster without TLS).
 */
export const uid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

export function newCharacter(name = "New Adventurer"): Character {
  return {
    name,
    playerName: "",
    classes: [],
    race: "",
    background: "",
    alignment: "",
    xp: 0,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    skills: Object.fromEntries(SKILLS.map((s) => [s.key, 0])),
    inspiration: false,
    profBonusOverride: null,
    proficienciesAndLanguages: "",
    armorClass: 10,
    initiativeBonus: 0,
    speed: 30,
    hp: { max: 0, current: 0, temp: 0 },
    hitDiceUsed: {},
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    exhaustion: 0,
    attacks: [],
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    personality: { traits: "", ideals: "", bonds: "", flaws: "" },
    features: [],
    details: {
      age: "", height: "", weight: "", eyes: "", skin: "", hair: "",
      appearance: "", backstory: "", allies: "", factionName: "", additionalFeatures: "", treasure: "",
    },
    portraitUrl: "",
    spellcasting: {
      slots: Array.from({ length: 9 }, () => ({ max: 0, used: 0 })),
      pactSlots: { max: 0, used: 0, level: 0 },
      spells: [],
    },
    notes: "",
    levelHistory: [],
    acMode: "auto",
    acBonus: 0,
    resourcesUsed: {},
    concentration: null,
    senses: "",
    journal: [],
    companions: [],
    progression: "xp",
  };
}

/** Fill in any fields missing from older saves or hand-edited imports. */
export function normalizeCharacter(raw: Partial<Character>): Character {
  const base = newCharacter();
  return {
    ...base,
    ...raw,
    abilities: { ...base.abilities, ...raw.abilities },
    skills: { ...base.skills, ...raw.skills },
    hp: { ...base.hp, ...raw.hp },
    deathSaves: { ...base.deathSaves, ...raw.deathSaves },
    currency: { ...base.currency, ...raw.currency },
    personality: { ...base.personality, ...raw.personality },
    details: { ...base.details, ...raw.details },
    spellcasting: { ...base.spellcasting, ...raw.spellcasting },
    // Older saves predate automatic AC: keep their typed value.
    acMode: raw.acMode ?? "manual",
  } as Character;
}
