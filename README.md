# Arkadia Website

## Running it locally

Double-click `start.bat`. It starts a small local server and opens http://localhost:8080.
Or from this folder: `node tools/serve.mjs` (add `--port 3000` to change the port).

Opening `index.html` directly won't work: browsers block the data files on `file://` pages.

## Letting playtesters see it

- **Same network (e.g. at the table):** `node tools/serve.mjs --lan` prints an address like
  `http://192.168.1.20:8080` that phones and laptops on your Wi-Fi can open.
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
listed in `CRYSTALS` at the top of the script are converted (currently Fire, Ice, Lightning).
Layout follows Fire.md: `# Overview` becomes mechanics (embeds like `![[Conditions#Burn]]` are
pulled in from the vault), `# Spells` holds `## BA N+` tiers and `### Spell` entries with a
`***BA | CA | Mana | Concentration***` line and `N CA - Upgrade` lines. Any other `#` section
(Notes, Ideas...) is ignored. Spells with no cost line become drafts.

What playtesters see by default is set in `CONFIG` at the top of `js/app.js`:
`maxLevel` (class levels), `maxBA` (spell tiers) and `hiddenSpells` (e.g. Talents).
Everything else appears when "Show drafts & hidden content" is switched on.

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

## Files

| Path                         | What it is                                      |
| ---------------------------- | ----------------------------------------------- |
| `index.html`                 | Page shell and sidebar                          |
| `css/styles.css`             | Theme, colours and layout                       |
| `js/app.js`                  | Tabs, class pages, search                       |
| `data/classes/`              | Generated class JSON (don't edit by hand)       |
| `data/class-summaries.json`  | One-line class descriptions (edit freely)       |
| `data/races.json`            | Generated race data (don't edit by hand)        |
| `tools/convert-all.mjs`      | Runs every converter                            |
| `tools/convert-races.mjs`    | Races.md → JSON converter                       |
| `tools/convert-magic.mjs`    | Magic notes → JSON converter                    |
| `tools/convert-equipment.mjs`| Weapons & Armour.md → JSON converter            |
| `data/equipment.json`        | Generated equipment data (don't edit by hand)   |
| `tools/convert-info.mjs`     | Basic Info.md → JSON converter                  |
| `data/info.json`             | Generated info panels (don't edit by hand)      |
| `data/magic/`                | Generated spell data, one file per crystal (don't edit by hand) |
| `tools/convert-classes.mjs`  | Notes → JSON converter                          |
| `tools/serve.mjs`            | Local server                                    |

Tabs marked WIP (Info, Magic, Equipment) show a placeholder until their data exists.
To change a placeholder message, edit the `TABS` list near the top of `js/app.js`.

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
