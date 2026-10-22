# Character Vault: a digital D&D 5e character sheet

A dark-mode web app for keeping multiple D&D 5e characters. It covers every field on the paper sheet, pulls rules content (spells, feats, classes, items…) from public 5e APIs, walks you through level-ups, and treats homebrew as a first-class citizen.

- **All paper-sheet fields** (all three pages: core stats, details/backstory, spellcasting), always editable inline, with autosave.
- **Rules content from three providers**, toggled on the **Sources** page and cached in Postgres:
  - [5e SRD API](https://www.dnd5eapi.co): the free SRD 5.1
  - [Open5e](https://open5e.com): free OGL expansions, with each book toggled individually: Kobold Press (Deep Magic, Deep Magic Extended, Tome of Heroes, Vault of Magic, Warlock Archives), EN Publishing's Level Up A5E, Green Ronin's Tal'Dorei and Open5e originals. Covers spells, subclasses, races, backgrounds, feats, magic items, weapons and armor.
  - [5etools](https://5e.tools) data (2014 rules only): every book's subclasses, races, feats, spells, items (including every +1/+2/+3 weapon and armor), optional features and monsters, plus any files from the 5etools **homebrew repository** (Blood Hunter, etc.) and the **Unearthed Arcana** library. Adventure and supplement codes show their full names.
  - Open5e's v2-only books (Spells That Don't Suck, Level Up's Dungeon Delver's Guide and Gate Pass Gazette backgrounds) are merged in too.
- **Source filter**: every picker can be narrowed to a single book.
- **Books per character**: before creating a character, pick the books you play with (presets: PHB only, PHB + Xanathar's + Tasha's, or any mix of official, SRD, Open5e and 5etools-library books). Races, classes, subclasses, backgrounds, feats, spells and class options then come only from those books, in the creator and at every level-up. Your homebrew is always included; items and creatures are never filtered. Change it later under ⚙ Rules, or click the 📚 chip in a picker to show all books for a moment. If the official books are missing, the picker says why (5etools turned off, still downloading, or unreachable) and can turn 5etools on for you.
- **Filter by any value**: every picker (races, classes, subclasses, backgrounds, feats, spells, class options, items and creatures, including the Wild Shape, familiar and steed pickers) has a ⚲ Filters panel built from the values its results have. For example:
  - spells: school, casting time (action / bonus action / reaction / longer), concentration, ritual, components, costly material, damage type, saving throw, spell attack, conditions, healing, range, duration
  - races: ability increases, size, speed and other movement, darkvision, resistances, skills, innate spells
  - feats: prerequisite type, ability increase, actions used; backgrounds: skills, tools, languages, starting gold
  - items: category, rarity, magic, attunement, cost, weight, AC, damage and type, weapon properties, +N bonus, charges
  - creatures: CR, type, size, AC, HP, walk/fly/swim/climb/burrow speeds, all six ability scores, resistances and immunities, senses, alignment, legendary, spellcaster, environment

  Numbers filter by range, yes/no values by Any / Yes / No, and lists by picking values ("any of" or "all of"). Results can be sorted by any numeric value (cheapest, highest AC, fastest…).
- **Robust loading**: a slow or unreachable source never blocks a picker. After 20 seconds the other sources' results are shown with a notice (for example "5etools is still downloading its data"), and the Sources page shows download progress, files that failed, and a Retry button.
- **Character creator** for a level 1 character or any higher level: race, background, ability scores (**point buy** by the PHB rules is the default: 27 points, scores 8–15, 14 and 15 cost 2. It shows a points-left meter, the cost of each score and its next step, the cost table, and racial bonuses with final scores and modifiers. Standard array, 4d6 or manual are also available), class plan with multiclassing, and starting equipment. A higher-level build is then walked through level by level with the wizard.
- **Guided level-up**: class or multiclass (prerequisites checked), class proficiencies and skill picks, HP (average or roll), new features, subclass choice, ASI or feat, cantrips/spells to learn, spell swaps, then a review step. Slot tables are recalculated: single class, PHB multiclass table, pact magic, and subclass casters (Eldritch Knight, Arcane Trickster).
- **Features with built-in choices** (Fighting Style, Expertise, Metamagic, Invocations, Maneuvers, Favored Enemy, a feat's ability or save pick, Half-Elf's +1/+1…) open a picker. Each pick is stored as a **sub-feature** with its full text. Skills, expertise, saves and ability increases are applied automatically, and picks can be changed later.
- **Level down**: ▼ Level down undoes the most recent level-up. Each level-up saves the build from just before it (classes, abilities, skills, saves, features and choices, spells, slots, max HP), so it's restored exactly, while play state stays: current HP (capped), inventory, coins, notes, creatures, spell uses and XP (optionally lowered too). Levels gained before this existed are undone from their history entry, and the dialog lists anything to check by hand.
- **Flexible editing**: the rules give hints (e.g. *Spells known 5/6*), not hard locks. Add, swap or remove spells, feats or features any time, or fix class levels by hand.
- **Homebrew**: create spells, feats, items, features, subclasses, full classes, races and backgrounds. They appear alongside official content in every picker and in the level-up wizard.
- **Play features**:
  - **Dice roller**: click any modifier to roll it (checks, saves, skills, initiative, attacks, damage, spell attacks, death saves, hit dice). Shift-click rolls with advantage, Ctrl-click with disadvantage. A natural 20 makes the next damage roll critical. There's a roll log and a custom-dice tray.
  - **Actions tab**: a combat dashboard. Vitals, attacks, spells grouped into action / bonus action / reaction, features & abilities with Use buttons, slot summary, class resources, saving throws, standard actions, creatures.
  - **Action economy**: every attack, spell, feature, resource, standard action and creature action carries an **A** / **BA** / **R** badge (read from casting times and rules text, e.g. "as a bonus action", "use your reaction"; Moon druids' Wild Shape is a bonus action). In combat, rolling an attack, casting a spell or using a feature marks the matching action as used. Extra Attack and Multiattack let one Attack action cover several attacks, and the round bar shows "2/2 attacks". You get a warning when the action is already spent, when it isn't your turn, or when the bonus-action spell rule is broken. Attacks can be set to bonus action (off-hand) or reaction.
  - **Follow-up choices**: actions that need a decision ask for it. Wild Shape opens "Which beast?" (your saved forms, or the bestiary filtered by your druid level). Find Familiar and Find (Greater) Steed open the allowed creatures and replace your current familiar or steed.
  - **Wild Shape replaces your stat block**: the beast's Strength, Dexterity and Constitution, AC, speed and HP replace yours everywhere (abilities, saves, skills, initiative, AC, speed, the HP box). Saves and skills use the better of your proficiency and the beast's. Your attacks become the beast's actions, and spellcasting is locked until Beast Spells. Damage goes to the beast first, and you revert at 0 HP with the excess carried over.
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
  - **Automatic AC**: from worn armor and shield, Unarmored Defense (Barbarian/Monk), Draconic Resilience, magic items and the Defense style, plus a misc bonus. It warns about Stealth disadvantage and armor too heavy for your Strength. You can switch to manual.
  - **Inventory**: items keep their weapon and armor stats. Wearing armor updates AC; +Atk turns a weapon into an attack. Attunement (x/3), charges, coin weight, wealth in gp, quick "+25 gp" adjustments.
  - **Conditions** with rules text, exhaustion effects, passive Perception / Insight / Investigation, senses (darkvision filled in from your race).
  - **Granted spells**: racial magic (Tiefling, Drow…) and domain / oath / circle spells are added automatically at the right level.
  - **Session journal**, notes, companions (familiars, mounts), XP with quick-add and a progress bar, or milestone leveling.
  - **Undo / redo** for every sheet change (Ctrl+Z / Ctrl+Shift+Z).
  - **Printable sheet**: three pages (stats, spells, details) via the browser's Save as PDF.
- **Creation helpers**: roll or pick personality traits, ideals, bonds and flaws from your background's tables. Starting equipment from class and background is matched to real items, so armor is worn, AC is right and weapons are ready as attacks. During level-up you can swap a known invocation or maneuver.
- **Automatic modifiers**: equipped magic items (attuned when required) apply their bonuses: +N weapons to that weapon's attacks and damage, +N armor and shields, Cloak and Ring of Protection, Belts of Giant Strength and other score-setting items, spell attack and DC items, speed. Feats and features apply theirs too: Tough, Dwarven Toughness, Draconic Resilience HP, Alert, Mobile, Observant, Unarmored Movement, Fast Movement, Roving, Archery, Defense, Dueling, Medium Armor Master, Jack of All Trades, Remarkable Athlete and Aura of Protection. The **Modifiers** panel on the Features tab lists them all with a switch each, and you can add your own (e.g. "+1 AC from a blessing"). HP max, speed, AC, saves, skills, passives, initiative and attacks show the totals, with breakdowns on hover.
- **Optional rules** per character (⚙ Rules on the sheet, or in the creator): Tasha's Customizing Your Origin (move each racial increase), Tasha's optional class features, feats on/off, the variant encumbrance rule (speed penalties at Str × 5 / × 10), strict or relaxed multiclass prerequisites, and how HP is gained at level-up (player's choice, always average, always rolled, with a box to type your real roll). Exhaustion and Grappled/Restrained are applied to speed and HP max.
- **Extras tab: monsters, Wild Shape, familiars, steeds, summons**: a bestiary of 6,000+ stat blocks (5etools, SRD and Open5e's Tome of Beasts, Creature Codex, Level Up…) with presets that follow the rules: Wild Shape forms allowed at your druid level (Circle of the Moon included), Find Familiar (plus Pact of the Chain forms), Find (Greater) Steed and Beast Master companions. Each creature keeps its stat block with clickable checks, saves, to-hit and damage, plus its own HP with damage/heal/temp. **Wild Shape** spends a use, tracks the beast's HP in a banner on every tab, and reverts at 0 HP carrying the extra damage over to you. Creatures with attacks also appear on the Actions tab.
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

## Deploying to kind with Argo CD

### How it fits together

```
git push ──► GitHub Actions "Container image" (.github/workflows/image.yml)
               1. test:  npm ci, typecheck, unit tests
               2. image: build linux/amd64 + linux/arm64, push to ghcr.io/mzn-b/dnd-char-sheet
                         tags: sha-<7 chars>, <branch>, latest (default branch), <version> (v* tags)
               3. bump-deployment (default branch only): set newTag: sha-<…> in
                  deploy/k8s/overlays/kind/kustomization.yaml and commit it
                       │
Argo CD in kind ◄──────┘ watches deploy/k8s/overlays/kind on the default branch (polls every ~3 min)
   └─ syncs namespace "dnd": Secret dnd-db → Postgres StatefulSet → app Deployment (rolling update)
         app starts, waits for Postgres, applies pending SQL migrations, then reports ready
```

Git is the source of truth: the image tag running in the cluster is whatever the overlay in the repo says. To roll back, revert the bump commit (or pin `newTag` by hand) and Argo CD syncs to it. Pull requests build the image without pushing it; other branches push `sha-…` and `<branch>` tags you can try by editing `newTag`.

| Path | What it is |
| --- | --- |
| `deploy/k8s/base/` | The app: Deployment (probes `/api/ready` and `/api/health`, non-root, read-only filesystem) and Service. Reads `DATABASE_URL` from the Secret `dnd-db`, key `url`. |
| `deploy/k8s/components/postgres/` | Optional Kustomize component: a Postgres 16 StatefulSet with a 2 GiB volume, its Service and the `dnd-db` Secret. |
| `deploy/k8s/overlays/kind/` | What Argo CD deploys: base + postgres component, namespace `dnd`, image tag, and a Traefik `IngressRoute` for http://dnd.mazen.home. |
| `deploy/k8s/overlays/kind-nodeport/` | Optional: the kind overlay plus a fixed NodePort 30480, for clusters created with `deploy/kind/cluster.yaml`. |
| `deploy/kind/cluster.yaml` | kind cluster that maps NodePort 30480 to http://localhost:8080. |
| `deploy/argocd/application.yaml` | The Argo CD `Application` (automated sync, prune, self-heal, creates the namespace). |

### Setup

1. **Push to GitHub** and let the workflow run once (Actions tab). The image appears under the repository's **Packages**.
2. **Create the cluster**:
   ```bash
   kind create cluster --config deploy/kind/cluster.yaml
   ```
3. **Install Argo CD**:
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   kubectl -n argocd rollout status deploy/argocd-server
   ```
4. **Let the cluster pull the image.** GHCR packages start out **private**. Either make the package public (Package settings → Change visibility), or give the cluster a pull secret (a classic personal access token with `read:packages`):
   ```bash
   kubectl create namespace dnd
   kubectl -n dnd create secret docker-registry ghcr-pull \
     --docker-server=ghcr.io --docker-username=<github-user> --docker-password=<token>
   ```
   The Deployment already references `ghcr-pull`, and it's ignored when the secret doesn't exist.
5. **If the repository is private**, Argo CD also needs read access to it:
   `argocd repo add https://github.com/mzn-b/dnd-char-sheet.git --username <github-user> --password <token>` (or a repository Secret in the `argocd` namespace).
6. **Register the app**:
   ```bash
   kubectl apply -n argocd -f deploy/argocd/application.yaml
   ```
7. **Open the app** at **http://dnd.mazen.home** through Traefik (`deploy/k8s/overlays/kind/ingressroute.yaml`). It's a Traefik `IngressRoute` on the `web` entrypoint, set up like the Argo CD route. It needs:
   - the Traefik CRDs (`traefik.io/v1alpha1`) in the cluster
   - `dnd.mazen.home` resolving to wherever Traefik listens, like `argocd.mazen.home` (DNS or a hosts-file entry)

   To use another hostname, change the `Host(...)` rule.

   Without an ingress controller: `kubectl -n dnd port-forward svc/dnd-app 8080:80`, then http://localhost:8080.

   To skip both, create the cluster with `deploy/kind/cluster.yaml` and point the Application's `path` at `deploy/k8s/overlays/kind-nodeport`. Then the app is always on http://localhost:8080 through NodePort 30480. NodePorts are shared by the whole cluster. If Argo CD reports `provided port is already allocated`, another service already uses that port (`kubectl get svc -A | grep 30480`): pick a free one (30000–32767) in that overlay and in `cluster.yaml`, or stay with port-forward.

   For the Argo CD UI:
   ```bash
   kubectl -n argocd port-forward svc/argocd-server 8443:443   # https://localhost:8443, user admin
   kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
   ```

If you renamed or forked the repository, change `ghcr.io/mzn-b/dnd-char-sheet` in `deploy/k8s/base/deployment.yaml` and the overlay, and `repoURL` in the Application.

### Where the database lives

**Postgres is not inside the GHCR image.** The image contains only the API and the built web client, and it is stateless: everything (characters, homebrew, settings, the cache of fetched rules content) lives in Postgres, reached through `DATABASE_URL`. Schema migrations ship in the image and run automatically when the app starts, so upgrading is just a new image. Running several replicas is fine.

So you don't need a global database in your kind cluster. You have two options:

- **Per-app Postgres (the default for kind).** The `components/postgres` component deploys a dedicated Postgres StatefulSet next to the app in the `dnd` namespace, managed by the same Argo CD Application. Its data sits on a PersistentVolumeClaim (kind's built-in `standard` local-path storage), so it survives pod restarts, re-syncs and new images. It is lost when you `kind delete cluster`, so back up first:
  ```bash
  kubectl -n dnd exec dnd-postgres-0 -- pg_dump -U dnd dnd > dnd-backup.sql
  # restore into a fresh cluster:
  kubectl -n dnd exec -i dnd-postgres-0 -- psql -U dnd dnd < dnd-backup.sql
  ```
  The credentials in `components/postgres/secret.yaml` are development values committed to git. That's fine for a local kind cluster. For anything shared, use Sealed Secrets or External Secrets instead.
- **A shared database you already run** (a cluster-wide Postgres, CloudNativePG, a managed DB…). Remove `../../components/postgres` from the overlay's `components`, create a database and user for the app, and provide the connection string yourself:
  ```bash
  kubectl -n dnd create secret generic dnd-db \
    --from-literal=url=postgres://dnd:<password>@<postgres-service>.<namespace>.svc:5432/dnd
  ```
  The app creates its tables on first start.

The rules-content cache (`api_cache`) is also in the database. A new, empty database works right away; content is fetched again from the public APIs as you use it.

### Troubleshooting

- **A picker shows "… couldn't be loaded" or "still downloading", or 5etools content is missing.** The server fetches rules content from the internet (dnd5eapi.co, api.open5e.com, raw.githubusercontent.com) the first time it's needed, then serves it from Postgres. Check that the pod can reach those hosts (cluster egress, proxy, DNS). The Sources page shows the 5etools download state and which files failed, with a Retry button. `kubectl -n dnd logs deploy/dnd-app` prints `5etools data loaded in …s` or the error.
- **Old ReplicaSets.** The Deployment sets `revisionHistoryLimit: 0`, so a rollout deletes the superseded ReplicaSet and Argo CD only shows the current one. Roll back by reverting the image tag in Git (Argo CD syncs it), not with `kubectl rollout undo`.
- Tuning (environment variables on the Deployment): `FETCH_TIMEOUT_MS` (per upstream request, default 30000), `FETCH_CONCURRENCY` (parallel upstream requests, default 8), `PROVIDER_WAIT_MS` (how long a search waits for a slow source before answering without it, default 20000), `FIVETOOLS_DATA_URL` (point at your own 5etools data mirror).

### Building the image yourself

```bash
docker build -t dnd-char-sheet .
# If Docker Hub rate-limits you:
docker build --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine -t dnd-char-sheet .
```

To try a local build in kind without GHCR, tag it with the name the manifests use and load it into the cluster. Then set `newTag: dev` in the overlay (with Argo CD that means committing it, or pausing auto-sync while you experiment):

```bash
docker build -t ghcr.io/mzn-b/dnd-char-sheet:dev .
kind load docker-image ghcr.io/mzn-b/dnd-char-sheet:dev --name dnd
```

## Project layout

```
docker-compose.yml        Postgres (+ optional app container)
Dockerfile                Builds web + API into one image (no database inside)
.github/workflows/        CI: tests, multi-arch image to GHCR, GitOps tag bump
deploy/                   Kubernetes manifests (Kustomize), kind cluster config, Argo CD Application
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
| `GET /api/content/:type?q=&class=&level=&maxLevel=` | Search spells, feats, items, races, backgrounds, features, subclasses, classes or monsters across all sources |
| `GET /api/content/:type/:source/:key` | Full, normalized detail for one entry, including its `effects` and `choices` (`source` = `srd` \| `open5e` \| `5etools` \| `homebrew`) |
| `GET /api/rules/classes/:source/:key` | Class progression (hit die, per-level features, ASIs, spell table) for the level-up wizard |
| `GET /api/rules/subclasses/:source/:key/levels` | Subclass features, option progressions and (for subclass casters) spellcasting per level |
| `GET/PUT /api/sources/providers` | Enable or disable SRD / Open5e / 5etools |
| `GET /api/sources/5etools/brew/catalog?q=`, `GET/POST/DELETE /api/sources/5etools/brew` | Browse and enable 5etools homebrew files |
| `GET/POST /api/homebrew`, `PUT/DELETE /api/homebrew/:id` | Homebrew CRUD |
