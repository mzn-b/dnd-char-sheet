import { Router } from "express";
import { pool } from "../db.js";
import { getProviders, setProviders } from "../content/settings.js";
import { brewCatalog, brewFileUrl, datasetState, invalidateDataset, getDataset, DATA_URL } from "../content/fivetools/data.js";
import { cachedFetch, HttpError, within } from "../content/http.js";
import { excludedDocuments, listDocuments, setExcludedDocuments } from "../content/open5e.js";
import { searchWithWarnings } from "../content/index.js";

/** Content-provider settings and the 5etools homebrew library. */
export const sources = Router();

sources.get("/providers", async (_req, res) => {
  res.json({ ...(await getProviders()), fivetoolsDataUrl: DATA_URL });
});

sources.put("/providers", async (req, res) => {
  const { srd, open5e, "5etools": fivetools } = req.body ?? {};
  const next = await setProviders(
    Object.fromEntries(Object.entries({ srd, open5e, "5etools": fivetools }).filter(([, v]) => typeof v === "boolean")),
  );
  if (next["5etools"]) getDataset().catch(() => {}); // warm the cache
  res.json(next);
});

/** Content types a character is built from; the book filter applies to these (not items or monsters). */
const BOOK_TYPES = ["race", "class", "subclass", "background", "feat", "spell", "feature"] as const;
let booksCache: { at: number; data: BookInfo[]; complete: boolean } | null = null;
interface BookInfo { label: string; provider: string; counts: Record<string, number> }

/** Every book (source label) that has character options, with how many of each it adds. */
sources.get("/books", async (_req, res) => {
  if (booksCache && booksCache.complete && Date.now() - booksCache.at < 10 * 60_000) return void res.json({ books: booksCache.data, warnings: [] });
  const byLabel = new Map<string, BookInfo>();
  const warnings = new Set<string>();
  for (const type of BOOK_TYPES) {
    const { results, warnings: w } = await searchWithWarnings(type, {});
    w.forEach((x) => warnings.add(x));
    for (const r of results) {
      const label = r.sourceLabel ?? (r.source === "homebrew" ? "Homebrew" : r.source);
      const info = byLabel.get(label) ?? { label, provider: r.source, counts: {} };
      info.counts[type] = (info.counts[type] ?? 0) + 1;
      byLabel.set(label, info);
    }
  }
  const data = [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label));
  booksCache = { at: Date.now(), data, complete: warnings.size === 0 };
  res.json({ books: data, warnings: [...warnings] });
});

/** Reports whether 5etools data is loaded, still downloading or failed, without waiting for it. */
sources.get("/5etools/status", async (req, res) => {
  if (req.query.retry) invalidateDataset();
  const loading = getDataset();
  loading.catch(() => {});
  const state = datasetState();
  if (!state.loaded) {
    // Give a quick load (warm database cache) a moment before answering "loading".
    const r = await within(loading, 3000).catch(() => ({ timedOut: false, value: undefined }));
    if (!r.value) return void res.json({ loading: !datasetState().error, error: datasetState().error });
  }
  const ds = await loading.catch(() => null);
  if (!ds) return void res.json({ loading: false, error: datasetState().error });
  res.json({
    loading: false,
    spells: ds.spell.length, feats: ds.feat.length, classes: ds.class.length, subclasses: ds.subclass.length,
    races: ds.race.length + ds.subrace.length, items: ds.item.length + ds.baseitem.length, brewSources: [...ds.brewSources],
    failures: ds.failures,
  });
});

sources.get("/5etools/brew/catalog", async (req, res) => {
  const q = String(req.query.q ?? "").toLowerCase();
  const folder = req.query.folder as string | undefined;
  const library = req.query.library as string | undefined;
  const all = await brewCatalog();
  res.json(
    all
      .filter((b) => (!folder || b.folder === folder) && (!library || b.library === library) && (!q || b.name.toLowerCase().includes(q)))
      .slice(0, library === "ua" ? 500 : 200),
  );
});

sources.get("/5etools/brew", async (_req, res) => {
  const { rows } = await pool.query("SELECT path, enabled, added_at FROM fivetools_brew ORDER BY added_at");
  res.json(rows);
});

sources.post("/5etools/brew", async (req, res) => {
  const path = String(req.body?.path ?? "");
  if (!/^(ua:)?[\w-]+\/[^/]+\.json$/.test(path)) throw new HttpError(400, "path must look like 'class/Author; Name.json'");
  await cachedFetch(brewFileUrl(path)); // validate it exists before saving
  await pool.query("INSERT INTO fivetools_brew (path) VALUES ($1) ON CONFLICT (path) DO UPDATE SET enabled = true", [path]);
  invalidateDataset();
  res.status(201).json({ path, enabled: true });
});

sources.delete("/5etools/brew", async (req, res) => {
  await pool.query("DELETE FROM fivetools_brew WHERE path = $1", [String(req.query.path ?? "")]);
  invalidateDataset();
  res.status(204).end();
});

/** Open5e books and which ones are hidden. */
sources.get("/open5e/documents", async (_req, res) => {
  const [docs, excluded] = await Promise.all([listDocuments(), excludedDocuments()]);
  res.json(docs.map((d) => ({ ...d, enabled: !excluded.includes(d.slug) })));
});

sources.put("/open5e/documents", async (req, res) => {
  const excluded = req.body?.excluded;
  if (!Array.isArray(excluded) || !excluded.every((x) => typeof x === "string")) throw new HttpError(400, "excluded must be a list of document slugs");
  await setExcludedDocuments(excluded);
  res.json({ excluded });
});

/**
 * Corrections: rolls and reminders the user marked as incorrect, hidden everywhere.
 * Stored app-wide because a misread rule text is wrong for every character.
 */
sources.get("/corrections", async (_req, res) => {
  const { rows } = await pool.query("SELECT value FROM settings WHERE key = 'corrections'");
  res.json({ hiddenRolls: [], hiddenReminders: [], ...rows[0]?.value });
});

sources.put("/corrections", async (req, res) => {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5000) : []);
  const value = { hiddenRolls: list(req.body?.hiddenRolls), hiddenReminders: list(req.body?.hiddenReminders) };
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('corrections', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(value)],
  );
  res.json(value);
});
