import { scaledFeatureDice } from "./featureRolls";
import { EFFECTS, activateEffect, addEffect, endEffect, type Reminder } from "./combat";
import { featureDuration } from "./featureDuration";
import { featureKind, spendEconomy } from "./economy";
import { startWildShape } from "./extras";
import { classResources, type Resource } from "./resources";
import { usesMax } from "./uses";
import type { Character, CreatureRole, Feature } from "./types";
import type { Preset } from "./extras";

/** A follow-up question an action needs before it can happen. */
export type Decision =
  | { kind: "wildshape" }
  | { kind: "creature"; title: string; preset: Preset; role: CreatureRole; replace: boolean; source: string };

/** Spells that create a creature you pick (form, steed…). */
const SPELL_DECISIONS: { match: RegExp; decision: Omit<Extract<Decision, { kind: "creature" }>, "kind" | "source"> }[] = [
  { match: /^find familiar$/i, decision: { title: "Find Familiar: choose a form", preset: "familiar", role: "familiar", replace: true } },
  { match: /^find (greater )?steed$/i, decision: { title: "Find Steed: choose your steed", preset: "steed", role: "steed", replace: true } },
];

export function spellDecision(name: string): Decision | undefined {
  const d = SPELL_DECISIONS.find((x) => x.match.test(name.trim()));
  return d && { kind: "creature", ...d.decision, source: name };
}

export function featureDecision(f: Pick<Feature, "name">): Decision | undefined {
  return /^wild shape$/i.test(f.name.trim()) ? { kind: "wildshape" } : undefined;
}

/** Pools other features draw on, by the words their text uses: "expend one use of your Wild Shape". */
const POOL_WORDS: [RegExp, RegExp][] = [
  [/(?:expend|use) (?:a|one) use of (?:your )?wild shape|expend a use of this feature|as an action, you (?:can )?expend a use of your wild shape/i, /^wild shape$/i],
  [/(?:expend|use|spend) (?:a|one) (?:use of (?:your )?)?bardic inspiration|expend(?:ing)? one of your (?:uses of )?bardic inspiration/i, /^bardic inspiration$/i],
  [/(?:use|expend) (?:your|a use of your|one use of your) channel divinity/i, /^channel divinity$/i],
  [/expend (?:one|a) superiority die/i, /^superiority dice$/i],
  [/expend (?:one|a) psionic energy die/i, /^psionic energy dice$/i],
];

/** The class resource a feature spends and how much (Rage → barbarian:rage; Shadow Step costs nothing; Stunning Strike 1 ki). */
function resourceFor(c: Character, f: Pick<Feature, "name"> & { description?: string }): { res: Resource; cost: number } | undefined {
  const def = EFFECTS.find((e) => e.resource && e.activatedBy?.test(f.name));
  const resources = classResources(c);
  const own = resources.find((r) => r.id === def?.resource) ?? resources.find((r) => [r.name, ...(r.aliases ?? [])].some((a) => a.toLowerCase() === f.name.toLowerCase()));
  if (own) return { res: own, cost: 1 };
  const text = (f.description ?? "").replace(/\*/g, "");
  // Channel Divinity options ("Channel Divinity: Turn Undead", Harness Divine Power) spend Channel Divinity.
  if (/^channel divinity\b/i.test(f.name)) {
    const cd = resources.find((r) => /^channel divinity$/i.test(r.name));
    if (cd) return { res: cd, cost: 1 };
  }
  // Ki / sorcery point costs: "spend 1 ki point", "spend 2 sorcery points".
  const points = text.match(/spend (\d+|one|two|three) (ki|sorcery) points?/i);
  if (points) {
    const res = resources.find((r) => r.name.toLowerCase().startsWith(points[2].toLowerCase()));
    if (res) return { res, cost: Number(points[1]) || ({ one: 1, two: 2, three: 3 } as Record<string, number>)[points[1].toLowerCase()] || 1 };
  }
  for (const [words, pool] of POOL_WORDS) {
    if (!words.test(text)) continue;
    const res = resources.find((r) => pool.test(r.name));
    if (res) return { res, cost: 1 };
  }
  return undefined;
}

/** Uses left for a feature: from its class resource or its own use tracker; undefined = unlimited. */
export function usesLeft(c: Character, f: Feature): number | undefined {
  // Its own limit (Harness Divine Power 1/long rest) comes first; the pool it also draws on is checked when used.
  if (f.uses) return Math.max(0, usesMax(c, f.uses.formula, f.uses.max) - f.uses.used);
  const r = resourceFor(c, f);
  const left = (res: Resource, cost = 1) => (res.max >= 99 ? Infinity : Math.floor(Math.max(0, res.max - (c.resourcesUsed?.[res.id] ?? 0)) / cost));
  const harness = /harness divine power/i.test(f.name) ? classResources(c).find((x) => /^harness divine power$/i.test(x.name)) : undefined;
  const n = Math.min(r ? left(r.res, r.cost) : Infinity, harness ? left(harness) : Infinity);
  return n === Infinity ? undefined : n;
}

function spendUse(d: Character, f: Pick<Feature, "name" | "description">) {
  const own = d.features.find((x) => x.name === f.name && x.uses);
  if (own?.uses) own.uses.used = Math.min(usesMax(d, own.uses.formula, own.uses.max), own.uses.used + 1);
  const r = resourceFor(d, f);
  if (r) d.resourcesUsed = { ...d.resourcesUsed, [r.res.id]: (d.resourcesUsed?.[r.res.id] ?? 0) + r.cost };
  // Harness Divine Power has its own per-long-rest count on top of the Channel Divinity it spends.
  const harness = /harness divine power/i.test(f.name) && classResources(d).find((x) => /^harness divine power$/i.test(x.name));
  if (harness && harness.id !== r?.res.id) d.resourcesUsed = { ...d.resourcesUsed, [harness.id]: (d.resourcesUsed?.[harness.id] ?? 0) + 1 };
}

/**
 * Use a feature: pay its action cost in combat, spend a use, and start its combat effect
 * (Rage, Bladesong…). Returns a warning if the action economy was already spent.
 */
export function applyFeatureUse(d: Character, f: Feature): string | undefined {
  const warning = spendEconomy(d, featureKind(d, f), f.name);
  const def = EFFECTS.find((e) => e.label && e.activatedBy?.test(f.name));
  if (def && d.combat?.active) {
    activateEffect(d, def, def.label!); // spends its resource
    if (!def.resource) spendUse(d, f); // or the feature's own uses (Bladesong, Hexblade's Curse)
    return warning;
  }
  spendUse(d, f);
  // Features that last a while (Favored Foe: 1 minute, concentration) become active effects, like spells.
  const duration = featureDuration(f);
  if (duration) {
    if (duration.concentration) d.concentration = { name: f.name };
    if (d.combat?.active) {
      const hit = triggerReminders(d, f);
      addEffect(d, {
        id: f.id, name: f.name, source: "feature", startedRound: d.combat.round,
        rounds: duration.untilNextTurn ? null : duration.rounds, untilNextTurn: duration.untilNextTurn, concentration: duration.concentration,
        reminders: hit.length ? hit : [{ when: "always", text: `${f.name} is active` }],
      });
    }
  }
  return warning;
}

/** What to remember while a feature's effect lasts: its "when you hit…" style sentences. */
function triggerReminders(c: Character, f: Feature): Omit<Reminder, "source">[] {
  // Drop the "*1st-level ranger optional feature…*" line, then prefer the sentence with the extra dice.
  const text = f.description.replace(/^\*[^*\n]+\*\s*/, "").replace(/\*\*?|_/g, "").replace(/\s+/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+/);
  const withDice = sentences.find((s) => /\d*d\d+/.test(s) && /\b(?:hit|damage)\b/i.test(s));
  const trigger = sentences.find((s) => /\b(?:the first time|whenever|when) [^.]{0,60}you hit\b/i.test(s));
  const scaled = scaledFeatureDice(c, f.name);
  const hit = scaled && withDice ? withDice.replace(/\b\d+d\d+\b/, scaled) : withDice ?? trigger;
  return hit ? [{ when: "hit", text: `${f.name}: ${hit}` }] : [];
}

/** Stop a feature's effect early (and its concentration). */
export function endFeatureEffect(d: Character, f: Feature) {
  const e = d.combat?.effects.find((x) => x.name === f.name);
  if (e) endEffect(d, e.id);
  if (d.concentration?.name === f.name) d.concentration = null;
}

/** Wild Shape into a stored form: costs the action (bonus action for the Moon druid) and a use. */
export function wildShapeInto(d: Character, companionId: string): string | undefined {
  const f = d.features.find((x) => /^wild shape$/i.test(x.name)) ?? { id: "", name: "Wild Shape", origin: "", kind: "class" as const, description: "" };
  const form = d.companions?.find((p) => p.id === companionId);
  const warning = spendEconomy(d, featureKind(d, f), `Wild Shape into ${form?.name ?? "a beast"}`);
  spendUse(d, f);
  startWildShape(d, companionId);
  const def = EFFECTS.find((e) => e.label === "Wild Shape");
  if (def && d.combat?.active && !d.combat.effects.some((e) => e.name === "Wild Shape")) {
    d.combat.effects.push({ id: companionId, name: "Wild Shape", source: "feature", startedRound: d.combat.round, rounds: null, reminders: def.reminders });
  }
  return warning;
}
