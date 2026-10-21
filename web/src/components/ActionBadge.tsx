import { KIND_LABEL, KIND_SHORT, type ActionKind } from "../lib/economy";

const STYLE: Record<ActionKind, string> = {
  action: "border-accent-600/60 text-accent-400",
  bonus: "border-emerald-700 text-emerald-400",
  reaction: "border-sky-700 text-sky-300",
  free: "border-ink-700 text-ink-400",
  other: "border-ink-700 text-ink-400",
};

/** "A" / "BA" / "R" chip saying what using something costs. */
export function ActionBadge({ kind, detail }: { kind?: ActionKind; detail?: string }) {
  if (!kind) return null;
  return (
    <span className={`inline-block rounded border px-1 text-[10px] font-semibold leading-4 ${STYLE[kind]}`} title={detail ? `${KIND_LABEL[kind]}: ${detail}` : KIND_LABEL[kind]}>
      {KIND_SHORT[kind]}
    </span>
  );
}
