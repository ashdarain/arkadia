#!/usr/bin/env node
/**
 * Arkadia — Obsidian class notes → JSON
 *
 * Usage (from the Website folder):
 *   node tools/convert-classes.mjs
 *   node tools/convert-classes.mjs "A:/Obsidian/Arkadia/Classes" "data/classes"
 *
 * Includes notes tagged #combat_class, skips anything tagged #wip.
 * No dependencies — plain Node 18+.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = process.argv[2] ?? "A:/Obsidian/Arkadia/Classes";
const OUT_DIR = path.resolve(process.argv[3] ?? path.join(HERE, "..", "data", "classes"));

const REQUIRED_TAG = "combat_class";
const EXCLUDED_TAGS = ["wip"];
const IGNORED_SECTIONS = ["old stuff", "notes"]; // h1 sections that are design scratch space
const SCHEMA_VERSION = 2;

// ---------- helpers ----------

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const isSeparator = (l) => /^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(l);
const isTagLine = (l) => /^\s*(#[A-Za-z][\w\-/]*\s*)+$/.test(l);

function uniqueId(base, used) {
  let id = base || "item", n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

/** Clean a block of body lines. Text after a trailing separator is treated as a loose design note. */
function cleanBody(lines) {
  const notes = [];
  let lastSep = -1;
  lines.forEach((l, i) => { if (isSeparator(l)) lastSep = i; });
  let body = lines;
  if (lastSep >= 0) {
    const after = lines.slice(lastSep + 1).join("\n").trim();
    if (after) { notes.push(after); body = lines.slice(0, lastSep); }
  }
  const text = body
    .filter((l) => !isSeparator(l))
    .filter((l) => !/^\s*\*{3}\s*level \d+\s*\*{3}\s*$/i.test(l)) // stray "***Level 1***"
    .join("\n")
    .replace(/\\\[/g, "[").replace(/\\\]/g, "]")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, notes };
}

/** "4 (+4)" -> { total: 4, gain: 4 } */
function parseCA(cell) {
  const m = cell.match(/^(\d+)\s*\(\s*([+-]?\d+)\s*\)$/);
  if (m) return { total: +m[1], gain: +m[2] };
  if (/^\d+$/.test(cell)) return { total: +cell, gain: null };
  return null;
}

/** "1d6+4+CON" -> structured */
function parseHealth(raw) {
  if (!raw) return null;
  const m = raw.replace(/\s/g, "").match(/^(\d+)d(\d+)(?:\+(\d+))?(?:\+([A-Z]{3}))?$/i);
  if (!m) return { raw, dice: null, flat: null, stat: null };
  return { raw, dice: `${m[1]}d${m[2]}`, flat: m[3] ? +m[3] : 0, stat: m[4]?.toUpperCase() ?? null };
}

function parseTable(lines) {
  const rows = lines.filter((l) => l.trim().startsWith("|"))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.toLowerCase());
  const col = (name) => header.indexOf(name);
  return rows.slice(2) // skip header + |---| row
    .filter((r) => /^\d+$/.test(r[col("level")] ?? ""))
    .map((r) => ({
      level: +r[col("level")],
      ca: parseCA(r[col("ca")] ?? ""),
      grants: (r[col("features")] ?? "") || null,
    }));
}

/** Split markdown into heading blocks: [{ depth, title, lines }] with a depth-0 preamble. */
function blocks(md) {
  const out = [{ depth: 0, title: "", lines: [] }];
  let inCode = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const h = !inCode && line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) out.push({ depth: h[1].length, title: h[2], lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

/** A feature is a draft if it has no level, no name, no body, or only a short fragment. */
function draftReason(f) {
  if (f.level == null) return "no level";
  if (!f.name) return "no name";
  if (!f.body) return "no description";
  if (f.body.length < 60 && !/[.!?)]/.test(f.body)) return "fragment";
  return null;
}

/** Pull "N <Group> Point(s)" mentions out of an ability's text, e.g. "1 Spellstrike Point" or "1–2 Alacrity Points". */
function costFromText(body, group) {
  const re = new RegExp(`(\\d+)\\s+${group}\\s+Points?`, "gi");
  const nums = [...new Set([...body.replace(/[*_]/g, "").matchAll(re)].map((m) => +m[1]))].sort((a, b) => a - b);
  if (!nums.length) return null;
  const n = nums.length === 1 ? `${nums[0]}` : `${nums[0]}–${nums.at(-1)}`;
  return `${n} ${group} Point${nums.at(-1) === 1 ? "" : "s"}`;
}

/** Move features that belong to a resource system (Spellstrike, Alacrity, Inspiration...) into ability groups. */
function splitAbilities(cls) {
  const groups = new Map();
  cls.features = cls.features.filter((f) => {
    const fromCost = f.cost?.match(/^\S+\s+(\w+)\s+Points?$/i)?.[1];
    const group = f.abilityType ?? fromCost;
    if (!group) return true;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({
      id: f.id, level: f.level, name: f.name,
      cost: f.cost ?? costFromText(f.body, group),
      body: f.body,
    });
    return false;
  });
  cls.abilityGroups = [...groups.entries()].map(([group, abilities]) => {
    const mech = cls.mechanics.find((m) => m.name.toLowerCase().startsWith(group.toLowerCase()));
    return {
      id: slug(group) + "-abilities",
      name: mech ? mech.name : `${group} Abilities`,
      resource: group,
      mechanicId: mech?.id ?? null,
      abilities,
    };
  });
}

// ---------- main parse ----------

function parseClass(md, fileName) {
  md = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const name = path.basename(fileName, ".md");
  const tags = [...new Set(
    md.split("\n").filter(isTagLine).join(" ").match(/#[A-Za-z][\w\-/]*/g)?.map((t) => t.slice(1).toLowerCase()) ?? []
  )];

  const cls = {
    schemaVersion: SCHEMA_VERSION,
    id: slug(name),
    name,
    tags: tags.filter((t) => t !== REQUIRED_TAG),
    description: null,
    healthPerLevel: null,
    levels: [],
    mechanics: [],
    features: [],      // left column: class features
    abilityGroups: [], // right column: abilities bought with a class resource
    sections: [],      // class-specific option systems (e.g. Samurai stances)
    drafts: [],        // half-written features — hidden by default on the site
    designerNotes: [], // your margin notes, kept out of player-facing text
    source: `Classes/${fileName}`,
  };
  const report = { ignored: [] };
  const featureIds = new Set(), draftIds = new Set();

  let region = "preamble";
  let section = null, entry = null;

  for (const b of blocks(md)) {
    const title = b.title.trim();
    const lower = title.toLowerCase();

    // Region switches
    if (b.depth === 1) {
      section = entry = null;
      if (lower === "level table") region = "levelTable";
      else if (lower === "features") region = "features";
      else if (lower.startsWith("mechanic")) {
        region = "mechanics";
        const named = title.match(/^mechanics?\s*:\s*(.+)$/i);
        if (named) {
          const { text, notes } = cleanBody(b.lines);
          cls.mechanics.push({ id: slug(named[1]), name: named[1].trim(), body: text });
          cls.designerNotes.push(...notes);
          continue;
        }
      } else if (IGNORED_SECTIONS.includes(lower)) {
        region = "ignored"; report.ignored.push(title);
      } else {
        region = "section";
        const { text, notes } = cleanBody(b.lines);
        section = { id: slug(title), name: title, intro: text || null, entries: [] };
        cls.sections.push(section);
        cls.designerNotes.push(...notes);
        continue;
      }
    } else if (b.depth > 1 && lower === "features") {
      region = "features"; // some notes use "## Features"
    }

    if (region === "ignored") continue;

    // Body handling per region
    if (b.depth === 0 || region === "levelTable" || (b.depth > 1 && lower === "features")) {
      for (const l of b.lines) {
        const hp = l.match(/\*\*Health per Level:\*\*\s*(.*)$/i);
        if (hp) cls.healthPerLevel = parseHealth(hp[1].trim());
      }
      if (region === "levelTable" && b.depth === 1) cls.levels = parseTable(b.lines);
      if (b.depth === 0) {
        const pre = b.lines.filter((l) => !isTagLine(l) && l.trim());
        const quote = pre.filter((l) => l.trim().startsWith(">")).map((l) => l.replace(/^\s*>\s?/, "")).join(" ").trim();
        if (quote) cls.description = quote;
        cls.designerNotes.push(...pre.filter((l) => !l.trim().startsWith(">")).map((l) => l.trim().replace(/^\*(.*)\*$/, "$1")));
      }
      continue;
    }

    if (region === "mechanics" && b.depth >= 2) {
      const { text, notes } = cleanBody(b.lines);
      cls.mechanics.push({ id: slug(title), name: title, body: text });
      cls.designerNotes.push(...notes);
      continue;
    }

    if (region === "features" && b.depth >= 2) {
      const m = title.match(/^(\d+)\s*-\s*(.*)$/);
      const { text, notes } = cleanBody(b.lines);
      cls.designerNotes.push(...notes);
      let body = text, cost = null, abilityType = null;

      const costLine = body.match(/^\*\*([^*\n]*\bPoints?)\*\*\s*\n?/);
      if (costLine) { cost = costLine[1].trim(); body = body.slice(costLine[0].length).trim(); }
      const ability = body.match(/^\*\*([^*\n]+?)\s+Ability:\*\*\s*/);
      if (ability) { abilityType = ability[1].trim(); body = body.slice(ability[0].length).trim(); }

      const f = {
        id: "",
        level: m ? +m[1] : null,
        name: (m ? m[2] : title).trim(),
        abilityType, cost, body,
      };
      const reason = draftReason(f);
      if (reason) {
        f.id = uniqueId(f.name ? slug(f.name) : `level-${f.level ?? "x"}`, draftIds);
        f.draftReason = reason;
        cls.drafts.push(f);
      } else {
        f.id = uniqueId(slug(f.name), featureIds);
        cls.features.push(f);
      }
      continue;
    }

    if (region === "section" && section) {
      const { text, notes } = cleanBody(b.lines);
      cls.designerNotes.push(...notes);
      if (b.depth === 2) {
        const [, n, sub] = title.match(/^(.*?)\s+-\s+(.+)$/) ?? [, title, null];
        const flavor = text.match(/^\*([^*\n]+)\*\s*(?:\n|$)/);
        entry = {
          id: slug(n), name: n.trim(), subtitle: sub?.trim() ?? null,
          flavor: flavor ? flavor[1].trim() : null,
          body: flavor ? text.slice(flavor[0].length).trim() : text,
          options: [],
        };
        section.entries.push(entry);
      } else if (b.depth >= 3 && entry) {
        entry.options.push({ id: slug(title), name: title, body: text });
      }
    }
  }

  cls.designerNotes = cls.designerNotes.filter(Boolean);
  splitAbilities(cls);
  return { cls, tags, report };
}

// ---------- run ----------

if (!fs.existsSync(SRC_DIR)) {
  console.error(`Source folder not found: ${SRC_DIR}`);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".json")) fs.unlinkSync(path.join(OUT_DIR, f));

const index = [];
const skipped = [];
for (const file of fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".md")).sort()) {
  const md = fs.readFileSync(path.join(SRC_DIR, file), "utf8");
  const { cls, tags, report } = parseClass(md, file);

  const bad = tags.find((t) => EXCLUDED_TAGS.includes(t));
  if (bad) { skipped.push(`${file} (#${bad})`); continue; }
  if (!tags.includes(REQUIRED_TAG)) { skipped.push(`${file} (no #${REQUIRED_TAG})`); continue; }

  fs.writeFileSync(path.join(OUT_DIR, `${cls.id}.json`), JSON.stringify(cls, null, 2) + "\n");
  index.push({
    id: cls.id, name: cls.name, tags: cls.tags, file: `${cls.id}.json`,
    healthPerLevel: cls.healthPerLevel,
  });

  const extras = [
    cls.drafts.length && `${cls.drafts.length} draft`,
    report.ignored.length && `ignored: ${report.ignored.join(", ")}`,
  ].filter(Boolean).join(" · ");
  const abil = cls.abilityGroups.reduce((n, g) => n + g.abilities.length, 0);
  console.log(`✓ ${cls.name.padEnd(14)} ${String(cls.features.length).padStart(2)} features${abil ? `, ${abil} abilities` : ""}${extras ? "  (" + extras + ")" : ""}`);
}

fs.writeFileSync(path.join(OUT_DIR, "index.json"),
  JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt: new Date().toISOString(), classes: index }, null, 2) + "\n");

console.log(`\n${index.length} classes written to ${OUT_DIR}`);
if (skipped.length) console.log(`Skipped: ${skipped.join(", ")}`);
