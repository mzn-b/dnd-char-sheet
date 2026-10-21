import { Router } from "express";
import { pool } from "../db.js";
import { HttpError } from "../content/http.js";

export const characters = Router();

characters.get("/", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, updated_at,
            data->'classes' AS classes, data->>'race' AS race, data->>'portraitUrl' AS "portraitUrl"
       FROM characters ORDER BY updated_at DESC`,
  );
  res.json(rows);
});

characters.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT id, data, updated_at FROM characters WHERE id = $1", [req.params.id]);
  if (!rows[0]) throw new HttpError(404, "Character not found");
  res.json({ id: rows[0].id, updatedAt: rows[0].updated_at, ...rows[0].data });
});

characters.post("/", async (req, res) => {
  const { id: _id, updatedAt: _u, ...data } = req.body ?? {};
  if (typeof data.name !== "string") throw new HttpError(400, "name is required");
  const { rows } = await pool.query("INSERT INTO characters (data) VALUES ($1) RETURNING id, updated_at", [data]);
  res.status(201).json({ ...data, id: rows[0].id, updatedAt: rows[0].updated_at });
});

characters.put("/:id", async (req, res) => {
  const { id: _id, updatedAt: _u, ...data } = req.body ?? {};
  const { rows } = await pool.query(
    "UPDATE characters SET data = $2, updated_at = now() WHERE id = $1 RETURNING id, updated_at",
    [req.params.id, data],
  );
  if (!rows[0]) throw new HttpError(404, "Character not found");
  res.json({ ...data, id: rows[0].id, updatedAt: rows[0].updated_at });
});

characters.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM characters WHERE id = $1", [req.params.id]);
  res.status(204).end();
});
