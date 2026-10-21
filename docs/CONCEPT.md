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

## 5etools

5etools has no API: its data is static JSON (`data/class/class-wizard.json`, `data/spells/spells-phb.json`, …). The server loads the files from a mirror (`FIVETOOLS_DATA_URL`, by default the community GitHub mirror). It also loads any files the user enabled from the 5etools homebrew repository, which use the same format. Everything is cached in Postgres and merged in memory.

- **2014 rules only.** Entries marked `edition: "one"` and books published from the 2024 PHB onward (XPHB, XDMG, XMM, …) are dropped.
- **Text.** Nested `entries` with `{@spell fireball}`-style tags are rendered to the app's markdown subset. References to sub-features are inlined.
- **Keys.** Keys are the 5etools identity, `Name|Source`. Class features use `cf|Name|Class|ClassSource|Level|Source`, subclass features `scf|…`, and optional features `of|Name|Source`.
- **Duplicates.** When 5etools is on, SRD and Open5e entries with the same name are hidden in favour of the full 5etools text.
- **Opt-in.** The provider is off by default because 5etools mirrors content beyond the SRD.

## Choices and sub-features

A feature, feat, race or background can carry **choices** (`Choice { kind, count, options }`):

| kind | Examples | Effect when picked |
| --- | --- | --- |
| `feature` | Fighting Style, Metamagic, Pact Boon, a subclass's options | sub-feature with the option's full text |
| `expertise` | Rogue/Bard Expertise | skill set to expertise |
| `skill` | Half-Elf Skill Versatility, Skilled | skill proficiency |
| `ability` | Half-Elf +1/+1, Resilient | ability score +amount |
| `save` | Resilient | saving-throw proficiency |
| `text` | Favored Enemy, Natural Explorer | sub-feature with that label |

Picks become `subfeatures` on the character's feature, each with its own description. The feature also keeps its `choices`, so **Change choices** on the Features tab can re-pick at any time. The old pick's mechanics are undone and the new one's applied.

**Progressions** are options gained by count rather than by a feature: Eldritch Invocations known, Battle Master maneuvers, Blood Curses. They come from the class table (`invocations_known`, `optionalfeatureProgression`). The wizard asks for the new picks and adds them as sub-features of the matching feature.

Sources of choices: the SRD API's `feature_specific` option sets, 5etools `{type: "options"}` blocks and ability/skill/save `choose` blocks, and homebrew entries (Homebrew Workshop → Choices).

## Character creator

`/new` walks through name and target level, then race and background (with their choices), then ability scores (standard array, 27-point buy, 4d6-drop-lowest or manual, with a live preview of racial bonuses). Next comes the **class plan**: the starting class plus multiclass rows, with prerequisites checked against the final scores. After that come starting equipment, details and review.

Creating the character applies race, background, scores and equipment, then stores the plan as `pendingLevelUps`. The sheet opens the level-up wizard in **build mode** once per queued level ("Build: level 3 of 5"). Every level gets the same HP, feature, choice and spell steps as a normal level-up. A build can be paused and continued later from a banner on the sheet.

## Multiclassing

- The class step and the creator check each class's multiclass prerequisite (e.g. "STR 13 or DEX 13"). Unmet prerequisites are flagged, not blocked.
- The first class grants its saving throws and full proficiencies. Later classes grant only their multiclass proficiencies and skill picks.
- Hit dice are tracked per die size.
- Spell slots follow the PHB multiclass table: full + half (rounded down) + third (rounded down) + artificer (rounded up). Pact magic is tracked separately.
- Each class keeps its own spell list, spellcasting ability, save DC, and known/prepared limits (from its own class level).

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

- Replace-on-level-up for invocations and maneuvers (currently: remove and re-add on the Features tab).
- Apply 5etools `additionalSpells` (racial and subclass spells such as Drow magic or domain spells) automatically.
- 2024 rules, selectable per character.
- Dice roller and roll log; clickable bonuses that roll.
- User accounts and sharing a read-only sheet with the DM.
- PDF export laid out like the official sheet.
- Offline/PWA mode using the cached content.
