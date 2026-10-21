import type { Character } from "../../lib/types";
import { Section } from "../ui";

export function HistoryTab({ c }: { c: Character }) {
  return (
    <Section title="Level History">
      {c.levelHistory.length === 0 && <p className="text-sm text-ink-600">Choices made in the level-up wizard are recorded here.</p>}
      <ol className="relative space-y-4 border-l border-ink-700 pl-5">
        {[...c.levelHistory].reverse().map((h, i) => (
          <li key={i}>
            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-accent-500" />
            <div className="flex items-baseline gap-2">
              <span className="font-display text-ink-200">{h.className} {h.level}</span>
              <span className="text-xs text-ink-600">{new Date(h.at).toLocaleString()}</span>
            </div>
            <ul className="mt-1 list-disc pl-4 text-sm text-ink-400">
              <li>+{h.hpGained} max HP</li>
              {h.summary.map((s, j) => <li key={j}>{s}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </Section>
  );
}
