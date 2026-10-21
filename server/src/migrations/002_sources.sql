-- Which content providers are enabled (SRD, Open5e, 5etools) and other app-wide settings.
CREATE TABLE settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
INSERT INTO settings (key, value) VALUES ('providers', '{"srd": true, "open5e": true, "5etools": false}');

-- 5etools-format homebrew files (from the 5etools homebrew repository) the user has enabled.
CREATE TABLE fivetools_brew (
  path      text PRIMARY KEY,
  enabled   boolean NOT NULL DEFAULT true,
  added_at  timestamptz NOT NULL DEFAULT now()
);
