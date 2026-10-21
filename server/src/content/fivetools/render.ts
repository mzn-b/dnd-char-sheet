/**
 * Converts 5etools "entries" (nested JSON with {@tag ...} inline markup) into the
 * small markdown subset the client renders: paragraphs, **bold**, *italic*, "- " lists, | tables |.
 */

const TAG_RE = /\{@(\w+)\s?([^{}]*)\}/;

export function renderTags(text: string): string {
  let out = text;
  // Tags can nest ({@b {@spell x}}), so resolve innermost first until none remain.
  for (let guard = 0; TAG_RE.test(out) && guard < 200; guard++) {
    out = out.replace(TAG_RE, (_m, tag: string, body: string) => renderTag(tag, body));
  }
  return out;
}

function renderTag(tag: string, body: string): string {
  const parts = body.split("|");
  switch (tag) {
    case "b": case "bold": return `**${parts[0]}**`;
    case "i": case "italic": return `*${parts[0]}*`;
    case "dc": return `DC ${parts[0]}`;
    case "hit": return Number(parts[0]) >= 0 ? `+${parts[0]}` : parts[0];
    case "h": return "*Hit:* ";
    case "m": return "*Miss:* ";
    case "atk": return `*${parts[0].split(",").map((a) => ATK[a.trim()] ?? a).join(" or ")}:*`;
    case "recharge": return `(Recharge ${parts[0] || 6}${parts[0] && parts[0] !== "6" ? "–6" : ""})`;
    case "chance": return `${parts[0]} percent`;
    case "scaledice": case "scaledamage": return parts[2] ?? parts[0];
    case "dice": case "damage": case "d20": return parts[1] || parts[0];
    case "note": return `*${parts[0]}*`;
    case "5etools": case "filter": case "link": return parts[0];
    // Reference tags: {@spell name|source|display text}
    default: return parts[2] || parts[0];
  }
}

const ATK: Record<string, string> = {
  mw: "Melee Weapon Attack", rw: "Ranged Weapon Attack", ms: "Melee Spell Attack", rs: "Ranged Spell Attack",
};

export function renderEntries(entries: unknown, depth = 0): string {
  if (entries == null) return "";
  if (typeof entries === "string") return renderTags(entries);
  if (Array.isArray(entries)) return entries.map((e) => renderEntries(e, depth)).filter(Boolean).join("\n\n");
  const e = entries as any;
  switch (e.type) {
    case "entries":
    case "section":
    case "inset":
    case "insetReadaloud":
    case "variant":
    case "variantInner":
    case "variantSub": {
      const body = renderEntries(e.entries, depth + 1);
      return e.name ? `**${renderTags(e.name)}.** ${body}` : body;
    }
    case "quote":
      return `*${renderEntries(e.entries, depth + 1)}*${e.by ? ` — ${e.by}` : ""}`;
    case "list":
      return (e.items ?? [])
        .map((it: any) => `- ${typeof it === "string" ? renderTags(it) : renderListItem(it)}`)
        .join("\n");
    case "item":
    case "itemSub":
    case "itemSpell":
      return renderListItem(e);
    case "table":
      return renderTable(e);
    case "options":
      return (e.entries ?? []).map((o: any) => `- ${refName(o) ?? renderEntries(o, depth + 1)}`).join("\n");
    case "refOptionalfeature":
    case "refClassFeature":
    case "refSubclassFeature":
    case "refFeat":
      return `- ${refName(e)}`;
    case "abilityDc":
      return `**Spell save DC** = 8 + your proficiency bonus + your ${(e.attributes ?? []).join("/")} modifier`;
    case "abilityAttackMod":
      return `**Spell attack modifier** = your proficiency bonus + your ${(e.attributes ?? []).join("/")} modifier`;
    case "image":
    case "gallery":
    case "hr":
      return "";
    default:
      if (e.entries) return renderEntries(e.entries, depth + 1);
      if (e.entry) return renderEntries(e.entry, depth + 1);
      return "";
  }
}

function renderListItem(it: any): string {
  const body = renderEntries(it.entry ?? it.entries ?? "");
  return it.name ? `**${renderTags(it.name)}** ${body}` : body;
}

function renderTable(t: any): string {
  const cell = (c: any) => (typeof c === "string" || typeof c === "number" ? renderTags(String(c)) : renderEntries(c.roll ? `${c.roll.min ?? c.roll.exact}–${c.roll.max ?? c.roll.exact}` : c.entry ?? c));
  const lines: string[] = [];
  if (t.colLabels) lines.push(`| ${t.colLabels.map(cell).join(" | ")} |`);
  for (const row of t.rows ?? []) lines.push(`| ${(Array.isArray(row) ? row : row.row ?? []).map(cell).join(" | ")} |`);
  return (t.caption ? `**${t.caption}**\n\n` : "") + lines.join("\n");
}

/** Display name of a ref entry, e.g. {type:"refOptionalfeature", optionalfeature:"Archery|PHB"}. */
export function refName(e: any): string | undefined {
  const raw = e?.optionalfeature ?? e?.classFeature ?? e?.subclassFeature ?? e?.feat;
  return typeof raw === "string" ? raw.split("|")[0] : undefined;
}

/** Strip all markup to plain text (for short labels). */
export const plain = (s: string) => renderTags(s).replace(/\*/g, "");
