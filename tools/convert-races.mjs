#!/usr/bin/env node
/**
 * Arkadia — Races.md → data/races.json
 *
 * Usage (from the Website folder):
 *   node tools/convert-races.mjs
 *   node tools/convert-races.mjs "A:/Obsidian/Arkadia/Races.md" "data/races.json"
 *
 * Expected note layout:
 *   intro text + d20 → Trait Points table
 *   # <Race group>          (e.g. Faeren, Beastren) + one-line description
 *   ## <Race>
 *   *flavour line*
 *   Size(s): ...
 *   - <cost> - (*Unique - <group>*) trait text
 * A "# Notes" section is kept as designer notes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? "A:/Obsidian/Arkadia/Races.md";
const OUT = path.resolve(process.argv[3] ?? path.join(HERE, "..", "data", "races.json"));
const NOTE_SECTIONS = ["notes", "old stuff"];
const SCHEMA_VERSION = 1;

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const clean = (s) => s.replace(/\\\[/g, "[").replace(/\\\]/g, "]").replace(/[ \t]+$/g, "").replace(/\s{2,}/g, " ").trim();

function parseTable(lines) {
  const rows = lines.filter((l) => l.trim().startsWith("|"))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  return rows.slice(2)
    .filter((r) => r.length >= 2 && /\d/.test(r[0]))
    .map((r) => ({ roll: r[0], points: Number(r[1]) || r[1] }));
}

function parseTrait(line) {
  const m = line.match(/^\s*[-*]\s+(\d+)\s*-\s*(.*)$/);
  if (!m) return null;
  let text = m[2];
  let unique = null;
  const u = text.match(/^\(\s*\*?\s*Unique\s*-\s*([^*)]+?)\s*\*?\s*\)\s*/i);
  if (u) { unique = u[1].trim(); text = text.slice(u[0].length); }
  return { cost: Number(m[1]), unique, text: clean(text).replace(/[,;]$/, "") };
}

function parse(md) {
  md = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const data = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: path.basename(SRC),
    intro: "",
    pointsTable: [],
    groups: [],
    designerNotes: [],
  };

  // split into heading blocks
  const blocks = [{ depth: 0, title: "", lines: [] }];
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) blocks.push({ depth: h[1].length, title: h[2], lines: [] });
    else blocks.at(-1).lines.push(line);
  }

  let group = null, inNotes = false;
  const unknown = [];
  for (const b of blocks) {
    if (b.depth === 0) {
      data.intro = clean(b.lines.filter((l) => l.trim() && !l.trim().startsWith("|")).join(" "));
      data.pointsTable = parseTable(b.lines);
      continue;
    }
    if (b.depth === 1) {
      inNotes = NOTE_SECTIONS.includes(b.title.trim().toLowerCase());
      if (inNotes) {
        const note = b.lines.join("\n").trim();
        if (note) data.designerNotes.push(note);
        group = null;
        continue;
      }
      group = { id: slug(b.title), name: b.title.trim(), description: clean(b.lines.filter((l) => l.trim()).join(" ")) || null, races: [] };
      data.groups.push(group);
      continue;
    }
    if (inNotes) {
      const note = [`**${b.title.trim()}**`, ...b.lines].join("\n").trim();
      data.designerNotes.push(note);
      continue;
    }
    if (b.depth === 2 && group) {
      const race = { id: slug(b.title), name: b.title.trim(), sizes: null, description: null, traits: [] };
      for (const raw of b.lines) {
        const line = raw.trim();
        if (!line) continue;
        const trait = parseTrait(line);
        if (trait) { race.traits.push(trait); continue; }
        const size = line.match(/^sizes?\s*:\s*(.*)$/i);
        if (size) { race.sizes = clean(size[1]).replace(/\.$/, ""); continue; }
        const flavor = line.match(/^\*([^*].*?)\*$/);
        if (flavor && !race.description) { race.description = clean(flavor[1]); continue; }
        unknown.push(`${race.name}: ${line}`);
      }
      group.races.push(race);
    }
  }
  return { data, unknown };
}

if (!fs.existsSync(SRC)) {
  console.error(`Races note not found: ${SRC}`);
  process.exit(1);
}
const { data, unknown } = parse(fs.readFileSync(SRC, "utf8"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");

for (const g of data.groups) {
  console.log(`✓ ${g.name}: ${g.races.map((r) => `${r.name} (${r.traits.length})`).join(", ")}`);
}
console.log(`\nRaces written to ${OUT}`);
if (unknown.length) console.log(`Lines not recognised (left out):\n  ${unknown.join("\n  ")}`);
