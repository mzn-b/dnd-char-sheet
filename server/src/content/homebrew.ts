import { pool } from "../db.js";
import type { ContentDetail, ContentSummary, ContentType } from "./types.js";

interface Row {
  id: string;
  type: ContentType;
  name: string;
  data: Partial<ContentDetail>;
}

export function toDetail(r: Row): ContentDetail {
  return {
    description: "",
    meta: {},
    ...r.data,
    source: "homebrew",
    key: r.id,
    type: r.type,
    name: r.name,
    sourceLabel: "Homebrew",
  };
}

export async function listHomebrew(type: ContentType, opts: { cls?: string }): Promise<ContentSummary[]> {
  const { rows } = await pool.query<Row>("SELECT id, type, name, data FROM homebrew WHERE type = $1 ORDER BY name", [type]);
  return rows
    .map(toDetail)
    .filter((d) => !opts.cls || !d.classes?.length || d.classes.some((c) => c.toLowerCase() === opts.cls))
    .map(({ source, key, type, name, level, classes, sourceLabel }) => ({ source, key, type, name, level, classes, sourceLabel }));
}

export async function getHomebrew(key: string): Promise<ContentDetail | undefined> {
  const { rows } = await pool.query<Row>("SELECT id, type, name, data FROM homebrew WHERE id = $1", [key]);
  return rows[0] && toDetail(rows[0]);
}
