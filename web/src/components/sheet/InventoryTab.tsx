import { useState } from "react";
import { api } from "../../lib/api";
import { uid } from "../../lib/defaults";
import { attackFromItem, itemFromDetail, resolveItem } from "../../lib/items";
import { genericOptions } from "../../lib/genericItems";
import { attunedCount, carrying } from "../../lib/rules";
import { itemActive, targetLabel } from "../../lib/modifiers";
import type { Character, ContentSummary, Item } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ContentDetailView, ContentPicker } from "../ContentBrowser";
import { Modal, NumberField, Pips, Section, TextField } from "../ui";

const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;
const COIN_VALUE_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

export function InventoryTab({ c, update }: { c: Character; update: Update }) {
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);
  const load = carrying(c);
  const totalWeight = load.weight;
  const capacity = load.capacity;
  const attuned = attunedCount(c);
  const wealthGp = COINS.reduce((s, k) => s + c.currency[k] * COIN_VALUE_CP[k], 0) / 100;
  const edit = (id: string, patch: Partial<Item>) => update((d) => void Object.assign(d.equipment.find((i) => i.id === id)!, patch));

  const addFromRules = async (picked: ContentSummary[]) => {
    const details = await Promise.all(picked.map((p) => api.detail("item", p.source, p.key)));
    update((d) => void d.equipment.push(...details.map((det) => itemFromDetail(det))));
    setPicking(false);
  };

  /** Replace one unit of a placeholder ("Any simple melee weapon") with the real item, ready to attack with. */
  const choosePlaceholder = async (placeholder: Item, name: string) => {
    const real = await resolveItem(name, 1);
    const attack = real.data?.weapon ? await attackFromItem(c, real, true) : null;
    update((d) => {
      const ph = d.equipment.find((x) => x.id === placeholder.id);
      if (!ph) return;
      const same = d.equipment.find((x) => x.name === real.name && x.ref?.key === real.ref?.key);
      if (same) same.qty += 1;
      else d.equipment.splice(d.equipment.indexOf(ph), 0, real);
      if (ph.qty > 1) ph.qty -= 1;
      else d.equipment = d.equipment.filter((x) => x.id !== ph.id);
      if (attack && !d.attacks.some((a) => a.name === real.name)) d.attacks.push({ ...attack, itemId: same?.id ?? real.id });
    });
  };

  const makeAttack = async (item: Item) => {
    const attack = await attackFromItem(c, item);
    update((d) => void d.attacks.push(attack));
  };

  /** Equipping body armor unequips other body armor (and likewise for shields). */
  const toggleEquip = (item: Item, on: boolean) =>
    update((d) => {
      const kind = item.data?.armor?.type === "shield" ? "shield" : item.data?.armor ? "armor" : null;
      for (const other of d.equipment) {
        if (!on || other.id === item.id || !kind) continue;
        const otherKind = other.data?.armor?.type === "shield" ? "shield" : other.data?.armor ? "armor" : null;
        if (otherKind === kind) other.equipped = false;
      }
      d.equipment.find((i) => i.id === item.id)!.equipped = on;
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Section
        title="Equipment"
        action={
          <div className="flex items-center gap-1">
            <span className={`mr-2 text-xs ${attuned > 3 ? "text-blood-500" : "text-ink-400"}`} title="Attuned magic items">✦ {attuned}/3 attuned</span>
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
        <div className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_1fr_auto] gap-1 px-1 text-[10px] uppercase tracking-wider text-ink-600">
          <span title="Equipped / worn">Eq</span><span>Item</span><span>Qty</span><span>Wt</span><span>Notes</span><span />
        </div>
        {c.equipment.length === 0 && <p className="p-2 text-sm text-ink-600">Your pack is empty.</p>}
        {c.equipment.map((i) => (
          <div key={i.id} className="grid grid-cols-[2rem_1fr_3.5rem_3.5rem_1fr_auto] items-center gap-1 rounded px-1 py-0.5 hover:bg-ink-850">
            <input type="checkbox" className="accent-accent-500" checked={i.equipped} onChange={(e) => toggleEquip(i, e.target.checked)} />
            <div className="min-w-0">
              <TextField value={i.name} placeholder="Item name" onChange={(v) => edit(i.id, { name: v })} />
              {genericOptions(i.name) && !i.ref && (
                <select
                  className="field-boxed mx-1.5 my-0.5 w-auto py-0.5 text-xs"
                  value=""
                  aria-label={`Choose ${i.name}`}
                  onChange={(e) => e.target.value && choosePlaceholder(i, e.target.value)}
                >
                  <option value="">Choose {i.qty > 1 ? "one" : "which"}…</option>
                  {genericOptions(i.name)!.map((n) => <option key={n}>{n}</option>)}
                </select>
              )}
              <div className="flex flex-wrap gap-1 px-1.5 text-[10px] text-ink-400">
                {i.data?.armor && <span className="chip px-1.5 py-0">{i.data.armor.type === "shield" ? `+${i.data.armor.base} AC` : `AC ${i.data.armor.base} ${i.data.armor.type}`}</span>}
                {i.data?.weapon && <span className="chip px-1.5 py-0">{i.data.weapon.damage} {i.data.weapon.damageType}</span>}
                {i.data?.rarity && <span className="chip px-1.5 py-0 capitalize">{i.data.rarity}</span>}
                {i.charges && (
                  <span className="flex items-center gap-1">charges <Pips max={i.charges.max} used={i.charges.used} onChange={(u) => edit(i.id, { charges: { ...i.charges!, used: u } })} /></span>
                )}
              </div>
            </div>
            <NumberField value={i.qty} min={0} onChange={(n) => edit(i.id, { qty: n })} />
            <NumberField value={i.weight} min={0} onChange={(n) => edit(i.id, { weight: n })} />
            <TextField value={i.notes} placeholder="—" onChange={(v) => edit(i.id, { notes: v })} />
            <div className="flex gap-0.5">
              {i.attunement && (
                <button
                  className={`btn-ghost px-1.5 py-0.5 text-xs ${i.attuned ? "text-accent-400" : "text-ink-600"}`}
                  title={i.attuned ? "Attuned (click to end attunement)" : "Requires attunement (click to attune)"}
                  onClick={() => edit(i.id, { attuned: !i.attuned })}
                >
                  ✦
                </button>
              )}
              <button
                className="btn-ghost px-1.5 py-0.5 text-xs"
                title="Item options"
                onClick={() => setViewing(i)}
              >
                ⓘ
              </button>
              <button className="btn-ghost px-1.5 py-0.5 text-[11px]" title="Create an attack from this item" onClick={() => makeAttack(i)}>+Atk</button>
              <button className="btn-ghost px-1.5 py-0.5 text-xs hover:text-blood-500" title="Remove" onClick={() => update((d) => void (d.equipment = d.equipment.filter((x) => x.id !== i.id)))}>✕</button>
            </div>
          </div>
        ))}
        <div className="mt-3 flex flex-wrap justify-end gap-x-4 text-xs text-ink-400">
          {load.mode === "variant" && (
            <span className={load.encumbered ? "text-blood-500" : ""} title={`Encumbered over ${load.light} lb (−10 ft), heavily over ${load.heavy} lb (−20 ft, disadvantage on Str/Dex/Con rolls)`}>
              {load.encumbered === 2 ? "Heavily encumbered" : load.encumbered === 1 ? "Encumbered" : "Unencumbered"}
            </span>
          )}
          <span className={totalWeight > capacity && load.mode !== "off" ? "text-blood-500" : ""}>Carrying {totalWeight.toFixed(1)} / {capacity} lb</span>
          <span title="Push, drag or lift">Push/drag/lift {capacity * 2} lb</span>
        </div>
      </Section>

      <div className="space-y-4">
        <Section title="Currency" action={<span className="text-xs text-ink-400">≈ {wealthGp.toFixed(2)} gp</span>}>
          <div className="grid grid-cols-5 gap-1 text-center">
            {COINS.map((coin) => (
              <label key={coin} className="space-y-1">
                <span className="label block">{coin}</span>
                <NumberField className="field-boxed px-1 text-center" value={c.currency[coin]} min={0} onChange={(n) => update((d) => void (d.currency[coin] = n))} />
              </label>
            ))}
          </div>
          <CoinQuickAdd update={update} />
        </Section>
        <Section title="Treasure">
          <textarea className="field-boxed resize-y" rows={6} value={c.details.treasure} onChange={(e) => update((d) => void (d.details.treasure = e.target.value))} />
        </Section>
      </div>

      {picking && <ContentPicker title="Add equipment" type="item" onClose={() => setPicking(false)} onConfirm={addFromRules} />}
      {viewing && (
        <Modal title={viewing.name} onClose={() => setViewing(null)}>
          <div className="space-y-4">
            {viewing.ref && <ContentDetailView type="item" item={viewing.ref} />}
            <ItemBonusInfo item={c.equipment.find((i) => i.id === viewing.id) ?? viewing} onRefresh={async () => {
              if (!viewing.ref) return;
              const det = await api.detail("item", viewing.ref.source, viewing.ref.key);
              edit(viewing.id, { data: det.item, attunement: det.item?.attunement || viewing.attunement });
            }} />
            <div className="grid gap-3 border-t border-ink-800 pt-3 text-sm sm:grid-cols-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="accent-accent-500" checked={!!viewing.attunement} onChange={(e) => { edit(viewing.id, { attunement: e.target.checked }); setViewing({ ...viewing, attunement: e.target.checked }); }} />
                Requires attunement
              </label>
              <label className="flex items-center gap-2">
                Charges
                <NumberField className="field-boxed w-16" value={viewing.charges?.max ?? 0} min={0} onChange={(n) => { const charges = n ? { max: n, used: Math.min(viewing.charges?.used ?? 0, n) } : undefined; edit(viewing.id, { charges }); setViewing({ ...viewing, charges }); }} />
              </label>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** "+15 gp" / "-3 sp" style quick adjustments. */
function CoinQuickAdd({ update }: { update: Update }) {
  const [text, setText] = useState("");
  const apply = () => {
    const m = text.trim().match(/^([+-]?\d+)\s*(cp|sp|ep|gp|pp)$/i);
    if (!m) return;
    const coin = m[2].toLowerCase() as (typeof COINS)[number];
    update((d) => void (d.currency[coin] = Math.max(0, d.currency[coin] + Number(m[1]))));
    setText("");
  };
  return (
    <form className="mt-2 flex gap-1" onSubmit={(e) => { e.preventDefault(); apply(); }}>
      <input className="field-boxed text-sm" placeholder="+25 gp or -3 sp" value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn px-2 text-xs">Apply</button>
    </form>
  );
}

/** What an item adds automatically, and a way to re-fetch its rules data (for items added before bonuses existed). */
function ItemBonusInfo({ item, onRefresh }: { item: Item; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const b = item.data?.bonuses;
  const rows = Object.entries(b ?? {}).flatMap(([k, v]) =>
    typeof v === "number" ? [`${targetLabel(k === "save" ? "save" : k)} ${v >= 0 ? "+" : ""}${v}`] : Object.entries(v ?? {}).map(([a, n]) => `${a.toUpperCase()} ${k === "abilitySet" ? `becomes ${n}` : `+${n}`}`),
  );
  return (
    <div className="rounded-lg border border-ink-800 p-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="label">Automatic bonuses</span>
        {item.ref && (
          <button className="btn-ghost ml-auto px-2 py-0.5 text-xs" disabled={busy} onClick={async () => { setBusy(true); await onRefresh().finally(() => setBusy(false)); }}>
            {busy ? "Refreshing…" : "↻ Refresh rules data"}
          </button>
        )}
      </div>
      {rows.length ? (
        <>
          <p className="mt-1">{rows.join(" · ")}</p>
          <p className={`mt-1 text-xs ${itemActive(item) ? "text-emerald-400" : "text-ink-600"}`}>
            {itemActive(item) ? "Active — applied to your sheet." : item.attunement && !item.attuned ? "Inactive until you attune to it." : "Inactive until equipped."}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-ink-600">None detected. Add a custom modifier on the Features tab if this item grants one.</p>
      )}
    </div>
  );
}
