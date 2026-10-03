#!/usr/bin/env node
/**
 * Arkadia — "Basic Info.md" → data/info.json
 *
 * Usage (from the Website folder):
 *   node tools/convert-info.mjs
 *   node tools/convert-info.mjs "A:/Obsidian/Arkadia/Basic Info.md" "data/info.json"
 *
 * Each "## Heading" becomes a panel, each "### Heading" inside it a sub box.
 * A line that is just *Important* marks the panel as important (shown larger).
 * Text, lists and tables are kept as Markdown. "# Notes" (or any "# " section) is ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? "A:/Obsidian/Arkadia/Basic Info.md";
const OUT = path.resolve(process.argv[3] ?? path.join(HERE, "..", "data", "info.json"));
const SCHEMA_VERSION = 1;

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Keep Markdown, but drop Obsidian escapes/links and tidy blank lines. */
const tidy = (lines) => lines.join("\n")
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
  .replace(/\[\[([^\]#|]+)(#[^\]]*)?\]\]/g, "$1")
  .replace(/\\([*[\]_|])/g, "$1")
  .replace(/[ \t]+$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

function parse(md) {
  md = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const panels = [];
  const used = new Set();
  const uid = (base) => { let id = base || "panel", n = 2; while (used.has(id)) id = `${base}-${n++}`; used.add(id); return id; };

  let panel = null, section = null, skipping = false;
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) {
      const depth = h[1].length, title = h[2].trim();
      if (depth === 1) { skipping = true; panel = section = null; continue; } // "# Notes" etc.
      if (depth === 2) {
        skipping = false;
        panel = { id: uid(slug(title)), title, important: false, lines: [], sections: [] };
        panels.push(panel); section = null;
        continue;
      }
      if (panel && !skipping) {
        section = { id: slug(title), title, lines: [] };
        panel.sections.push(section);
        continue;
      }
    }
    if (skipping || !panel) continue;
    if (/^\s*\*important\*\s*$/i.test(line)) { panel.important = true; continue; }
    (section ?? panel).lines.push(line);
  }

  return panels.map((p) => ({
    id: p.id,
    title: p.title,
    important: p.important,
    body: tidy(p.lines),
    sections: p.sections.map((s) => ({ id: s.id, title: s.title, body: tidy(s.lines) })),
  }));
}

if (!fs.existsSync(SRC)) {
  console.error(`Info note not found: ${SRC}`);
  process.exit(1);
}
const panels = parse(fs.readFileSync(SRC, "utf8"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: path.basename(SRC), panels }, null, 2) + "\n");

for (const p of panels) console.log(`✓ ${p.important ? "★ " : "  "}${p.title}${p.sections.length ? ` (${p.sections.length} sub boxes)` : ""}`);
console.log(`\nInfo written to ${OUT}`);
