import type { Character, Feature } from "./types";

/** What using something costs on your turn. "free" = no action (Action Surge, Reckless Attack…). */
export type ActionKind = "action" | "bonus" | "reaction" | "free" | "other";

export const KIND_SHORT: Record<ActionKind, string> = { action: "A", bonus: "BA", reaction: "R", free: "free", other: "—" };
export const KIND_LABEL: Record<ActionKind, string> = {
  action: "Action", bonus: "Bonus action", reaction: "Reaction", free: "No action", other: "Longer than an action",
};

/** From a spell's casting time: "1 bonus action" → bonus, "1 reaction, which you take when…" → reaction. */
export function kindFromCastingTime(t?: string): ActionKind {
  const s = (t ?? "1 action").toLowerCase();
  if (/bonus/.test(s)) return "bonus";
  if (/reaction/.test(s)) return "reaction";
  if (/^1 action|^action$/.test(s.trim())) return "action";
  return "other";
}

const PATTERNS: [ActionKind, RegExp][] = [
  ["bonus", /\b(?:as a|use a|using a|take a|with a|spend a|your) bonus action\b|\bbonus action (?:to|on your turn)\b/i],
  ["reaction", /\b(?:use|uses|using|take|spend) (?:your|its|a) reaction\b|\bas a reaction\b|\byour reaction to\b/i],
  ["action", /\b(?:as an|use an|using an|use your|take an|spend an|uses its) action\b|\baction to (?:magically|activate|use|channel|present|expend)\b|\btake the (?:attack|dash|disengage|dodge|help|hide|search) action\b/i],
];

/** Reads "as a bonus action", "use your reaction", "use your action to…" from a feature's text (earliest mention wins). */
export function kindFromText(text: string): ActionKind | undefined {
  let best: { kind: ActionKind; at: number } | undefined;
  for (const [kind, re] of PATTERNS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { kind, at: m.index };
  }
  return best?.kind;
}

/** Features whose action cost isn't clear from their text, or depends on your build. */
const KNOWN: { match: RegExp; kind: ActionKind | ((c: Character) => ActionKind) }[] = [
  { match: /^rage$/i, kind: "bonus" },
  { match: /^reckless attack$/i, kind: "free" },
  { match: /^action surge$/i, kind: "free" },
  { match: /^second wind$/i, kind: "bonus" },
  { match: /^bladesong$/i, kind: "bonus" },
  { match: /^(flurry of blows|patient defense|step of the wind)$/i, kind: "bonus" },
  { match: /^cunning action$/i, kind: "bonus" },
  { match: /^bardic inspiration$/i, kind: "bonus" },
  { match: /^uncanny dodge$/i, kind: "reaction" },
  { match: /^lay on hands$/i, kind: "action" },
  { match: /^divine sense$/i, kind: "action" },
  { match: /^channel divinity/i, kind: "action" },
  // Circle of the Moon's Combat Wild Shape makes it a bonus action.
  { match: /^wild shape$/i, kind: (c) => (c.features.some((f) => /^combat wild shape$/i.test(f.name)) || c.classes.some((k) => /moon/i.test(k.subclass?.name ?? "")) ? "bonus" : "action") },
  { match: /^(divine smite|sneak attack|extra attack|stunning strike|favored foe)$/i, kind: "free" },
];

export function featureKind(c: Character, f: Pick<Feature, "name" | "description">): ActionKind | undefined {
  const known = KNOWN.find((k) => k.match.test(f.name.trim()));
  if (known) return typeof known.kind === "function" ? known.kind(c) : known.kind;
  return kindFromText(f.description);
}

/** Attacks one Attack action allows (Extra Attack, Thirsting Blade). */
export function attacksPerAction(c: Character): number {
  const fighter = c.classes.find((k) => k.name.toLowerCase() === "fighter")?.level ?? 0;
  if (fighter >= 20) return 4;
  if (fighter >= 11) return 3;
  const has = (re: RegExp) => c.features.some((f) => re.test(f.name) || f.subfeatures?.some((s) => re.test(s.name)));
  return has(/^extra attack/i) || has(/^thirsting blade$/i) ? 2 : 1;
}

/**
 * Marks the action, bonus action or reaction as used while in combat, and returns a warning when
 * it was already spent or it isn't your turn. Logged in the combat log either way.
 */
export function spendEconomy(
  d: Character,
  kind: ActionKind | undefined,
  what: string,
  opts: { attack?: boolean; spellLevel?: number; attacksPerAction?: number } = {},
): string | undefined {
  const s = d.combat;
  if (!s?.active || !kind || kind === "other") return;
  const e = s.economy;
  let warning: string | undefined;
  const label = KIND_LABEL[kind].toLowerCase();
  if (kind === "free") {
    s.log.push({ round: s.round, text: what });
    return;
  }
  if (kind !== "reaction" && !s.myTurn) warning = `It isn't your turn: ${what} needs your ${label}.`;
  if (kind === "action" && opts.attack) {
    // Several attacks share one Attack action.
    const per = opts.attacksPerAction ?? attacksPerAction(d);
    if (e.action && (e.attacks ?? 0) > 0 && (e.attacks ?? 0) < per) {
      e.attacks = (e.attacks ?? 0) + 1;
      s.log.push({ round: s.round, text: `${what} (attack ${e.attacks}/${per})` });
      return warning;
    }
    if (e.action) warning ??= `Your action is already used this turn (${what}).`;
    e.action = true;
    e.attacks = 1;
    s.log.push({ round: s.round, text: `${what} (Attack action${per > 1 ? `, attack 1/${per}` : ""})` });
    if (warning) s.log.push({ round: s.round, text: `⚠ ${warning}` });
    return warning;
  }
  const key = kind === "bonus" ? "bonus" : kind === "reaction" ? "reaction" : "action";
  if (e[key]) warning ??= `Your ${label} is already used${kind === "reaction" ? " this round" : " this turn"} (${what}).`;
  // PHB: after a bonus-action spell, the only other spell you can cast that turn is an action cantrip.
  if (opts.spellLevel != null) {
    if (kind === "bonus") e.bonusSpell = true;
    if (kind === "action" && e.bonusSpell && opts.spellLevel > 0) warning ??= `You cast a bonus-action spell this turn, so your action spell must be a cantrip.`;
    if (kind === "bonus" && e.actionSpellLevel != null && e.actionSpellLevel > 0) warning ??= `You cast a leveled spell with your action, so you can't cast a bonus-action spell this turn.`;
    if (kind === "action") e.actionSpellLevel = opts.spellLevel;
  }
  e[key] = true;
  s.log.push({ round: s.round, text: `${what} (${label})` });
  if (warning) s.log.push({ round: s.round, text: `⚠ ${warning}` });
  return warning;
}

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };

/** A creature's Multiattack: "makes two attacks: one with its bite and one with its claws" → 2. */
export function multiattackCount(actions: { name: string; text: string }[]): number {
  const m = actions.find((a) => /^multiattack$/i.test(a.name))?.text.match(/makes (two|three|four|five|six|\d) (?:\w+ )?attacks/i);
  if (!m) return 1;
  return NUMBER_WORDS[m[1].toLowerCase()] ?? (Number(m[1]) || 1);
}
