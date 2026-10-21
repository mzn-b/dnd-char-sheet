import { useState } from "react";
import { api } from "../../lib/api";
import { levelDown, planLevelDown } from "../../lib/levelDown";
import { XP_THRESHOLDS, totalLevel } from "../../lib/rules";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { Modal } from "../ui";

/** Confirm and undo the most recent level-up. */
export function LevelDownDialog({ c, update, onClose }: { c: Character; update: Update; onClose: () => void }) {
  const plan = planLevelDown(c);
  const [busy, setBusy] = useState(false);
  const [lowerXp, setLowerXp] = useState(false);
  const [error, setError] = useState("");
  if (!plan) {
    return (
      <Modal title="Level down" onClose={onClose}>
        <p className="text-sm text-ink-400">There's no recorded level-up to undo. Levels set by hand can be changed in the class editor (click the class line under your name).</p>
      </Modal>
    );
  }
  const { record } = plan;
  const newTotal = totalLevel(c) - 1;
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      // The best-effort path recomputes spell slots from the class's progression.
      const k = c.classes.find((x) => x.key === record.classKey);
      const rules = !plan.exact && k ? await api.classRules(k.source, k.key).catch(() => undefined) : undefined;
      update((d) => levelDown(d, { rules, lowerXp }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Level down: ${record.className} ${record.level} → ${record.level - 1}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-danger" disabled={busy || !plan.canLevelDown} onClick={confirm}>{busy ? "Undoing…" : "Level down"}</button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {!plan.canLevelDown && <p className="text-blood-500">{plan.reason}</p>}
        <p className="text-ink-400">
          Undoes your most recent level-up ({new Date(record.at).toLocaleDateString()}). Your character becomes level {newTotal}.
          Current HP, inventory, coins, notes, creatures and spell uses are kept.
        </p>
        <div>
          <div className="label mb-1">Removed</div>
          <ul className="list-disc space-y-0.5 pl-5">{plan.removes.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
        <p className={plan.exact ? "text-emerald-400" : "text-accent-400"}>
          {plan.exact ? "Exact: your build is restored to how it was right before this level." : "Best effort:"}
        </p>
        {plan.warnings.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-accent-400">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
        {c.xp >= XP_THRESHOLDS[Math.max(0, newTotal)] && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-accent-500" checked={lowerXp} onChange={(e) => setLowerXp(e.target.checked)} />
            Also lower XP to {XP_THRESHOLDS[Math.max(0, newTotal - 1)].toLocaleString()} (the start of level {newTotal})
          </label>
        )}
        {error && <p className="text-blood-500">{error}</p>}
      </div>
    </Modal>
  );
}
