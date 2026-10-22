import { useQuery } from "@tanstack/react-query";
import { planResync } from "../../lib/resync";
import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { Modal } from "../ui";

/** Preview what re-reading the rules would change on this sheet, then apply it. */
export function ResyncDialog({ c, update, onClose }: { c: Character; update: Update; onClose: () => void }) {
  // Plan once per open: the plan is based on the sheet as it was when the dialog opened.
  const plan = useQuery({ queryKey: ["resync", c.id, c.updatedAt], queryFn: () => planResync(c), staleTime: Infinity, gcTime: 0 });
  const apply = () => {
    if (!plan.data) return;
    update((d) => plan.data.apply(d));
    onClose();
  };
  return (
    <Modal
      title="Resync with current rules"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!plan.data} onClick={apply}>
            {plan.data && !plan.data.changes.length ? "Mark as up to date" : "Apply"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-400">
        Re-reads your race, background, feats, class and subclass features and class tables from the current rules data.
        Your choices, spells, items, notes, HP rolls and uses spent are kept. You can undo this afterwards (↶ / Ctrl+Z).
      </p>
      {plan.isLoading && <p className="text-sm text-ink-400">Checking…</p>}
      {plan.error && <p className="text-sm text-blood-500">Couldn't load the rules: {String((plan.error as Error).message ?? plan.error)}</p>}
      {plan.data &&
        (plan.data.changes.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {plan.data.changes.map((ch, i) => <li key={i}>{ch}</li>)}
          </ul>
        ) : (
          <p className="text-sm">Everything already matches the current rules.</p>
        ))}
    </Modal>
  );
}
