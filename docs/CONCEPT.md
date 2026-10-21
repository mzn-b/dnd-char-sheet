# Concept & design

## Goals

1. **Everything on the paper sheet**, in a layout that feels familiar but is easier to use.
2. **Rules-aware, not rules-locked.** The app knows the 5e rules well enough to guide you and flag problems, but you (and your DM) always have the final say.
3. **Content from APIs**, so descriptions of spells and feats are one click away and never typed by hand.
4. **Homebrew is equal to official content.** Anything you create shows up wherever official content does.
5. **Several characters, one place.** Dark mode, fast, and saved automatically.

## Paper sheet → app mapping

| Paper sheet | Where it lives in the app |
| --- | --- |
| Name, class & level, background, player, race, alignment, XP | Sheet header (class/level is set by the level-up wizard and can be edited by hand) |
| Ability scores & modifiers | Overview → left column (type the score; the modifier is derived) |
| Inspiration, proficiency bonus | Overview (proficiency is derived from total level and can be overridden) |
| Saving throws, skills | Overview. Click the dot to cycle none → proficient → expertise → half (Jack of All Trades) |
| Passive Wisdom (Perception) | Overview (derived) |
| Other proficiencies & languages | Overview (free text) |
| AC, initiative, speed | Overview → combat column (initiative is Dex + misc) |
| HP max / current / temp | Overview, with Damage / Heal / Temp buttons (damage hits temp HP first) |
| Hit dice, death saves | Overview (clickable pips; hit dice grouped by die size for multiclass characters) |
| Attacks & spellcasting | Overview. Attack bonus is derived from ability + proficiency + bonus; can be created from an inventory weapon |
| Equipment, CP/SP/EP/GP/PP | Inventory tab (carry weight vs. Str × 15) |
| Personality traits, ideals, bonds, flaws | Overview right column and Bio tab |
| Features & traits | Features tab (grouped by class / race / background / feat), with optional limited-use trackers |
| **Page 2:** age, height, weight, eyes, skin, hair, appearance, portrait | Bio tab |
| Backstory, allies & organizations (+ faction), additional features, treasure | Bio tab / Inventory tab |
| **Page 3:** spellcasting class, ability, save DC, attack bonus | Spells tab, one card per casting class |
| Cantrips, spells by level, prepared markers, slots total/expended | Spells tab |
| *(extras)* conditions, exhaustion, short/long rest, level history, notes | Overview, header actions, History tab, Bio tab |

## Architecture

```
 Browser (React, Tailwind, dark theme)
   │  /api/*
   ▼
 API (Express, TypeScript)
   ├── characters  ──► Postgres  characters(data jsonb)
   ├── homebrew    ──► Postgres  homebrew(type, name, data jsonb)
   └── content     ──► adapters ─► dnd5eapi.co (SRD 5.1)
                                ├► api.open5e.com (extra OGL feats)
                                └► homebrew table
                      cached in  ► Postgres  api_cache(url, body)
```

**Why JSONB for characters?** A character sheet is a document that is always read and written whole. Keeping it as JSONB lets the sheet grow (new fields, new trackers) without migrations, while generated columns (e.g. `name`) keep listing fast. `normalizeCharacter()` on the client fills in defaults for older saves.

**One content shape.** Each source has an adapter that converts its response into `ContentSummary` (for lists) and `ContentDetail` (description, meta facts such as range or casting time, spell flags, machine-applicable `effects`). The UI renders only this shape, so adding a source means writing one adapter.

**Characters store references plus copies.** Spells and features keep a `{source, key, name}` reference so their details can always be fetched again. Features also copy their description, so a sheet still reads correctly if the API is offline or a homebrew entry is deleted.

## Level-up wizard

`planLevel()` compares the class's progression table at the new level with the previous level. It works out which steps are needed, and steps that don't apply are skipped.

1. **Class**: advance an existing class or multiclass into a new one (SRD or homebrew).
2. **Hit points**: maximum hit die at character level 1; otherwise take the average or roll. Adds Con modifier, and raises HP for every level if this level-up increased Con.
3. **Features**: shows every new class and subclass feature with its full text. If this is the subclass level, you pick the subclass here.
4. **Ability score improvement or feat**: offered when `ability_score_bonuses` goes up. Choose +2/+1+1 (capped at 20), or a feat from SRD, Open5e or homebrew. Feat `effects` such as +1 Int are applied automatically.
5. **Spells** depend on how the class gains spells:
   - *Known casters* (bard, ranger, sorcerer, warlock): learn the difference in spells known and cantrips known, and optionally swap one known spell.
   - *Wizard*: add 6 spells to the spellbook at level 1, then 2 per level.
   - *Prepared casters* (cleric, druid, paladin): a note explains that preparing happens on the Spells tab.
   - The picker only offers spells of levels you can cast, and only from your class list unless you switch to "All classes".
6. **Review**: shows every change, plus non-blocking warnings for unfinished choices. Applying writes everything to the sheet, recalculates spell slots (class table, PHB multiclass table, or pact magic) and adds an entry to the level history.

## Flexibility outside level-up

- Every number and text field is directly editable. Derived values (modifiers, skill bonuses, save DC) update live.
- **Spells tab**: add or remove spells at any time, toggle prepared, mark spells as *always prepared* (domain or oath spells), and edit slot totals. Limits such as "Prepared 6/5" are shown in colour as a warning, never enforced.
- **Features tab**: add feats or custom features, edit any description, add use trackers.
- **Classes editor** (click the class line in the header): correct a class level, hit die or subclass by hand.
- **Race and background pickers** fill in speed, ability bonuses and traits, and the text fields stay free-form.

## Homebrew

The Homebrew Workshop has forms for each content type:

- **Spell**: level, school, casting time, range, components, duration, concentration/ritual, and which classes can use it.
- **Feat / race**: prerequisite and description, plus *ability score effects* that are applied automatically.
- **Item**: category, weight, damage, properties, cost, rarity. Weapons can become attacks.
- **Feature**: free text. Attach features to levels of a homebrew class or subclass.
- **Subclass**: parent class(es) and features by level. It appears in the wizard's subclass step.
- **Class**: hit die, saving throws, subclass level, ASI levels, spellcasting ability, and a spell slot table borrowed from an SRD class ("same as wizard"), plus features by level. The wizard uses it like any SRD class.

## Roadmap / ideas

- Class skill and starting equipment choices at level 1 (the SRD API exposes `proficiency_choices`).
- Feature sub-choices (Fighting Style, Metamagic, Eldritch Invocations) as wizard steps.
- 2024 rules (the SRD API offers `/api/2024`), selectable per character.
- Dice roller and roll log; clickable bonuses that roll.
- User accounts and sharing a read-only sheet with the DM.
- PDF export laid out like the official sheet.
- Offline/PWA mode using the cached content.
