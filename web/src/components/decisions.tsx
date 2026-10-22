import { createContext, useContext, useState, type ReactNode } from "react";
import { ROLE_LABEL, wildShapeLimits } from "../lib/extras";
import { wildShapeInto, type Decision } from "../lib/featureUse";
import { addCompanion } from "../lib/combat";
import type { Character, Companion } from "../lib/types";
import type { Update } from "../lib/useCharacter";
import { MonsterPicker } from "./MonsterPicker";
import { Modal } from "./ui";

const DecisionContext = createContext<(d: Decision) => void>(() => {});

/** Ask the follow-up question an action needs ("Which beast?"), from anywhere on the sheet. */
export const useDecision = () => useContext(DecisionContext);

export function DecisionProvider({ c, update, children }: { c: Character; update: Update; children: ReactNode }) {
  const [open, setOpen] = useState<Decision | null>(null);
  const [warning, setWarning] = useState<string>();
  const close = () => setOpen(null);
  return (
    <DecisionContext.Provider value={setOpen}>
      {children}
      {open?.kind === "wildshape" && (
        <WildShapeChooser
          c={c}
          onClose={close}
          onChoose={(id) => {
            let w: string | undefined;
            update((d) => void (w = wildShapeInto(d, id)));
            setWarning(w);
            close();
          }}
          onAddAndChoose={(p) => {
            let w: string | undefined;
            update((d) => {
              addCompanion(d, p);
              w = wildShapeInto(d, p.id);
            });
            setWarning(w);
            close();
          }}
        />
      )}
      {open?.kind === "creature" && (
        <MonsterPicker
          c={c}
          preset={open.preset}
          lockPreset
          title={open.title}
          addLabel={open.replace ? `Choose as your ${ROLE_LABEL[open.role].toLowerCase()}` : undefined}
          onClose={close}
          onAdd={(p) =>
            update((d) => {
              const replaced = open.replace ? (d.companions ?? []).filter((x) => x.role === open.role) : [];
              d.companions = (d.companions ?? []).filter((x) => !replaced.includes(x));
              addCompanion(d, { ...p, role: open.role, notes: replaced[0]?.notes ?? p.notes });
            })
          }
        />
      )}
      {warning && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-accent-600 bg-ink-900 px-4 py-2 text-sm text-accent-400 shadow-xl" role="status">
          ⚠ {warning} <button className="ml-2 underline" onClick={() => setWarning(undefined)}>OK</button>
        </div>
      )}
    </DecisionContext.Provider>
  );
}

const speedText = (p: Companion) => p.speed || "—";

/** Wild Shape: pick one of your stored forms, or find a new beast allowed at your level. */
function WildShapeChooser({ c, onClose, onChoose, onAddAndChoose }: {
  c: Character;
  onClose: () => void;
  onChoose: (id: string) => void;
  onAddAndChoose: (p: Companion) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const forms = (c.companions ?? []).filter((p) => p.role === "wildshape");
  const limits = wildShapeLimits(c);
  if (browsing || !forms.length) {
    return (
      <MonsterPicker
        c={c}
        preset="wildshape"
        lockPreset
        title="Wild Shape: choose a beast"
        addLabel="Wild Shape into it"
        onClose={() => (forms.length ? setBrowsing(false) : onClose())}
        onAdd={(p) => onAddAndChoose({ ...p, role: "wildshape" })}
      />
    );
  }
  return (
    <Modal title="Wild Shape: which beast?" onClose={onClose}>
      <div className="space-y-3">
        {limits && <p className="text-xs text-ink-400">{limits.label}.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {forms.map((p) => (
            <button key={p.id} className="rounded-lg border border-ink-800 p-3 text-left hover:border-emerald-600" onClick={() => onChoose(p.id)}>
              <div className="font-display text-lg">{p.name}</div>
              <div className="text-xs text-ink-400">{p.kind}</div>
              <div className="mt-1 text-xs">AC {p.ac} · HP {p.hp.max} · {speedText(p)}</div>
            </button>
          ))}
        </div>
        <button className="btn w-full" onClick={() => setBrowsing(true)}>Find another beast…</button>
      </div>
    </Modal>
  );
}
