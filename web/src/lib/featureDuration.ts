import { featureSections } from "./featureSections";
import type { Feature } from "./types";

/** How long a feature's effect lasts once used (Favored Foe: 1 minute, concentration). */
export interface FeatureDuration {
  /** Rounds it lasts; null = until ended. */
  rounds: number | null;
  untilNextTurn?: boolean;
  concentration?: boolean;
  /** Short label, e.g. "1 min", "10 rounds", "until your next turn". */
  label: string;
}

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, ten: 10 };
const UNIT_ROUNDS: Record<string, number> = { round: 1, minute: 10, hour: 600 };

/** Reads "for 1 minute", "for 10 minutes or until…", "until the start of your next turn", concentration. */
export function durationFromText(text: string): FeatureDuration | undefined {
  const plain = text.replace(/\*\*?|_/g, " ").replace(/\s+/g, " ");
  const concentration = /until you lose (?:your )?concentration|as if (?:you were )?concentrating|requires? concentration|\(concentration\)/i.test(plain);
  const timed = plain.match(/\bfor (a|an|one|two|three|ten|\d+) (round|minute|hour)s?\b/i);
  if (timed) {
    const n = NUM[timed[1].toLowerCase()] ?? Number(timed[1]);
    const unit = timed[2].toLowerCase();
    const rounds = n * UNIT_ROUNDS[unit];
    // Long effects (an hour or more) aren't tracked round by round in combat.
    const label = unit === "round" ? `${n} round${n > 1 ? "s" : ""}` : unit === "minute" ? `${n} min` : `${n} hr`;
    return { rounds: rounds >= 600 ? null : rounds, concentration, label };
  }
  if (/until the (?:start|end) of your next turn/i.test(plain)) return { rounds: null, untilNextTurn: true, concentration, label: "until your next turn" };
  if (concentration) return { rounds: null, concentration, label: "concentration" };
  return undefined;
}

/** Duration of a feature (or the part of it with the same name, for features nested in a subclass entry). */
export function featureDuration(f: Pick<Feature, "name" | "description">): FeatureDuration | undefined {
  const sections = featureSections(f);
  const own = sections.find((s) => s.name === f.name) ?? sections[0];
  return durationFromText(own?.text || f.description || "");
}
