#!/usr/bin/env node
/**
 * Arkadia — "Conditions.md" → data/conditions.json
 *
 * Usage (from the Website folder):
 *   node tools/convert-conditions.mjs
 *   node tools/convert-conditions.mjs "A:/Obsidian/Arkadia/Conditions.md" "data/conditions.json"
 *
 * The note is laid out as
 *   # Buffs / # Debuffs          → what kind of condition
 *   ## Weak Debuffs / ## Strong … → how strong (optional)
 *   ### Burn                      → one condition; the text under it is its description
 * so every condition gets a label like "Weak Debuff". Empty groups are fine.
 *
 *   # Connections                 → a table: | Condition | Connections |
 *   | Chill | [[Ice]], [[Void]] |   → where each condition comes from (crystals or classes);
 *                                    stored as "sources" and shown as links on the condition.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import CONFIG from "../config.mjs";
import { expandEmbeds } from "./embeds.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? `${CONFIG.vault}/${CONFIG.notes.conditions ?? "Conditions.md"}`;
const OUT = path.resolve(process.argv[3] ?? path.join(HERE, "..", "data", "conditions.json"));
const SCHEMA_VERSION = 1;

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const tidy = (lines) => lines.join("\n")
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
  .replace(/\[\[([^\]#|]+)(#[^\]]*)?\]\]/g, "$1")
  .replace(/\\([*[\]_|])/g, "$1")
  .replace(/^\s*(\*{3,}|-{3,}|_{3,})\s*$/gm, "")
  .replace(/[ \t]+$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

/** "Debuffs" → "debuff", "Weak Debuffs" → "weak"; anything else → null. */
const kindOf = (title) => (/\bdebuffs?\b/i.test(title) ? "debuff" : /\bbuffs?\b/i.test(title) ? "buff" : null);
const strengthOf = (title) => (/\bweak\b/i.test(title) ? "weak" : /\bstrong\b/i.test(title) ? "strong" : null);
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function parse(md) {
  md = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const conditions = [], warnings = [];
  const used = new Set();
  const uid = (base) => { let id = base || "condition", n = 2; while (used.has(id)) id = `${base}-${n++}`; used.add(id); return id; };

  let kind = null, strength = null, current = null, inConnections = false;
  const connections = new Map(); // condition name (lowercase) → ["Ice", "Void", …]
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h && h[1].length <= 3) {
      const depth = h[1].length, title = h[2].trim();
      if (depth === 1) {
        inConnections = /^connections?$/i.test(title);
        kind = inConnections ? null : kindOf(title); strength = null; current = null;
        continue;
      }
      if (depth === 2) { strength = strengthOf(title); kind = kindOf(title) ?? kind; current = null; continue; }
      if (!kind) { warnings.push(`"${title}" isn't under a Buffs or Debuffs heading, skipped`); current = null; continue; }
      current = { id: uid(slug(title)), name: title, kind, strength, lines: [] };
      conditions.push(current);
      continue;
    }
    if (inConnections) {
      // | Chill | [[Ice]], [[Void]], [[Water]] |  (header and divider rows have no [[links]])
      const cells = line.trim().match(/^\|(.*)\|$/)?.[1].split("|").map((c) => c.trim());
      const links = cells?.slice(1).join(" ").match(/\[\[[^\]]+\]\]/g);
      if (cells && links) {
        const name = cells[0].replace(/\[\[|\]\]/g, "").trim();
        connections.set(name.toLowerCase(), links.map((l) => l.slice(2, -2).split(/[|#]/)[0].trim()));
      }
      continue;
    }
    if (current) current.lines.push(line);
  }
  for (const name of connections.keys()) {
    if (!conditions.some((c) => c.name.toLowerCase() === name)) warnings.push(`Connections lists "${name}", which isn't a condition yet`);
  }

  return {
    warnings,
    conditions: conditions.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,                 // "buff" | "debuff"
      strength: c.strength,         // "weak" | "strong" | null
      label: [c.strength && cap(c.strength), cap(c.kind)].filter(Boolean).join(" "),
      body: tidy(c.lines),
      sources: connections.get(c.name.toLowerCase()) ?? [], // crystal or class names, from # Connections
    })),
  };
}

if (!fs.existsSync(SRC)) {
  console.error(`Conditions note not found: ${SRC}`);
  process.exit(1);
}
const embedWarnings = [];
const { conditions, warnings } = parse(expandEmbeds(fs.readFileSync(SRC, "utf8"), path.dirname(path.resolve(SRC)), (w) => embedWarnings.push(w)));
warnings.push(...embedWarnings);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), source: path.basename(SRC), conditions }, null, 2) + "\n");

for (const c of conditions) console.log(`✓ ${c.name.padEnd(14)} ${c.label.padEnd(14)} ${c.sources.join(", ")}`);
for (const w of warnings) console.warn(`  ! ${w}`);
console.log(`\nConditions written to ${OUT}`);
