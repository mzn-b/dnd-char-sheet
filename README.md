# Character Vault: a digital D&D 5e character sheet

A dark-mode web app for keeping multiple D&D 5e characters. It covers every field on the paper sheet, pulls rules content (spells, feats, classes, items…) from public 5e APIs, walks you through level-ups, and treats homebrew as a first-class citizen.

- **All paper-sheet fields** (all three pages: core stats, details/backstory, spellcasting), always editable inline, with autosave.
- **Rules content from three providers**, toggled on the **Sources** page and cached in Postgres:
  - [5e SRD API](https://www.dnd5eapi.co): the free SRD 5.1
  - [Open5e](https://open5e.com): free OGL expansions, with each book toggled individually: Kobold Press (Deep Magic, Deep Magic Extended, Tome of Heroes, Vault of Magic, Warlock Archives), EN Publishing's Level Up A5E, Green Ronin's Tal'Dorei and Open5e originals. Covers spells, subclasses, races, backgrounds, feats, magic items, weapons and armor.
  - [5etools](https://5e.tools) data (2014 rules only): every book's subclasses, races, feats, spells, items and optional features, plus any files from the 5etools **homebrew repository** (Blood Hunter, etc.)
- **Source filter**: every picker can be narrowed to a single book.
- **Character creator** for a level 1 character or any higher level: race, background, ability scores (**point buy** by the PHB rules is the default: 27 points, scores 8–15, 14 and 15 cost 2. It shows a points-left meter, the cost of each score and its next step, the cost table, and racial bonuses with final scores and modifiers. Standard array, 4d6 or manual are also available), class plan with multiclassing, and starting equipment. A higher-level build is then walked through level by level with the wizard.
- **Guided level-up**: class or multiclass (prerequisites checked), class proficiencies and skill picks, HP (average or roll), new features, subclass choice, ASI or feat, cantrips/spells to learn, spell swaps, then a review step. Slot tables are recalculated: single class, PHB multiclass table, pact magic, and subclass casters (Eldritch Knight, Arcane Trickster).
- **Features with built-in choices** (Fighting Style, Expertise, Metamagic, Invocations, Maneuvers, Favored Enemy, a feat's ability or save pick, Half-Elf's +1/+1…) open a picker. Each pick is stored as a **sub-feature** with its full text. Skills, expertise, saves and ability increases are applied automatically, and picks can be changed later.
- **Flexible editing**: the rules give hints (e.g. *Spells known 5/6*), not hard locks. Add, swap or remove spells, feats or features any time, or fix class levels by hand.
- **Homebrew**: create spells, feats, items, features, subclasses, full classes, races and backgrounds. They appear alongside official content in every picker and in the level-up wizard.
- **Play features**:
  - **Dice roller**: click any modifier to roll it (checks, saves, skills, initiative, attacks, damage, spell attacks, death saves, hit dice). Shift-click rolls with advantage, Ctrl-click with disadvantage. A natural 20 makes the next damage roll critical. There's a roll log and a custom-dice tray.
  - **Actions tab**: a combat dashboard. Vitals, attacks, spells grouped into action / bonus action / reaction, slot summary, class resources, saving throws, standard actions reference, companions.
  - **Every roll in a text, including conditionals**: a roll extractor (`web/src/lib/rollText.ts`, unit-tested on real spell and feature texts) finds all dice and their context:
    - alternatives ("instead takes 1d12 if the target is missing hit points")
    - conditional extras ("+1d8 if the target is undead or a fiend")
    - per-turn effects, area triggers, half damage on a save, temporary HP, flat bonuses (−5/+10)
    - scaling per slot or every two slots, cantrip tiers, caps ("max 5d8") and cantrip upgrades that unlock at 5th level

    Anything misread can be **marked as incorrect** (✕ on hover) and stops being shown everywhere. Hidden values are listed under "Show N marked incorrect" with a restore link. The same works for combat reminders.

    Spell details show a "What to roll" list with a slot-level picker, and spell rows show "+N more" with a tooltip. Features and feats show their rolls too, with class-table values for Sneak Attack, Martial Arts, Bardic Inspiration and Rage.
  - **What to roll**: every spell shows its damage or healing dice and type (cantrips at your character level), how it scales, and its save DC or attack bonus. The Cast menu shows the dice for each slot level, and the spell details include a full table by slot level. Handy if you roll physical dice.
  - **Expanded spell lists**: warlock patron spells (SRD, 5etools and Open5e patrons) appear in the spell pickers with an "expanded" badge, behind a toggle that's remembered.
  - **Spellcasting**: Cast spends the right slot (with upcasting, pact slots or ritual casting) and starts concentration. Taking damage while concentrating prompts the Con save DC. Innate spells track their uses. Spells show casting-time, range, concentration and ritual badges, with search and a "prepared only" filter.
  - **Class resources tracked automatically**: Rage, Bardic Inspiration, Channel Divinity, Wild Shape, Second Wind / Action Surge / Indomitable, Ki, Lay on Hands, Sorcery Points, Superiority Dice, Arcane Recovery, Mystic Arcanum and more. Maximums follow your level and ability scores.
  - **Combat tracker**:
    - Start combat with your initiative (rolled in-app or at the table).
    - Rounds advance with your turns. Action, bonus action, reaction and movement are tracked each turn.
    - A sticky round bar shows on every tab.
    - Lasting spells you cast and features you activate (Rage, Reckless Attack, Wild Shape, Bladesong, Action Surge, Patient Defense, Dodge…) become **active effects** that count down and expire on their own.
    - Reminders are grouped by moment (start of turn, attacking, on hit, when hit or damaged, end of turn, always). They come from active effects, your features and feats (Sneak Attack, Divine Smite, Great Weapon Master, maneuvers, invocations…), reaction spells you know, conditions and concentration.
    - Bless-style bonuses are added to in-app attack and save rolls.
  - **Usage tracking**: limited uses are detected from feature and feat text ("once per long rest", "proficiency bonus times", "Wisdom modifier (minimum of once)", Lucky's 3 points) when gained, or with **Detect limited uses** for existing characters. Maximums follow your proficiency bonus or ability modifiers. Any spell can get free casts per short or long rest, and every cast is counted.
  - **Rests**: the ☾ Short rest and ☀ Long rest buttons in the header reset the matching resources, feature and feat uses, free spell casts, pact slots and cast counters. A long rest also restores HP, slots and hit dice, and ends combat. A short rest lets you spend hit dice. short rests spend hit dice with real rolls. Long rests restore HP, slots, resources and half your hit dice, and reduce exhaustion.
  - **Automatic AC**: from worn armor and shield, Unarmored Defense (Barbarian/Monk), Draconic Resilience and the Defense style, plus a misc bonus. It warns about Stealth disadvantage and armor too heavy for your Strength. You can switch to manual.
  - **Inventory**: items keep their weapon and armor stats. Wearing armor updates AC; +Atk turns a weapon into an attack. Attunement (x/3), charges, coin weight, wealth in gp, quick "+25 gp" adjustments.
  - **Conditions** with rules text, exhaustion effects, passive Perception / Insight / Investigation, senses (darkvision filled in from your race).
  - **Granted spells**: racial magic (Tiefling, Drow…) and domain / oath / circle spells are added automatically at the right level.
  - **Session journal**, notes, companions (familiars, mounts), XP with quick-add and a progress bar, or milestone leveling.
  - **Undo / redo** for every sheet change (Ctrl+Z / Ctrl+Shift+Z).
  - **Printable sheet**: three pages (stats, spells, details) via the browser's Save as PDF.
- **Creation helpers**: roll or pick personality traits, ideals, bonds and flaws from your background's tables. Starting equipment from class and background is matched to real items, so armor is worn, AC is right and weapons are ready as attacks. During level-up you can swap a known invocation or maneuver.
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
npm test                      # unit tests (roll extraction, usage detection, combat logic)
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
