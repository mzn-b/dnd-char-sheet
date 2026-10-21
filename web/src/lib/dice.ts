/** Dice expressions like "1d20+5", "2d6 + 3", "8d6", "1d8+1d6-1". */

export interface DieResult {
  sides: number;
  value: number;
  /** Dropped by advantage/disadvantage. */
  dropped?: boolean;
}

export interface RollResult {
  id: string;
  label: string;
  expression: string;
  total: number;
  dice: DieResult[];
  modifier: number;
  mode: RollMode;
  kind: RollKind;
  /** Natural 20 / natural 1 on the d20. */
  crit?: boolean;
  fumble?: boolean;
  at: number;
}

export type RollMode = "normal" | "advantage" | "disadvantage";
export type RollKind = "check" | "save" | "attack" | "damage" | "heal" | "other";

const TERM = /([+-]?)\s*(\d*)d(\d+)|([+-]?)\s*(\d+)/gi;

export const rollDie = (sides: number) => 1 + Math.floor(Math.random() * sides);

export function roll(expression: string, opts: { label?: string; mode?: RollMode; kind?: RollKind; critical?: boolean } = {}): RollResult {
  const mode = opts.mode ?? "normal";
  const dice: DieResult[] = [];
  let modifier = 0;
  let total = 0;
  let firstD20: DieResult | undefined;
  for (const m of expression.replace(/\s+/g, "").matchAll(TERM)) {
    if (m[3]) {
      const sign = m[1] === "-" ? -1 : 1;
      // Critical hits roll every damage die twice.
      const count = (Number(m[2] || 1)) * (opts.critical ? 2 : 1);
      const sides = Number(m[3]);
      for (let i = 0; i < count; i++) {
        if (sides === 20 && count === 1 && mode !== "normal" && !firstD20) {
          const a: DieResult = { sides, value: rollDie(20) };
          const b: DieResult = { sides, value: rollDie(20) };
          const keepA = mode === "advantage" ? a.value >= b.value : a.value <= b.value;
          (keepA ? b : a).dropped = true;
          dice.push(a, b);
          firstD20 = keepA ? a : b;
          total += sign * firstD20.value;
        } else {
          const d = { sides, value: rollDie(sides) };
          if (sides === 20 && !firstD20) firstD20 = d;
          dice.push(d);
          total += sign * d.value;
        }
      }
    } else if (m[5]) {
      const n = (m[4] === "-" ? -1 : 1) * Number(m[5]);
      modifier += n;
      total += n;
    }
  }
  return {
    id: crypto.randomUUID(),
    label: opts.label ?? expression,
    expression,
    total,
    dice,
    modifier,
    mode,
    kind: opts.kind ?? "other",
    crit: firstD20?.value === 20,
    fumble: firstD20?.value === 1,
    at: Date.now(),
  };
}

export const d20 = (bonus: number) => `1d20${bonus >= 0 ? "+" : ""}${bonus}`;

/** "1d8" + 3 → "1d8+3"; keeps expressions readable. */
export const withBonus = (dice: string, bonus: number) => (bonus ? `${dice}${bonus > 0 ? "+" : ""}${bonus}` : dice);

export const isDiceExpression = (s: string) => /\d*d\d+/i.test(s);
