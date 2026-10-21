import { pool } from "../db.js";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET a JSON document from an upstream rules API, cached in Postgres.
 * SRD data rarely changes, so a week-old cache entry is still considered fresh;
 * a stale entry is served if the upstream is unreachable.
 */
export async function cachedFetch<T = any>(url: string, post?: unknown): Promise<T> {
  // POST requests (GraphQL) are cached under the URL plus their body.
  const cacheKey = post === undefined ? url : `${url}#${JSON.stringify(post)}`;
  const { rows } = await pool.query<{ body: T; fetched_at: Date }>(
    "SELECT body, fetched_at FROM api_cache WHERE url = $1",
    [cacheKey],
  );
  const cached = rows[0];
  if (cached && Date.now() - cached.fetched_at.getTime() < ONE_WEEK_MS) return cached.body;

  try {
    const res = await fetch(
      url,
      post === undefined
        ? { headers: { Accept: "application/json" } }
        : { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(post) },
    );
    if (!res.ok) throw new HttpError(res.status, `Upstream ${res.status} for ${url}`);
    const body = (await res.json()) as T;
    await pool.query(
      `INSERT INTO api_cache (url, body, fetched_at) VALUES ($1, $2, now())
       ON CONFLICT (url) DO UPDATE SET body = EXCLUDED.body, fetched_at = now()`,
      [cacheKey, JSON.stringify(body)],
    );
    return body;
  } catch (err) {
    if (cached) return cached.body;
    throw err;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
