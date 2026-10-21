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
    const body = await limited(() => fetchJson<T>(url, post));
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

/** Upstream requests give up after this long, so a stalled connection can't hang a search forever. */
const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 30_000);
/** At most this many upstream requests at once (5etools has hundreds of files; GitHub rate-limits bursts). */
const MAX_PARALLEL = Number(process.env.FETCH_CONCURRENCY ?? 8);

async function fetchJson<T>(url: string, post: unknown, attempt = 1): Promise<T> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(post === undefined
        ? { headers: { Accept: "application/json" } }
        : { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(post) }),
    });
    if (!res.ok) throw new HttpError(res.status, `Upstream ${res.status} for ${url}`);
    return (await res.json()) as T;
  } catch (err) {
    // Retry once on timeouts, network errors, rate limits and server errors; 404s are final.
    const status = err instanceof HttpError ? err.status : 0;
    if (attempt < 2 && (status === 0 || status === 429 || status >= 500)) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchJson<T>(url, post, attempt + 1);
    }
    if ((err as Error).name === "TimeoutError") throw new HttpError(504, `Timed out after ${TIMEOUT_MS / 1000}s fetching ${url}`);
    throw err;
  }
}

let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Resolves to undefined (and reports why) if the promise takes longer than ms. */
export async function within<T>(promise: Promise<T>, ms: number): Promise<{ value?: T; timedOut: boolean }> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<{ timedOut: true }>((r) => (timer = setTimeout(() => r({ timedOut: true }), ms)));
  try {
    return await Promise.race([promise.then((value) => ({ value, timedOut: false })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
