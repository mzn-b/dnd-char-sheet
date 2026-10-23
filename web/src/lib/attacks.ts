import { featureParts } from "./featureSections";
import { isMagicWeapon, weaponItem } from "./modifiers";
import { abilityMod } from "./rules";
import { uid } from "./defaults";
import type { Attack, Character } from "./types";

export const blankAttackFields = (): Attack => ({
  id: uid(), name: "", ability: "str", proficient: true, bonus: 0, damage: "", damageType: "", notes: "",
});

/**
 * The ability an attack uses. Battle Smith's Battle Ready (Tasha's): with a magic weapon you can use
 * Intelligence instead of Strength or Dexterity, so it's used whenever it's better.
 */
export function attackAbility(c: Character, a: Attack): { ability: Attack["ability"]; reason?: string } {
  if (a.ability !== "str" && a.ability !== "dex") return { ability: a.ability };
  const battleReady = featureParts(c).some((p) => /^battle ready$/i.test(p.name));
  if (!battleReady || !isMagicWeapon(weaponItem(c, a))) return { ability: a.ability };
  return abilityMod(c, "int") > abilityMod(c, a.ability) ? { ability: "int", reason: `Battle Ready: Intelligence instead of ${a.ability === "str" ? "Strength" : "Dexterity"} with a magic weapon` } : { ability: a.ability };
}
