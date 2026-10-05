#!/usr/bin/env node
/**
 * Arkadia — Magic/<Crystal>.md → data/magic/<crystal>.json (+ data/magic/index.json)
 *
 * Usage (from the Website folder):
 *   node tools/convert-magic.mjs
 *   node tools/convert-magic.mjs "A:/Obsidian/Arkadia/Magic" "data/magic"
 *
 * Layout it expects (based on Fire.md):
 *   #tags (#crystal #fire_damage #burn #tier1)
 *   *Ascends into [[A]], [[B]] ...*
 *   Theme: ...
 *   Stats: CON, CHA, INT
 *   # Overview        → mechanics; ![[Note#Heading]] embeds are pulled in from that note
 *   # Spells
 *   ## BA 15+         → spell tier
 *   ### Spell name
 *   ***BA 15 | 3 CA | 2+ Mana | Major Concentration***
 *   description...
 *   	**3 CA - Upgrade - Melee**: upgrade text
 * Other # sections (Notes, Ideas, ...) are ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import CONFIG from "../config.mjs";

// Which crystals to convert, in display order: set in config.mjs.
const CRYSTALS = CONFIG.crystals.map((c) => c.name);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = process.argv[2] ?? `${CONFIG.vault}/${CONFIG.notes.magicFolder}`;
const VAULT = path.dirname(path.resolve(SRC_DIR)); // embeds like ![[Conditions#Burn]] are looked up here
const OUT_DIR = path.resolve(process.argv[3] ?? path.join(HERE, "..", "data", "magic"));
const SCHEMA_VERSION = 1;

// ---------- helpers ----------

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const isSeparator = (l) => /^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(l);
const isTagLine = (l) => /^\s*(#[A-Za-z][\w\-/]*\s*)+$/.test(l);

/** Obsidian → plain Markdown: [[Note|Alias]] → Alias, [[Note]] → Note, \* \[ \] unescaped. */
const unwiki = (s) => s
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
  .replace(/\[\[([^\]#|]+)(#[^\]]*)?\]\]/g, "$1")
  .replace(/\\([*[\]_])/g, "$1");

function tidy(lines) {
  return unwiki(lines
    .filter((l) => !isSeparator(l))
    .map((l) => l.replace(/^\t+/, "").replace(/[ \t]+$/, ""))
    .join("\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueId(base, used) {
  let id = base || "item", n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function blocks(md) {
  const out = [{ depth: 0, title: "", lines: [] }];
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h && !isTagLine(line)) out.push({ depth: h[1].length, title: h[2], lines: [] });
    else out.at(-1).lines.push(line);
  }
  return out;
}

// ---------- embeds (![[Note#Heading]]) ----------

const noteCache = new Map();
function resolveEmbed(target) {
  const [note, heading] = target.split("#");
  const file = path.join(VAULT, `${note.trim()}.md`);
  if (!noteCache.has(file)) noteCache.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n") : null);
  const md = noteCache.get(file);
  if (md == null) return null;
  if (!heading) return { name: note.trim(), body: tidy(md.split("\n").filter((l) => !isTagLine(l))) };
  const lines = md.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${heading.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i").test(l));
  if (start < 0) return null;
  const depth = lines[start].match(/^#+/)[0].length;
  const body = [];
  for (const l of lines.slice(start + 1)) {
    const h = l.match(/^(#+)\s/);
    if (h && h[1].length <= depth) break;
    body.push(l);
  }
  return { name: heading.trim(), body: tidy(body) };
}

// ---------- spells ----------

/** "***BA 15 | 3 CA | 2+ Mana | Major Concentration\****" → structured cost line. */
function parseMeta(line) {
  const t = line.trim();
  if (!/^\*{2,3}[^*]/.test(t)) return null;
  const inner = t.replace(/\\\*/g, "\u0000").replace(/^\*+|\*+$/g, "").replace(/\u0000/g, "*").trim();
  if (!/\b(CA|Auto|Passive|Mana|BA)\b/.test(inner)) return null;
  const meta = { ba: null, ca: null, mana: null, concentration: null, tags: [], raw: inner };
  for (const part of inner.split("|").map((p) => p.trim()).filter(Boolean)) {
    let m;
    if ((m = part.match(/^BA\s*(\d+)/i))) meta.ba = Number(m[1]);
    else if (/^auto$/i.test(part)) meta.ca = "Auto";
    else if ((m = part.match(/^(.+?)\s*CA$/i))) meta.ca = m[1];
    else if ((m = part.match(/^(.+?)\s*Mana(\*?)$/i))) meta.mana = m[1] + m[2];
    else if (/concentration/i.test(part)) meta.concentration = part;
    else meta.tags.push(part);
  }
  return meta;
}

const UPGRADE = /^\**\s*(?:(\d+\+?|X)\s*CA\s*-\s*)?Upgrade(?:\s*-\s*([^*:]+?))?\s*\**\s*:\s*\**\s*(.*)$/i;

function parseSpell(title, lines, tierBa, used) {
  const content = [...lines];
  while (content.length && !content[0].trim()) content.shift();
  const meta = content.length ? parseMeta(content[0]) : null;
  if (meta) content.shift();

  const body = [];
  const upgrades = [];
  for (const raw of content) {
    if (isSeparator(raw)) continue;
    const m = raw.trim().match(UPGRADE);
    if (m) {
      // accepts "3 CA - Upgrade - Melee" and "Upgrade - 3 CA"
      let ca = m[1] ?? null, variant = m[2]?.trim() ?? null;
      const caVariant = variant?.match(/^(\d+\+?|X)\s*CA$/i);
      if (caVariant) { ca = caVariant[1]; variant = null; }
      upgrades.push({ ca, variant, lines: [m[3]] });
      continue;
    }
    if (upgrades.length) upgrades.at(-1).lines.push(raw);
    else body.push(raw);
  }

  const name = title.trim();
  const spell = {
    id: uniqueId(slug(name), used),
    name,
    ba: meta?.ba ?? tierBa,
    ca: meta?.ca ?? null,
    mana: meta?.mana ?? null,
    concentration: meta?.concentration ?? null,
    tags: meta?.tags ?? [],
    body: tidy(body),
    upgrades: upgrades.map((u) => ({ ca: u.ca, variant: u.variant, text: tidy(u.lines) })),
  };
  if (!meta) spell.draftReason = "no cost line";
  else if (!spell.body) spell.draftReason = "no description";
  return spell;
}

// ---------- crystal ----------

function parseCrystal(md, name) {
  md = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const tags = (md.split("\n").filter(isTagLine).join(" ").match(/#[A-Za-z][\w\-/]*/g) ?? []).map((t) => t.slice(1).toLowerCase());
  const crystal = {
    id: slug(name),
    name,
    tier: Number(tags.find((t) => /^tier\d+$/.test(t))?.slice(4)) || null,
    damageTypes: tags.filter((t) => t.endsWith("_damage")).map((t) => t.replace(/_damage$/, "")),
    keywords: tags.filter((t) => t !== "crystal" && !/^tier\d+$/.test(t) && !t.endsWith("_damage")),
    theme: null,
    stats: [],
    ascendsInto: [],
    mechanics: [],
    spells: [],
    drafts: [],
    source: `Magic/${name}.md`,
  };
  const warnings = [];
  const mechIds = new Set(), spellIds = new Set();

  let section = null; // "overview" | "spells" | null (ignored)
  let tierBa = 0;
  for (const b of blocks(md)) {
    const title = b.title.trim();
    if (b.depth === 0) {
      for (const l of b.lines) {
        const theme = l.match(/^\s*Theme\s*:\s*(.+)$/i);
        if (theme) crystal.theme = theme[1].trim();
        const stats = l.match(/^\s*Stats?\s*:\s*(.+)$/i);
        if (stats) crystal.stats = stats[1].split(/[,|/]|\bor\b/).map((x) => x.trim()).filter(Boolean);
        if (/ascends into/i.test(l)) crystal.ascendsInto = [...l.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim());
      }
      continue;
    }
    if (b.depth === 1) {
      const t = title.toLowerCase();
      section = t === "overview" ? "overview" : t === "spells" ? "spells" : null;
      continue;
    }
    if (section === "overview") {
      const own = [];
      for (const l of b.lines) {
        const e = l.trim().match(/^!\[\[([^\]]+)\]\]$/);
        if (!e) { own.push(l); continue; }
        const found = resolveEmbed(e[1]);
        if (found) crystal.mechanics.push({ id: uniqueId(slug(found.name), mechIds), name: found.name, body: found.body, source: e[1].split("#")[0] });
        else warnings.push(`embed not found: ${e[1]}`);
      }
      const text = tidy(own);
      if (text) crystal.mechanics.push({ id: uniqueId(slug(title), mechIds), name: title, body: text, source: null });
      continue;
    }
    if (section === "spells") {
      const tier = title.match(/^BA\s*(\d+)/i);
      if (b.depth === 2 && tier) { tierBa = Number(tier[1]); continue; }
      if (b.depth >= 3) {
        const spell = parseSpell(title, b.lines, tierBa, spellIds);
        if (spell.draftReason) crystal.drafts.push(spell);
        else crystal.spells.push(spell);
      }
    }
  }
  // Hint: damage types the spells mention that aren't tagged on the note (you decide if they belong).
  const KNOWN = ["fire", "cold", "lightning", "aether", "physical", "slashing", "piercing", "bludgeoning", "poison",
    "acid", "psychic", "radiant", "necrotic", "force", "thunder", "water", "void", "arcane"];
  const counts = {};
  for (const sp of crystal.spells) {
    const text = [sp.body, ...sp.upgrades.map((u) => u.text)].join(" ").toLowerCase();
    for (const m of text.matchAll(/\b([a-z]+)\s+damage\b/g)) if (KNOWN.includes(m[1])) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
  }
  const untagged = Object.entries(counts).filter(([t]) => !crystal.damageTypes.includes(t)).sort((a, b) => b[1] - a[1]);
  if (untagged.length) warnings.push(`spells also mention ${untagged.map(([t, n]) => `${t} damage (${n}x)`).join(", ")}; add #<type>_damage to the note's tags if the crystal deals it`);
  if (!crystal.stats.length) warnings.push("no \"Stats:\" line found");
  return { crystal, warnings };
}

// ---------- run ----------

if (!fs.existsSync(SRC_DIR)) {
  console.error(`Magic folder not found: ${SRC_DIR}`);
  process.exit(1);
}

const crystals = [];
for (const name of CRYSTALS) {
  const file = path.join(SRC_DIR, `${name}.md`);
  if (!fs.existsSync(file)) { console.log(`✗ ${name}: ${file} not found, skipped`); continue; }
  const { crystal, warnings } = parseCrystal(fs.readFileSync(file, "utf8"), name);
  crystals.push(crystal);
  const byBa = [...new Set(crystal.spells.map((s) => s.ba))].sort((a, b) => a - b)
    .map((ba) => `BA ${ba}: ${crystal.spells.filter((s) => s.ba === ba).length}`).join(", ");
  console.log(`✓ ${name.padEnd(10)} ${crystal.spells.length} spells (${byBa})${crystal.drafts.length ? `, ${crystal.drafts.length} draft` : ""}`);
  for (const w of warnings) console.log(`    ! ${w}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".json")) fs.unlinkSync(path.join(OUT_DIR, f));

const generatedAt = new Date().toISOString();
for (const c of crystals) {
  fs.writeFileSync(path.join(OUT_DIR, `${c.id}.json`), JSON.stringify({ schemaVersion: SCHEMA_VERSION, generatedAt, ...c }, null, 2) + "\n");
}
fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify({
  schemaVersion: SCHEMA_VERSION,
  generatedAt,
  crystals: crystals.map((c) => ({ id: c.id, name: c.name, tier: c.tier, damageTypes: c.damageTypes, stats: c.stats, file: `${c.id}.json` })),
}, null, 2) + "\n");

// The site used to read a single data/magic.json; remove it so it can't go stale.
const legacy = path.join(path.dirname(OUT_DIR), "magic.json");
if (fs.existsSync(legacy)) fs.unlinkSync(legacy);

console.log(`\n${crystals.length} crystals written to ${OUT_DIR}`);
