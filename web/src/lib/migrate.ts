import { syncSteelDefender } from "./steelDefender";
import { splitFeature } from "./featureSections";
import { applyDetectedUses } from "./uses";
import type { Character } from "./types";

/** Bring characters saved by older versions up to date. */
export function migrateCharacter(c: Character): Character {
  // Bundled subclass entries become one feature per section (with their own use counters).
  if (c.features.some((f) => splitFeature(f).length > 1)) {
    c.features = c.features.flatMap((f) => {
      const parts = splitFeature(f);
      if (parts.length > 1) for (const p of parts) applyDetectedUses(c, p);
      return parts;
    });
  }
  // Companions a feature gives you (Steel Defender) follow your level and scores.
  syncSteelDefender(c);
  return c;
}
