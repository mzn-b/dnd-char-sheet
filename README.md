# Character Vault: a digital D&D 5e character sheet

A dark-mode web app for keeping multiple D&D 5e characters. It covers every field on the paper sheet, pulls rules content (spells, feats, classes, items…) from public 5e APIs, walks you through level-ups, and treats homebrew as a first-class citizen.

- **All paper-sheet fields** (all three pages: core stats, details/backstory, spellcasting), always editable inline, with autosave.
- **Rules content from three providers**, toggled on the **Sources** page and cached in Postgres:
  - [5e SRD API](https://www.dnd5eapi.co): the free SRD 5.1
  - [Open5e](https://open5e.com): extra OGL feats
  - [5etools](https://5e.tools) data (2014 rules only): every book's subclasses, races, feats, spells, items and optional features, plus any files from the 5etools **homebrew repository** (Blood Hunter, etc.)
- **Character creator** for a level 1 character or any higher level: race, background, ability scores (standard array, point buy, 4d6 or manual), class plan with multiclassing, and starting equipment. A higher-level build is then walked through level by level with the wizard.
- **Guided level-up**: class or multiclass (prerequisites checked), class proficiencies and skill picks, HP (average or roll), new features, subclass choice, ASI or feat, cantrips/spells to learn, spell swaps, then a review step. Slot tables are recalculated: single class, PHB multiclass table, pact magic, and subclass casters (Eldritch Knight, Arcane Trickster).
- **Features with built-in choices** (Fighting Style, Expertise, Metamagic, Invocations, Maneuvers, Favored Enemy, a feat's ability or save pick, Half-Elf's +1/+1…) open a picker. Each pick is stored as a **sub-feature** with its full text. Skills, expertise, saves and ability increases are applied automatically, and picks can be changed later.
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

Open http://localhost:5173 and press **Create character**. To use 5etools content, turn it on under **Sources** (the first load takes a few seconds).

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
  src/content/            Rules-content adapters: SRD, Open5e, 5etools, homebrew → one normalized shape
  src/content/fivetools/  5etools loader (mirror + homebrew files), entry renderer, class progression
  src/routes/             /api/characters, /api/homebrew, /api/content, /api/rules, /api/sources
web/                      React + Vite + Tailwind client (TypeScript)
  src/lib/                Character model, 5e rules math, API client, autosave hook, apply helpers
  src/components/sheet/   Sheet sections (abilities, combat, spells, inventory, …)
  src/components/levelup/ Level-up wizard and its planning logic
  src/pages/              Character list & creator, character sheet, homebrew workshop, sources
```

## API overview

| Method & path | Purpose |
| --- | --- |
| `GET/POST /api/characters`, `GET/PUT/DELETE /api/characters/:id` | Character CRUD (sheet stored as JSONB) |
| `GET /api/content/:type?q=&class=&level=&maxLevel=` | Search spells, feats, items, races, backgrounds, features, subclasses or classes across all sources |
| `GET /api/content/:type/:source/:key` | Full, normalized detail for one entry, including its `effects` and `choices` (`source` = `srd` \| `open5e` \| `5etools` \| `homebrew`) |
| `GET /api/rules/classes/:source/:key` | Class progression (hit die, per-level features, ASIs, spell table) for the level-up wizard |
| `GET /api/rules/subclasses/:source/:key/levels` | Subclass features, option progressions and (for subclass casters) spellcasting per level |
| `GET/PUT /api/sources/providers` | Enable or disable SRD / Open5e / 5etools |
| `GET /api/sources/5etools/brew/catalog?q=`, `GET/POST/DELETE /api/sources/5etools/brew` | Browse and enable 5etools homebrew files |
| `GET/POST /api/homebrew`, `PUT/DELETE /api/homebrew/:id` | Homebrew CRUD |
