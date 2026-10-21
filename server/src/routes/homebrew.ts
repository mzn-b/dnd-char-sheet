import { Router } from "express";
import { pool } from "../db.js";
import { HttpError } from "../content/http.js";
import { CONTENT_TYPES, type ContentType } from "../content/types.js";
import { toDetail } from "../content/homebrew.js";

export const homebrew = Router();

function parseBody(body: any) {
  const { name, type, source: _s, key: _k, sourceLabel: _l, ...data } = body ?? {};
  if (!name || typeof name !== "string") throw new HttpError(400, "name is required");
  if (!CONTENT_TYPES.includes(type)) throw new HttpError(400, `type must be one of ${CONTENT_TYPES.join(", ")}`);
  return { name: name.trim(), type: type as ContentType, data };
}

homebrew.get("/", async (req, res) => {
  const type = req.query.type as string | undefined;
  const { rows } = await pool.query(
    "SELECT id, type, name, data FROM homebrew WHERE $1::text IS NULL OR type = $1 ORDER BY type, name",
    [type ?? null],
  );
  res.json(rows.map(toDetail));
});

homebrew.post("/", async (req, res) => {
  const { name, type, data } = parseBody(req.body);
  const { rows } = await pool.query(
    "INSERT INTO homebrew (type, name, data) VALUES ($1, $2, $3) RETURNING id, type, name, data",
    [type, name, data],
  );
  res.status(201).json(toDetail(rows[0]));
});

homebrew.put("/:id", async (req, res) => {
  const { name, type, data } = parseBody(req.body);
  const { rows } = await pool.query(
    "UPDATE homebrew SET type = $2, name = $3, data = $4, updated_at = now() WHERE id = $1 RETURNING id, type, name, data",
    [req.params.id, type, name, data],
  );
  if (!rows[0]) throw new HttpError(404, "Homebrew entry not found");
  res.json(toDetail(rows[0]));
});

homebrew.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM homebrew WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
