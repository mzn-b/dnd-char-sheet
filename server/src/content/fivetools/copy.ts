/**
 * 5etools "_copy" entries describe a variant as "this other entry, with these changes": Variant Noble
 * (Knight), Centaur (MOT), the Baldur's Gate backgrounds… Resolve them into complete entries.
 *
 * Supported _mod operations on array properties (usually "entries"): replaceArr, insertArr, appendArr,
 * prependArr, removeArr, replaceTxt. Own keys override the copy; a null value removes the key.
 */

type Entry = Record<string, any>;

const lc = (s: unknown) => String(s ?? "").toLowerCase();
const entryName = (e: any) => (typeof e === "object" && e ? e.name : undefined);
const asList = (x: any) => (Array.isArray(x) ? x : x == null ? [] : [x]);

function applyOp(arr: any[], op: any): any[] {
  const items = asList(op.items);
  switch (op.mode) {
    case "appendArr":
      return [...arr, ...items];
    case "prependArr":
      return [...items, ...arr];
    case "insertArr": {
      const i = Math.max(0, Math.min(arr.length, op.index ?? arr.length));
      return [...arr.slice(0, i), ...items, ...arr.slice(i)];
    }
    case "replaceArr": {
      const target = op.replace;
      const i = typeof target === "object" && target?.index != null
        ? target.index
        : arr.findIndex((e) => (typeof e === "string" ? e === target : lc(entryName(e)) === lc(typeof target === "object" ? target.name ?? target.regex : target)));
      return i < 0 ? arr : [...arr.slice(0, i), ...items, ...arr.slice(i + 1)];
    }
    case "removeArr": {
      const names = asList(op.names ?? op.items).map((n: any) => lc(typeof n === "object" ? n.name : n));
      return arr.filter((e) => !names.includes(lc(typeof e === "string" ? e : entryName(e))));
    }
    case "replaceTxt": {
      let re: RegExp;
      try {
        re = new RegExp(op.replace, op.flags ?? "g");
      } catch {
        return arr;
      }
      const walk = (x: any): any => (typeof x === "string" ? x.replace(re, op.with ?? "") : Array.isArray(x) ? x.map(walk) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "name" ? v : walk(v)])) : x);
      return arr.map(walk);
    }
    default:
      return arr;
  }
}

/**
 * Resolve every _copy in `list`. `keyOf` identifies entries and `copyKey` the entry a _copy points to
 * (subraces also match on their race). Copies of copies resolve recursively.
 */
export function resolveCopies(list: Entry[], keyOf: (e: Entry) => string, copyKey: (c: Entry) => string = keyOf): Entry[] {
  const byKey = new Map(list.map((e) => [keyOf(e), e]));
  const done = new Map<Entry, Entry | null>();
  const resolve = (e: Entry, depth = 0): Entry | null => {
    if (!e._copy) return e;
    if (done.has(e)) return done.get(e)!;
    const baseRaw = byKey.get(copyKey(e._copy));
    const base = baseRaw && depth < 5 ? resolve(baseRaw, depth + 1) : null;
    if (!base) {
      done.set(e, null);
      return null;
    }
    const out: Entry = structuredClone(base);
    // A copy is its own entry: don't inherit the original's identity markers.
    delete out.srd;
    delete out.basicRules;
    for (const [prop, mods] of Object.entries(e._copy._mod ?? {})) {
      if (prop === "*" || prop === "_") continue;
      let arr = asList(out[prop]);
      for (const op of asList(mods)) arr = applyOp(arr, typeof op === "string" ? { mode: op } : op);
      out[prop] = arr;
    }
    for (const [k, v] of Object.entries(e)) {
      if (k === "_copy") continue;
      if (v === null) delete out[k];
      else out[k] = v;
    }
    done.set(e, out);
    return out;
  };
  return list.map((e) => resolve(e)).filter((e): e is Entry => !!e);
}
