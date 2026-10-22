# Arkadia Website

## Settings: `config.mjs`

Shared settings live in `config.mjs`, read by both the site and the converters:

- `playtest`: what playtesters see by default (max class level, max spell BA, spells hidden by name ending,
  and whole classes or crystals to hide)
- `classes`: which class notes are converted (required tag, excluded tags)
- `crystals`: which crystals are converted, in order, each with its colour on the site (`color`), plus an
  optional `lightColor` for the light themes (pale colours need one; without it `color` is used everywhere)
- `notes`: file names of the races, equipment, info and conditions notes

After editing it, refresh the browser. If you changed which notes are read (vault, classes, crystals),
run `updateFromDocs.bat` too.

### Private settings: `config.local.mjs`

Anything that shouldn't be on GitHub goes in `config.local.mjs`, which `.gitignore` keeps out of git:

- `vault`: where your Obsidian vault is

Only the converters read it (through `config.mjs`, which adds its settings on top of its own); the
website never loads it, and `tools/serve.mjs` won't serve it to other devices. On a new computer or a
fresh clone, copy `config.local.example.mjs` to `config.local.mjs` and fill it in.

## Running it locally

Double-click `start.bat`. It starts a small local server and opens http://localhost:8080.
Or from this folder: `node tools/serve.mjs` (add `--port 3000` to change the port).

Opening `index.html` directly won't work: browsers block the data files on `file://` pages.

## Letting playtesters see it

- **Same network (e.g. at the table):** double-click `startLan.bat` (or run `node tools/serve.mjs --lan`).
  It prints an address like `http://192.168.1.20:8080` that phones and laptops on your Wi-Fi can open.
- **Over the internet:** the site is plain static files, so any static host works
  (GitHub Pages, Netlify, Cloudflare Pages, or your own web server). Upload everything
  except `tools/`. Nothing needs building.

## Updating game data

After editing your notes, run:

```
node tools/convert-all.mjs
```

This runs all the converters below. Refresh the browser to see changes.
(Or just double-click `updateFromDocs.bat`.)

### Patch notes

Every update compares the old data with the new and, if anything changed, writes a note to
`log/YYYY-MM-DD_HH-MM.md`, e.g.:

```
## Magic
- **Added** spell: Fire › Ember Ward
- **Changed** Fire › Rocket Jump › mana: 1 → 3
- **Changed** Fire › Conjure Flame › text
  > … gain ~~3~~ ==4== Blaze charges …
```

`~~struck~~` words were removed, `==highlighted==` words were added. No file is written when nothing changed.
The logic is in `tools/changelog.mjs` (no dependencies).

### Classes

```
node tools/convert-classes.mjs
```

Defaults: reads `A:/Obsidian/Arkadia/Classes`, writes `data/classes/`.
Override with: `node tools/convert-classes.mjs <notesFolder> <outFolder>`

Rules: a note is included if tagged `#combat_class` and not `#wip`.
`# Old stuff` and `# Notes` sections are ignored. Old JSON is cleared on each run.
Refresh the browser to see changes.

### Races

```
node tools/convert-races.mjs
```

Reads `A:/Obsidian/Arkadia/Races.md`, writes `data/races.json`. Each `# heading` is a race group
(Faeren, Beastren), each `## heading` a race. Traits are `- <cost> - text`; a leading
`(*Unique - X*)` becomes a "Unique: X" tag. `Size:`/`Sizes:` and the italic line under the
race name become its size and description. `# Notes` becomes designer notes.
Any line the converter doesn't recognise is listed when it runs, so nothing disappears silently.

### Magic

```
node tools/convert-magic.mjs
```

Reads `A:/Obsidian/Arkadia/Magic/<Crystal>.md`, writes one file per crystal to `data/magic/`
(`fire.json`, `ice.json`, ...) plus `data/magic/index.json`, which the site uses to find them. Only the crystals
listed under `crystals` in `config.mjs` are converted.
Layout follows Fire.md: `# Overview` becomes mechanics (embeds like `![[Conditions#Burn]]` are
pulled in from the vault), `# Spells` holds `## BA N+` tiers and `### Spell` entries with a
`***BA | CA | Mana | Concentration***` line and `N CA - Upgrade` lines. Any other `#` section
(Notes, Ideas...) is ignored. Spells with no cost line become drafts.

`# Signature Spells` (see Water.md) holds spells only one class can learn. Each is a `### Spell` with the class
name on its own line between the title and the cost line:

```
### Water Spear
Spellblade
***4 CA | 3 Mana***
```

They're shown at the bottom of the crystal page (labelled with their class) and in a Signature Spells list on
that class's page (labelled with their crystal). One missing its class or cost line only shows with drafts on.

What playtesters see by default is set under `playtest` in `config.mjs`:
`maxClassLevel` (class levels), `maxSpellBA` (spell tiers), `hideSpellsEndingWith` (e.g. Talents), and
`hiddenClasses` / `hiddenCrystals` (whole classes or crystals by name, e.g. `["Mind", "Wind"]`). A hidden class or
crystal disappears from its tab, the overview, the filters, search and condition source buttons; it's still
converted, so it shows up (with a Hidden badge) once drafts are switched on.
Everything else appears when "Show drafts & hidden content" is switched on (Settings tab, bottom of the sidebar).

### Equipment

```
node tools/convert-equipment.mjs
```

Reads `A:/Obsidian/Arkadia/Weapons & Armour.md`, writes `data/equipment.json`. The intro and
`## Equipment Attributes` list become the page header and attribute glossary (the glossary text
also shows when hovering an attribute on a card). `# Weapons` → `## Melee Weapons` / `Ranged Weapons` /
`Spell Foci` → `### Item`; `# Armour` and `# Shields` → `## Light/Medium/Heavy` → `### Item`.
`# Notes` is ignored. Any bold `**Key:**` line the converter doesn't know is kept and shown on the card.

### Info

```
node tools/convert-info.mjs
```

Reads `A:/Obsidian/Arkadia/Basic Info.md`, writes `data/info.json`. Each `## Heading` becomes a panel and
each `### Heading` inside it a sub box. A line containing only `*Important*` makes that panel larger
(important panels are shown first, two per row). Text, bullet lists and tables are shown as written.
Any `# ` section (e.g. `# Notes`) is ignored.

### Conditions

```
node tools/convert-conditions.mjs
```

Reads `A:/Obsidian/Arkadia/Conditions.md`, writes `data/conditions.json` (one file for all of them).
`# Buffs` / `# Debuffs` say what kind a condition is, `## Weak …` / `## Strong …` how strong, and each
`### Name` under them is one condition, so it gets a tag like "Weak Debuff". Empty sections are fine.

### Embeds

A line that is only an Obsidian embed, like `![[Conditions#Taunt]]`, is replaced by that section of the
other note and shown as a sub box (`tools/embeds.mjs`, used by every converter). If the embedded section is
a condition, its title links to the Conditions page. In a crystal's `# Overview`, embeds become mechanics
as before.

## Files

| Path                         | What it is                                      |
| ---------------------------- | ----------------------------------------------- |
| `config.mjs`                 | Shared settings (see top of this README)        |
| `config.local.mjs`           | Private settings, not in git (vault path)       |
| `config.local.example.mjs`   | Template for `config.local.mjs`                 |
| `index.html`                 | Page shell and sidebar                          |
| `css/themes.css`             | Colour themes, one block of colours each        |
| `css/styles.css`             | Layout and styling (uses the theme's colours)   |
| `js/app.js`                  | Tabs, routing, clicks and start-up              |
| `js/core.js`                 | Shared settings, state, Markdown, masonry layout, data loading |
| `js/classes.js`, `js/magic.js`, `js/races.js`, `js/equipment.js`, `js/info.js`, `js/conditions.js`, `js/search.js` | One file per page |
| `js/copy.js`                 | Copy-to-clipboard corner                        |
| `js/settings.js`             | Settings page: hidden content switch, theme picker (list of themes) |
| `data/classes/`              | Generated class JSON (don't edit by hand)       |
| `data/class-summaries.json`  | Per class: one-line `summary` and `icon` (SVG shapes on a 24×24 grid; edit freely) |
| `data/races.json`            | Generated race data (don't edit by hand)        |
| `tools/convert-all.mjs`      | Runs every converter, then writes patch notes   |
| `tools/changelog.mjs`        | Compares old/new data for the patch notes       |
| `log/`                       | Patch notes, one file per update with changes   |
| `tools/convert-races.mjs`    | Races.md → JSON converter                       |
| `tools/convert-magic.mjs`    | Magic notes → JSON converter                    |
| `tools/convert-equipment.mjs`| Weapons & Armour.md → JSON converter            |
| `data/equipment.json`        | Generated equipment data (don't edit by hand)   |
| `tools/convert-info.mjs`     | Basic Info.md → JSON converter                  |
| `data/info.json`             | Generated info panels (don't edit by hand)      |
| `tools/convert-conditions.mjs`| Conditions.md → JSON converter                 |
| `data/conditions.json`       | Generated conditions (don't edit by hand)       |
| `tools/embeds.mjs`           | Fills in `![[Note#Heading]]` embeds for the converters |
| `data/magic/`                | Generated spell data, one file per crystal (don't edit by hand) |
| `tools/convert-classes.mjs`  | Notes → JSON converter                          |
| `tools/serve.mjs`            | Local server                                    |

A page whose data file is missing shows a "work in progress" placeholder until `updateFromDocs.bat`
has been run. To add a new page: write `js/<page>.js`, then add it to `TABS` and `render()` in `js/app.js`.

## Class JSON shape

| Field            | What it holds                                                       |
| ---------------- | ------------------------------------------------------------------- |
| `id`, `name`     | `samurai`, `Samurai`                                                |
| `tags`           | Note tags minus `combat_class` (e.g. `melee`, `offensive`)          |
| `description`    | Blockquote under the tags, if any                                   |
| `healthPerLevel` | `{ raw, dice, flat, stat }` from `**Health per Level:**`            |
| `levels`         | Level table rows: `{ level, ca: { total, gain }, grants }`          |
| `mechanics`      | `# Mechanic: X` / `# Mechanics` subsections                         |
| `features`       | `## <level> - <name>` entries: `{ id, level, name, abilityType, cost, body }` (left column) |
| `abilityGroups`  | Abilities bought with a class resource (right column): `{ id, name, resource, mechanicId, abilities[] }` |
| `sections`       | Any other `#` section (e.g. Stances → entries → options)            |
| `drafts`         | Features with no level, name, or real description, plus `draftReason` |
| `designerNotes`  | Italic margin notes and loose text after a trailing `***`           |

`body` fields are Markdown.

A feature becomes an **ability** (right column) when its text starts with `**X Ability:**`
(e.g. `**Spellstrike Ability:**`) or with a standalone cost line like `**2 Inspiration Points**`.
Abilities are grouped by that resource. If a mechanic's name starts with the same word
(e.g. `# Mechanic: Inspirations`), its explanation is shown at the top of the group.
Everything else stays a feature on the left.

The level table on each class page is built from the note's level table plus every
feature and ability's level, so adding levels 4–10 later needs no website changes.

## Themes

The Settings tab lets each reader pick a colour theme (saved in their browser). A theme is one block of
colour values in `css/themes.css`; `styles.css` only refers to those colours by name. The first block is the
default, and any colour a theme leaves out falls back to it.

To add a theme: copy a block in `css/themes.css`, give it a new `[data-theme="name"]` and change the colours,
then add `{ id: "name", name: "Name", blurb: "..." }` to `THEMES` in `js/settings.js`. Its card on the Settings
page draws a small preview from its own colours. For a light theme, set `color-scheme: light`, give it a
deeper `--debuff`, and add `light: true` to its line in `THEMES` so crystals switch to their `lightColor`.

