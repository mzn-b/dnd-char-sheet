import { uid } from "./defaults";
import type { Attack } from "./types";

export const blankAttackFields = (): Attack => ({
  id: uid(), name: "", ability: "str", proficient: true, bonus: 0, damage: "", damageType: "", notes: "",
});
