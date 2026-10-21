import { EFFECTS, activateEffect } from "./combat";
import { featureKind, spendEconomy } from "./economy";
import { startWildShape } from "./extras";
import { classResources } from "./resources";
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

/** The class resource a feature spends (Rage → barbarian:rage), if the app tracks one. */
function resourceFor(c: Character, f: Pick<Feature, "name">) {
  const def = EFFECTS.find((e) => e.resource && e.activatedBy?.test(f.name));
  const resources = classResources(c);
  return resources.find((r) => r.id === def?.resource) ?? resources.find((r) => r.name.toLowerCase() === f.name.toLowerCase());
}

/** Uses left for a feature: from its class resource or its own use tracker; undefined = unlimited. */
export function usesLeft(c: Character, f: Feature): number | undefined {
  const res = resourceFor(c, f);
  if (res) return res.max >= 99 ? undefined : Math.max(0, res.max - (c.resourcesUsed?.[res.id] ?? 0));
  if (f.uses) return Math.max(0, f.uses.max - f.uses.used);
  return undefined;
}

function spendUse(d: Character, f: Pick<Feature, "name">) {
  const res = resourceFor(d, f);
  if (res) d.resourcesUsed = { ...d.resourcesUsed, [res.id]: (d.resourcesUsed?.[res.id] ?? 0) + 1 };
  else {
    const own = d.features.find((x) => x.name === f.name && x.uses);
    if (own?.uses) own.uses.used = Math.min(own.uses.max, own.uses.used + 1);
  }
}

/**
 * Use a feature: pay its action cost in combat, spend a use, and start its combat effect
 * (Rage, Bladesong…). Returns a warning if the action economy was already spent.
 */
export function applyFeatureUse(d: Character, f: Feature): string | undefined {
  const warning = spendEconomy(d, featureKind(d, f), f.name);
  const def = EFFECTS.find((e) => e.label && e.activatedBy?.test(f.name));
  if (def && d.combat?.active) activateEffect(d, def, def.label!); // spends its resource
  else spendUse(d, f);
  return warning;
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
