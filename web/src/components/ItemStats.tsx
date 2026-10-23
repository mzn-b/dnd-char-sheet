import { useQuery } from "@tanstack/react-query";
import { itemDetailByName } from "../lib/items";
import type { Ability } from "../lib/types";

const mod = (score: number) => Math.floor((score - 10) / 2);
const fmt = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

/**
 * What an item does, in one line: a weapon's damage and the ability it uses (with these scores), armor's
 * AC with its Stealth and Strength drawbacks, a pack's contents.
 */
export function ItemStats({ name, scores, label }: { name: string; scores?: Record<Ability, number>; label?: string }) {
  const { data } = useQuery({ queryKey: ["itemByName", name.toLowerCase()], queryFn: () => itemDetailByName(name), staleTime: Infinity, retry: false });
  const item = data?.item;
  if (!item) return null;
  const parts: React.ReactNode[] = [];
  const w = item.weapon;
  if (w) {
    const props = w.properties.map((p) => p.toLowerCase());
    const thrown = props.some((p) => p.startsWith("thrown"));
    const str = scores ? mod(scores.str) : undefined;
    const dex = scores ? mod(scores.dex) : undefined;
    // PHB: melee uses Strength, ranged Dexterity; finesse lets you pick the better one.
    const ability: { label: string; value?: number } = w.finesse
      ? { label: "STR or DEX", value: str != null && dex != null ? Math.max(str, dex) : undefined }
      : w.ranged ? { label: "DEX", value: dex } : { label: "STR", value: str };
    parts.push(<span key="dmg" className="text-blood-500">{w.damage} {w.damageType}</span>);
    if (w.versatile) parts.push(<span key="v">{w.versatile} two-handed</span>);
    parts.push(
      <span key="ab" className="text-accent-400" title={w.finesse ? "Finesse: use the better of Strength and Dexterity for attack and damage" : w.ranged ? "Ranged weapons use Dexterity" : thrown ? "Thrown melee weapons use Strength (Dexterity if finesse)" : "Melee weapons use Strength"}>
        {ability.label}{ability.value != null ? ` (${fmt(ability.value)})` : ""}
      </span>,
    );
    const shown = w.properties.filter((p) => !/^versatile/i.test(p));
    if (shown.length) parts.push(<span key="p">{shown.join(", ")}</span>);
    if (w.range) parts.push(<span key="r">range {w.range}</span>);
  }
  const a = item.armor;
  if (a) {
    if (a.type === "shield") parts.push(<span key="ac" className="text-sky-300">+{a.base} AC</span>);
    else {
      const dex = scores ? mod(scores.dex) : undefined;
      const dexPart = a.type === "light" ? dex : a.type === "medium" && dex != null ? Math.min(2, dex) : undefined;
      parts.push(
        <span key="ac" className="text-sky-300">
          AC {a.base}{a.type === "light" ? " + DEX" : a.type === "medium" ? " + DEX (max 2)" : ""}
          {dexPart != null && a.type !== "heavy" ? ` = ${a.base + dexPart}` : ""}
        </span>,
        <span key="t">{a.type} armor</span>,
      );
    }
    if (a.stealthDisadvantage) parts.push(<span key="st" className="text-blood-500">Stealth disadvantage</span>);
    if (a.strength) {
      const short = scores && scores.str < a.strength;
      parts.push(<span key="str" className={short ? "text-blood-500" : ""} title="Below this Strength your speed drops by 10 feet">needs STR {a.strength}{short ? ` (you have ${scores!.str}: −10 ft speed)` : ""}</span>);
    }
  }
  if (item.contents?.length) parts.push(<span key="c">contains {item.contents.map((x) => `${x.qty > 1 ? `${x.qty} ` : ""}${x.name}`).join(", ")}</span>);
  if (item.attunement) parts.push(<span key="att">requires attunement</span>);
  if (!parts.length) return null;
  return (
    <span className="flex flex-wrap gap-x-2 text-[11px] text-ink-400">
      {label && <span className="text-ink-200">{label}:</span>}
      {parts.map((p, i) => <span key={i} className="whitespace-nowrap">{i > 0 && <span className="mr-2 text-ink-700">·</span>}{p}</span>)}
    </span>
  );
}
