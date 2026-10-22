import { useState } from "react";
import { abilityMod, hpMax, totalLevel } from "../../lib/rules";
import { classResources, resetResources } from "../../lib/resources";
import { featureParts } from "../../lib/featureSections";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { useRoll } from "../dice";
import { Modal } from "../ui";

/** What a short or long rest restores, applied to a draft. */
export function applyRest(d: Character, rest: "short" | "long") {
  resetResources(d, rest);
  for (const f of d.features) if (f.uses && (rest === "long" || f.uses.reset === "short")) f.uses.used = 0;
  for (const s of d.spellcasting.spells) {
    if (s.uses && (rest === "long" || /short/.test(s.uses))) s.usesSpent = 0;
    s.castCount = 0;
  }
  d.spellcasting.pactSlots.used = 0;
  // Tireless (Tasha's ranger): a short rest also removes one level of exhaustion.
  if (rest === "short" && featureParts(d).some((p) => /^tireless$/i.test(p.name))) d.exhaustion = Math.max(0, d.exhaustion - 1);
  if (rest === "long") {
    d.hp.current = hpMax(d);
    d.hp.temp = 0;
    d.deathSaves = { successes: 0, failures: 0 };
    d.exhaustion = Math.max(0, d.exhaustion - 1);
    d.concentration = null;
    d.combat = undefined;
    for (const s of d.spellcasting.slots) s.used = 0;
    // Regain spent hit dice up to half your total (minimum 1), largest dice first.
    let regain = Math.max(1, Math.floor(totalLevel(d) / 2));
    for (const die of Object.keys(d.hitDiceUsed).sort((a, b) => Number(b) - Number(a))) {
      const back = Math.min(regain, d.hitDiceUsed[die]);
      d.hitDiceUsed[die] -= back;
      regain -= back;
    }
  }
}

export function RestDialog({ c, update, kind, onClose }: { c: Character; update: Update; kind: "short" | "long"; onClose: () => void }) {
  const { roll } = useRoll();
  const [healed, setHealed] = useState(0);
  const [songUsed, setSongUsed] = useState(false);
  // Song of Rest (bard 2): d6, d8 at 9, d10 at 13, d12 at 17.
  const bard = c.classes.find((k) => k.name.toLowerCase() === "bard")?.level ?? 0;
  const songDie = bard >= 2 && featureParts(c).some((p) => /^song of rest$/i.test(p.name)) ? (bard >= 17 ? "d12" : bard >= 13 ? "d10" : bard >= 9 ? "d8" : "d6") : undefined;
  const con = abilityMod(c, "con");
  const dice = Object.entries(c.classes.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k.hitDie]: (acc[k.hitDie] ?? 0) + k.level }), {}));

  const spend = (die: string) => {
    const r = roll(`1d${die}${con >= 0 ? "+" : ""}${con}`, { label: `Hit die (d${die})`, kind: "heal" });
    // Durable: each hit die regains at least twice your Constitution modifier (minimum 2).
    const durable = c.features.some((f) => f.kind === "feat" && /^durable$/i.test(f.name));
    const gain = durable ? Math.max(r.total, Math.max(2, 2 * con)) : Math.max(0, r.total);
    setHealed((h) => h + gain);
    update((d) => {
      d.hitDiceUsed[die] = (d.hitDiceUsed[die] ?? 0) + 1;
      d.hp.current = Math.min(hpMax(d), d.hp.current + gain);
    });
  };

  const resets = classResources(c).filter((r) => kind === "long" || r.reset === "short").map((r) => r.name);
  const featureResets = c.features.filter((f) => f.uses && (kind === "long" || f.uses.reset === "short")).map((f) => f.name);
  const spellResets = c.spellcasting.spells.filter((s) => s.uses && (kind === "long" || /short/.test(s.uses))).map((s) => s.ref.name);

  // PHB: a long rest started at 0 hit points gives no benefits.
  const noBenefit = kind === "long" && c.hp.current <= 0;

  return (
    <Modal
      title={kind === "short" ? "☾ Short rest" : "☀ Long rest"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={noBenefit}
            title={noBenefit ? "You need at least 1 hit point at the start of a long rest to gain its benefits" : undefined}
            onClick={() => { update((d) => applyRest(d, kind)); onClose(); }}
          >
            {kind === "short" ? "Finish short rest & reset" : "Take long rest & reset everything"}
          </button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {noBenefit && <p className="rounded border border-blood-500/50 bg-blood-500/10 px-2 py-1 text-blood-500">You're at 0 HP: a long rest gives no benefits until you have at least 1 hit point.</p>}
        {kind === "short" ? (
          <>
            <p className="text-ink-400">Spend hit dice to heal (each die + Con {con >= 0 ? `+${con}` : con}). HP {c.hp.current} / {hpMax(c)}{healed ? <span className="text-emerald-400"> (+{healed} this rest)</span> : null}.</p>
            <div className="space-y-2">
              {dice.map(([die, total]) => {
                const left = total - (c.hitDiceUsed[die] ?? 0);
                return (
                  <div key={die} className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2">
                    <span><b>d{die}</b> <span className="text-ink-400">{left} of {total} left</span></span>
                    <button className="btn px-3 py-1" disabled={!left || c.hp.current >= hpMax(c)} onClick={() => spend(die)}>Spend 1</button>
                  </div>
                );
              })}
            </div>
            {songDie && (
              <div className="flex items-center justify-between rounded-lg border border-arcane-500/30 px-3 py-2">
                <span>Song of Rest: you (and allies who spend hit dice) regain an extra <b>1{songDie}</b></span>
                <button
                  className="btn px-3 py-1"
                  disabled={songUsed || !healed}
                  title={healed ? "Roll the extra healing" : "Spend at least one hit die first"}
                  onClick={() => {
                    const r = roll(`1${songDie}`, { label: "Song of Rest", kind: "heal" });
                    setSongUsed(true);
                    setHealed((h) => h + r.total);
                    update((d) => void (d.hp.current = Math.min(hpMax(d), d.hp.current + r.total)));
                  }}
                >
                  Roll 1{songDie}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-ink-400">
            Regain all hit points and spell slots, up to {Math.max(1, Math.floor(totalLevel(c) / 2))} spent hit dice, and reduce exhaustion by 1. Concentration ends.
          </p>
        )}
        {(resets.length > 0 || featureResets.length > 0 || spellResets.length > 0 || c.spellcasting.pactSlots.max > 0) && (
          <div>
            <p className="label mb-1">Resets</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {resets.length > 0 && <li>Class resources: {resets.join(", ")}</li>}
              {featureResets.length > 0 && <li>Features & feats: {featureResets.join(", ")}</li>}
              {spellResets.length > 0 && <li>Spell uses: {spellResets.join(", ")}</li>}
              {c.spellcasting.pactSlots.max > 0 && <li>Pact Magic slots</li>}
              {kind === "long" && c.spellcasting.slots.some((s) => s.max) && <li>All spell slots</li>}
              <li>Cast counters</li>
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
