import { useState } from "react";
import { api } from "../../lib/api";
import { uid } from "../../lib/defaults";
import type { Character, ContentSummary, Item } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ContentDetailView, ContentPicker } from "../ContentBrowser";
import { Modal, NumberField, Section, TextField } from "../ui";
import { blankAttack } from "./AttacksPanel";

const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;

export function InventoryTab({ c, update }: { c: Character; update: Update }) {
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);
  const totalWeight = c.equipment.reduce((s, i) => s + i.qty * i.weight, 0);
  const capacity = c.abilities.str * 15;
  const edit = (id: string, patch: Partial<Item>) => update((d) => void Object.assign(d.equipment.find((i) => i.id === id)!, patch));

  const addFromRules = async (picked: ContentSummary[]) => {
    const details = await Promise.all(picked.map((p) => api.detail("item", p.source, p.key)));
    update((d) => {
      for (const det of details) {
        d.equipment.push({
          id: uid(), name: det.name, qty: 1, weight: parseFloat(det.meta.Weight ?? "0") || 0, equipped: false, notes: "",
          ref: { source: det.source, key: det.key, name: det.name, type: "item" },
        });
      }
    });
    setPicking(false);
  };

  const makeAttack = async (item: Item) => {
    const det = item.ref ? await api.detail("item", item.ref.source, item.ref.key) : null;
    const [dice, ...type] = (det?.meta.Damage ?? "").split(" ");
    const finesse = /finesse/i.test(det?.meta.Properties ?? "");
    const ranged = /ranged/i.test(det?.meta.Category ?? "") || /ammunition/i.test(det?.meta.Properties ?? "");
    update((d) =>
      void d.attacks.push({
        ...blankAttack(), name: item.name, damage: dice ?? "", damageType: type.join(" ").toLowerCase(),
        ability: ranged || (finesse && d.abilities.dex > d.abilities.str) ? "dex" : "str",
        notes: det?.meta.Properties ?? "",
      }),
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Section
        title="Equipment"
        action={
          <div className="flex gap-1">
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setPicking(true)}>Browse items</button>
            <button
              className="btn-ghost px-2 py-0.5 text-xs"
              onClick={() => update((d) => void d.equipment.push({ id: uid(), name: "", qty: 1, weight: 0, equipped: false, notes: "" }))}
            >
              + Custom
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-[2rem_1fr_4rem_4rem_1fr_auto] gap-1 px-1 text-[10px] uppercase tracking-wider text-ink-600">
          <span title="Equipped">Eq</span><span>Item</span><span>Qty</span><span>Wt (lb)</span><span>Notes</span><span />
        </div>
        {c.equipment.length === 0 && <p className="p-2 text-sm text-ink-600">Your pack is empty.</p>}
        {c.equipment.map((i) => (
          <div key={i.id} className="grid grid-cols-[2rem_1fr_4rem_4rem_1fr_auto] items-center gap-1 rounded px-1 hover:bg-ink-850">
            <input type="checkbox" className="accent-accent-500" checked={i.equipped} onChange={(e) => edit(i.id, { equipped: e.target.checked })} />
            <TextField value={i.name} placeholder="Item name" onChange={(v) => edit(i.id, { name: v })} />
            <NumberField value={i.qty} min={0} onChange={(n) => edit(i.id, { qty: n })} />
            <NumberField value={i.weight} min={0} onChange={(n) => edit(i.id, { weight: n })} />
            <TextField value={i.notes} placeholder="—" onChange={(v) => edit(i.id, { notes: v })} />
            <div className="flex gap-0.5">
              {i.ref && <button className="btn-ghost px-1.5 py-0.5 text-xs" title="Details" onClick={() => setViewing(i)}>ⓘ</button>}
              <button className="btn-ghost px-1.5 py-0.5 text-xs" title="Create attack from this item" onClick={() => makeAttack(i)}>⚔</button>
              <button className="btn-ghost px-1.5 py-0.5 text-xs hover:text-blood-500" title="Remove" onClick={() => update((d) => void (d.equipment = d.equipment.filter((x) => x.id !== i.id)))}>✕</button>
            </div>
          </div>
        ))}
        <p className={`mt-3 text-right text-xs ${totalWeight > capacity ? "text-blood-500" : "text-ink-400"}`}>
          Carrying {totalWeight.toFixed(1)} / {capacity} lb
        </p>
      </Section>

      <div className="space-y-4">
        <Section title="Currency">
          <div className="grid grid-cols-5 gap-1 text-center">
            {COINS.map((coin) => (
              <label key={coin} className="space-y-1">
                <span className="label block">{coin}</span>
                <NumberField className="field-boxed px-1 text-center" value={c.currency[coin]} min={0} onChange={(n) => update((d) => void (d.currency[coin] = n))} />
              </label>
            ))}
          </div>
        </Section>
        <Section title="Treasure">
          <textarea className="field-boxed resize-y" rows={6} value={c.details.treasure} onChange={(e) => update((d) => void (d.details.treasure = e.target.value))} />
        </Section>
      </div>

      {picking && (
        <ContentPicker title="Add equipment" type="item" onClose={() => setPicking(false)} onConfirm={addFromRules} />
      )}
      {viewing?.ref && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <ContentDetailView type="item" item={viewing.ref} />
        </Modal>
      )}
    </div>
  );
}
