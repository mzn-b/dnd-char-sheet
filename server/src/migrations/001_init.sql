CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A character sheet is a document: stored as JSONB so the sheet can evolve
-- without migrations. Summary columns are generated for fast listing.
CREATE TABLE characters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data        jsonb NOT NULL,
  name        text GENERATED ALWAYS AS (data->>'name') STORED,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Homebrew content of any kind (spell, feat, item, feature, race, background, subclass).
-- `data` follows the same normalized shape the app uses for SRD content.
CREATE TABLE homebrew (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,
  name        text NOT NULL,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX homebrew_type_idx ON homebrew (type, lower(name));

-- Cache of upstream rules API responses (SRD data is static, so cache aggressively).
CREATE TABLE api_cache (
  url         text PRIMARY KEY,
  body        jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);
