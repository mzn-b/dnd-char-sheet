import type { Character } from "../../lib/types";
import type { Update } from "../../lib/useCharacter";
import { Section, TextArea, TextField } from "../ui";

const DETAILS = ["age", "height", "weight", "eyes", "skin", "hair"] as const;
const PERSONALITY = [
  ["traits", "Personality Traits"],
  ["ideals", "Ideals"],
  ["bonds", "Bonds"],
  ["flaws", "Flaws"],
] as const;

export function BioTab({ c, update }: { c: Character; update: Update }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-4">
        <Section title="Portrait">
          <div className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-ink-850">
            {c.portraitUrl ? <img src={c.portraitUrl} alt={c.name} className="h-full w-full object-cover" /> : <span className="font-display text-6xl text-ink-700">{c.name.charAt(0)}</span>}
          </div>
          <TextField className="field-boxed text-xs" placeholder="Image URL" value={c.portraitUrl} onChange={(v) => update((d) => void (d.portraitUrl = v))} />
        </Section>
        <Section title="Details">
          <div className="grid grid-cols-2 gap-2">
            {DETAILS.map((k) => (
              <label key={k} className="space-y-0.5">
                <span className="label capitalize">{k}</span>
                <TextField className="field-boxed" value={c.details[k]} onChange={(v) => update((d) => void (d.details[k] = v))} />
              </label>
            ))}
          </div>
        </Section>
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {PERSONALITY.map(([k, title]) => (
            <Section key={k} title={title}>
              <TextArea rows={3} value={c.personality[k]} onChange={(v) => update((d) => void (d.personality[k] = v))} />
            </Section>
          ))}
        </div>
        <Section title="Character Appearance">
          <TextArea rows={3} value={c.details.appearance} onChange={(v) => update((d) => void (d.details.appearance = v))} />
        </Section>
        <Section title="Character Backstory">
          <TextArea rows={8} value={c.details.backstory} onChange={(v) => update((d) => void (d.details.backstory = v))} />
        </Section>
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Allies & Organizations">
            <TextField className="field-boxed mb-2" placeholder="Faction name / symbol" value={c.details.factionName} onChange={(v) => update((d) => void (d.details.factionName = v))} />
            <TextArea rows={5} value={c.details.allies} onChange={(v) => update((d) => void (d.details.allies = v))} />
          </Section>
          <Section title="Additional Features & Traits">
            <TextArea rows={7} value={c.details.additionalFeatures} onChange={(v) => update((d) => void (d.details.additionalFeatures = v))} />
          </Section>
        </div>
        <Section title="Session Notes">
          <TextArea rows={8} value={c.notes} onChange={(v) => update((d) => void (d.notes = v))} />
        </Section>
      </div>
    </div>
  );
}
