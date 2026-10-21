import { pool } from "../db.js";

export interface Providers {
  srd: boolean;
  open5e: boolean;
  "5etools": boolean;
}

export async function getProviders(): Promise<Providers> {
  const { rows } = await pool.query<{ value: Partial<Providers> }>("SELECT value FROM settings WHERE key = 'providers'");
  return { srd: true, open5e: true, "5etools": false, ...rows[0]?.value };
}

export async function setProviders(p: Partial<Providers>): Promise<Providers> {
  const next = { ...(await getProviders()), ...p };
  await pool.query(
    "INSERT INTO settings (key, value) VALUES ('providers', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(next)],
  );
  return next;
}
