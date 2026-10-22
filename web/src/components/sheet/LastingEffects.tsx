import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";

/** Spells running outside combat (Mage Armor), with a way to end them and a note when they do nothing. */
export function LastingEffects({ c, update }: { c: Character; update: Update }) {
  const list = c.lastingEffects ?? [];
  if (!list.length) return null;
  const armor = c.equipment.find((i) => i.equipped && i.data?.armor && i.data.armor.type !== "shield");
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {list.map((e) => (
        <span key={e.id} className="chip border-arcane-500 text-arcane-400">
          ✦ {e.name}
          <button className="ml-1 hover:text-blood-500" title={`End ${e.name}`} onClick={() => update((d) => void (d.lastingEffects = (d.lastingEffects ?? []).filter((x) => x.id !== e.id)))}>✕</button>
        </span>
      ))}
      {armor && list.some((e) => /^mage armor$/i.test(e.name)) && (
        <span className="text-accent-400">Mage Armor does nothing while you wear {armor.name}: unequip it on the Inventory tab.</span>
      )}
    </div>
  );
}
