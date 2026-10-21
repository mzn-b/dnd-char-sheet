import { Router } from "express";
import { pool } from "../db.js";
import { getProviders, setProviders } from "../content/settings.js";
import { brewCatalog, brewFileUrl, invalidateDataset, getDataset, DATA_URL } from "../content/fivetools/data.js";
import { cachedFetch, HttpError } from "../content/http.js";

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

/** Checks the 5etools mirror is reachable and reports what it loaded. */
sources.get("/5etools/status", async (_req, res) => {
  const ds = await getDataset();
  res.json({
    spells: ds.spell.length, feats: ds.feat.length, classes: ds.class.length, subclasses: ds.subclass.length,
    races: ds.race.length + ds.subrace.length, items: ds.item.length + ds.baseitem.length, brewSources: [...ds.brewSources],
  });
});

sources.get("/5etools/brew/catalog", async (req, res) => {
  const q = String(req.query.q ?? "").toLowerCase();
  const folder = req.query.folder as string | undefined;
  const all = await brewCatalog();
  res.json(all.filter((b) => (!folder || b.folder === folder) && (!q || b.name.toLowerCase().includes(q))).slice(0, 200));
});

sources.get("/5etools/brew", async (_req, res) => {
  const { rows } = await pool.query("SELECT path, enabled, added_at FROM fivetools_brew ORDER BY added_at");
  res.json(rows);
});

sources.post("/5etools/brew", async (req, res) => {
  const path = String(req.body?.path ?? "");
  if (!/^[\w-]+\/[^/]+\.json$/.test(path)) throw new HttpError(400, "path must look like 'class/Author; Name.json'");
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
