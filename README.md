# Character Vault: a digital D&D 5e character sheet

A dark-mode web app for keeping multiple D&D 5e characters. It covers every field on the paper sheet, pulls rules content (spells, feats, classes, items…) from public 5e APIs, walks you through level-ups, and treats homebrew as a first-class citizen.

- **All paper-sheet fields** (all three pages: core stats, details/backstory, spellcasting), always editable inline, with autosave.
- **Rules API integration**: [5e SRD API](https://www.dnd5eapi.co) for classes, spells, features, items, races and backgrounds; [Open5e](https://open5e.com) for extra OGL feats. Responses are cached in Postgres.
- **Guided level-up**: class or multiclass, HP (average or roll), new features, subclass choice, ASI or feat, cantrips/spells to learn, spell swaps, then a review step. Slot tables are recalculated, including multiclass and pact magic.
- **Flexible editing**: the rules give hints (e.g. *Spells known 5/6*), not hard locks. Add, swap or remove spells, feats or features any time, or fix class levels by hand.
- **Homebrew**: create spells, feats, items, features, subclasses, full classes, races and backgrounds. They appear alongside official content in every picker and in the level-up wizard.
- **Multiple characters**, with duplicate, delete and JSON import/export.

See [docs/CONCEPT.md](docs/CONCEPT.md) for the design: data model, level-up logic and roadmap.

## Quick start (development)

Requirements: Node 22+, Docker.

```bash
cp .env.example .env          # optional; defaults match docker-compose
npm install
npm run db:up                 # starts Postgres 16 in Docker (port 5432)
npm run dev:server            # API on http://localhost:4000 (runs migrations on boot)
npm run dev:web               # web app on http://localhost:5173 (proxies /api to the API)
```

Open http://localhost:5173, create a character, set ability scores, then press **Choose a class** to run the level-up wizard for level 1.

## Run everything in Docker

```bash
docker compose --profile app up --build
```

Open http://localhost:4000. The API serves the built web client.

## Project layout

```
docker-compose.yml        Postgres (+ optional app container)
Dockerfile                Builds web + API into one image
server/                   Express + pg API (TypeScript)
  src/migrations/         SQL migrations, applied automatically on start
  src/content/            Rules-content adapters: SRD, Open5e, homebrew → one normalized shape
  src/routes/             /api/characters, /api/homebrew, /api/content, /api/rules
web/                      React + Vite + Tailwind client (TypeScript)
  src/lib/                Character model, 5e rules math, API client, autosave hook
  src/components/sheet/   Sheet sections (abilities, combat, spells, inventory, …)
  src/components/levelup/ Level-up wizard and its planning logic
  src/pages/              Character list, character sheet, homebrew workshop
```

## API overview

| Method & path | Purpose |
| --- | --- |
| `GET/POST /api/characters`, `GET/PUT/DELETE /api/characters/:id` | Character CRUD (sheet stored as JSONB) |
| `GET /api/content/:type?q=&class=&level=&maxLevel=` | Search spells, feats, items, races, backgrounds, features, subclasses or classes across all sources |
| `GET /api/content/:type/:source/:key` | Full, normalized detail for one entry (`source` = `srd` \| `open5e` \| `homebrew`) |
| `GET /api/rules/classes/:source/:key` | Class progression (hit die, per-level features, ASIs, spell table) for the level-up wizard |
| `GET /api/rules/subclasses/:source/:key/levels` | Subclass features per level |
| `GET/POST /api/homebrew`, `PUT/DELETE /api/homebrew/:id` | Homebrew CRUD |
