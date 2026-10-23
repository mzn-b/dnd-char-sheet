import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { uid } from "../../lib/defaults";
import { attackFromItem, itemFromDetail, resolveItem } from "../../lib/items";
import { genericOptions } from "../../lib/genericItems";
import { attunedCount, attunementMax, carrying } from "../../lib/rules";
import { itemActive, targetLabel } from "../../lib/modifiers";
import { infuse, infusedCount, infusionRule, knownInfusions, maxInfusedItems, uninfuse } from "../../lib/infusions";
import type { Character, ContentSummary, Item, PackItem } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { ContentDetailView, ContentPicker } from "../ContentBrowser";
import { Modal, NumberField, Pips, Section, TextField } from "../ui";

const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;
/**
 * Inventory columns, shared by the header and every row (each row is its own grid). Text columns can shrink
 * below their content and the buttons column has a fixed width, so a long name or an extra button
 * (attunement) doesn't shift a row out of line.
 */
const ROW_COLS = "grid-cols-[2rem_minmax(0,1fr)_3.5rem_3.5rem_minmax(0,1fr)_9rem]";
const COIN_VALUE_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

export function InventoryTab({ c, update }: { c: Character; update: Update }) {
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<Item | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const load = carrying(c);
  const totalWeight = load.weight;
  const capacity = load.capacity;
  const attuned = attunedCount(c);
  const wealthGp = COINS.reduce((s, k) => s + c.currency[k] * COIN_VALUE_CP[k], 0) / 100;
  const infusions = knownInfusions(c);
  const infusedMax = maxInfusedItems(c);
  const infused = infusedCount(c);
  const setInfusion = (id: string, name: string) =>
    update((d) => {
      const it = d.equipment.find((x) => x.id === id)!;
      if (name) infuse(it, name);
      else uninfuse(it);
    });
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

  /** Swap one pack for the items inside it, adding to ones already carried. */
  const unpack = async (pack: Item, contents: PackItem[]) => {
    const items = await Promise.all(
      contents.map(async (e) => {
        const det = e.ref ? await api.detail("item", e.ref.source, e.ref.key).catch(() => null) : null;
        return det ? { ...itemFromDetail(det, e.qty), name: e.name } : { id: uid(), name: e.name, qty: e.qty, weight: 0, equipped: false, notes: "" };
      }),
    );
    update((d) => {
      const p = d.equipment.find((x) => x.id === pack.id);
      if (!p) return;
      let at = d.equipment.indexOf(p);
      for (const it of items) {
        const same = d.equipment.find((x) => x.name.toLowerCase() === it.name.toLowerCase() && !x.data?.contents);
        if (same) same.qty += it.qty;
        else d.equipment.splice(++at, 0, it);
      }
      if (p.qty > 1) p.qty -= 1;
      else d.equipment = d.equipment.filter((x) => x.id !== p.id);
    });
    setOpen((o) => { const n = new Set(o); n.delete(pack.id); return n; });
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
            {infusedMax > 0 && (infusions.length ? (
              <span className={`mr-2 text-xs ${infused > infusedMax ? "text-blood-500" : "text-arcane-400"}`} title="Infused items (Infuse Item). Use ✧ on an item to infuse it.">✧ {infused}/{infusedMax} infused</span>
            ) : (
              <span className="mr-2 text-xs text-ink-400" title="Infusions are chosen when you level up (Infusions). On an older sheet, add them on the Features tab.">✧ no infusions known</span>
            ))}
            <span className={`mr-2 text-xs ${attuned > attunementMax(c) ? "text-blood-500" : "text-ink-400"}`} title="Attuned magic items">✦ {attuned}/{attunementMax(c)} attuned</span>
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
        <div className={`grid ${ROW_COLS} gap-1 px-1 text-[10px] uppercase tracking-wider text-ink-600`}>
          <span title="Equipped / worn">Eq</span><span>Item</span><span className="text-center">Qty</span><span className="text-center">Wt</span><span>Notes</span><span />
        </div>
        {c.equipment.length === 0 && <p className="p-2 text-sm text-ink-600">Your pack is empty.</p>}
        {c.equipment.map((i) => (
          <div key={i.id} className={`grid ${ROW_COLS} items-center gap-1 rounded px-1 py-0.5 hover:bg-ink-850`}>
            <input type="checkbox" className="accent-accent-500" checked={i.equipped} onChange={(e) => toggleEquip(i, e.target.checked)} />
            <div className="min-w-0">
              <div className="flex items-center">
                {isPack(i) && (
                  <button
                    className="btn-ghost shrink-0 px-1 py-0 text-xs text-ink-400"
                    title={open.has(i.id) ? "Hide contents" : "Show what's inside"}
                    aria-expanded={open.has(i.id)}
                    onClick={() => toggleOpen(i.id)}
                  >
                    {open.has(i.id) ? "▾" : "▸"}
                  </button>
                )}
                <TextField value={i.name} placeholder="Item name" onChange={(v) => edit(i.id, { name: v })} />
              </div>
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
                {i.infusion && <span className="chip border-arcane-500/60 px-1.5 py-0 text-arcane-400" title="Artificer infusion">✧ {i.infusion.name}</span>}
                {i.charges && (
                  <span className="flex items-center gap-1">charges <Pips max={i.charges.max} used={i.charges.used} onChange={(u) => edit(i.id, { charges: { ...i.charges!, used: u } })} /></span>
                )}
              </div>
            </div>
            <NumberField className="field text-center" value={i.qty} min={0} onChange={(n) => edit(i.id, { qty: n })} />
            <NumberField className="field text-center" value={i.weight} min={0} onChange={(n) => edit(i.id, { weight: n })} />
            <TextField value={i.notes} placeholder="—" onChange={(v) => edit(i.id, { notes: v })} />
            <div className="flex justify-end gap-0.5">
              {infusions.length > 0 && (
                <InfuseMenu item={i} known={infusions.map((x) => x.name)} full={infused >= infusedMax} onPick={(name) => setInfusion(i.id, name)} />
              )}
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
            {isPack(i) && open.has(i.id) && <PackContents item={i} edit={edit} onUnpack={unpack} />}
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

/** Put a known infusion into an item (only ones it can hold), or take it out. */
function InfuseMenu({ item, known, full, onPick }: { item: Item; known: string[]; full: boolean; onPick: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (name: string) => {
    onPick(name);
    setOpen(false);
  };
  return (
    <span className="relative">
      <button
        className={`btn-ghost px-1.5 py-0.5 text-xs ${item.infusion ? "text-arcane-400" : "text-arcane-400/60 hover:text-arcane-400"}`}
        title={item.infusion ? `Infused: ${item.infusion.name}` : "Infuse this item"}
        onClick={() => setOpen(!open)}
      >
        ✧
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-ink-700 bg-ink-900 p-1 text-xs shadow-xl" onMouseLeave={() => setOpen(false)}>
          <div className="px-2 py-1 text-ink-400">Infuse {item.name || "this item"}</div>
          {known.map((name) => {
            const rule = infusionRule(name);
            const fits = !rule || rule.fits(item);
            const current = item.infusion?.name === name;
            const blocked = !fits || (full && !item.infusion);
            return (
              <button
                key={name}
                disabled={blocked || current}
                className={`block w-full rounded px-2 py-1 text-left hover:bg-ink-800 disabled:opacity-50 disabled:hover:bg-transparent ${current ? "text-arcane-400" : ""}`}
                onClick={() => pick(name)}
              >
                {current ? "✓ " : ""}{name}
                {!fits ? <span className="ml-1 text-ink-600">needs {rule!.target}</span> : full && !item.infusion ? <span className="ml-1 text-ink-600">all infusions in use</span> : null}
              </button>
            );
          })}
          {item.infusion && (
            <button className="block w-full rounded px-2 py-1 text-left text-blood-500 hover:bg-ink-800" onClick={() => pick("")}>Remove infusion</button>
          )}
        </div>
      )}
    </span>
  );
}

/** Equipment packs and other containers sold full: their contents can be listed and unpacked. */
const isPack = (i: Item) => !!i.data?.contents?.length || /\bpack\b/i.test(i.name);

/** A pack's contents, looked up (and remembered on the item) for items added before contents were recorded. */
function PackContents({ item, edit, onUnpack }: { item: Item; edit: (id: string, patch: Partial<Item>) => void; onUnpack: (pack: Item, contents: PackItem[]) => Promise<void> }) {
  const contents = item.data?.contents;
  const [state, setState] = useState<"idle" | "loading" | "missing" | "unpacking">("idle");
  useEffect(() => {
    if (contents?.length || state !== "idle") return;
    setState("loading");
    (async () => {
      const det = item.ref
        ? await api.detail("item", item.ref.source, item.ref.key).catch(() => null)
        : await resolveItem(item.name, item.qty).then((r) => (r.ref ? api.detail("item", r.ref.source, r.ref.key) : null)).catch(() => null);
      if (det?.item?.contents?.length) {
        edit(item.id, {
          data: { ...item.data, ...det.item },
          ref: item.ref ?? { source: det.source, key: det.key, name: det.name, type: "item" },
          ...(!item.weight && det.item.weight ? { weight: det.item.weight } : {}),
          // Older sheets stored "Burglar'S Pack".
          ...(item.name.toLowerCase() === det.name.toLowerCase() ? { name: det.name } : {}),
        });
        setState("idle");
      } else setState("missing");
    })();
  }, [contents, state, item, edit]);
  return (
    <div className="col-span-full mb-1 ml-10 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2 text-sm">
      {contents?.length ? (
        <>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {contents.map((e, k) => (
              <li key={k} className="flex gap-2">
                <span className="w-8 shrink-0 text-right tabular-nums text-ink-400">{e.qty}×</span>
                <span>{e.name}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="btn px-2 py-0.5 text-xs"
              disabled={state === "unpacking"}
              title="Replace the pack with the separate items, so you can track rations, torches and the like"
              onClick={async () => { setState("unpacking"); await onUnpack(item, contents).finally(() => setState("idle")); }}
            >
              {state === "unpacking" ? "Unpacking…" : item.qty > 1 ? "Unpack one" : "Unpack into separate items"}
            </button>
          </div>
        </>
      ) : state === "missing" ? (
        <p className="text-xs text-ink-600">No contents listed for this item in the rules data.</p>
      ) : (
        <p className="text-xs text-ink-400">Looking up contents…</p>
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
