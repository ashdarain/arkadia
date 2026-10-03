#!/usr/bin/env node
/**
 * Arkadia — "Weapons & Armour.md" → data/equipment.json
 *
 * Usage (from the Website folder):
 *   node tools/convert-equipment.mjs
 *   node tools/convert-equipment.mjs "A:/Obsidian/Arkadia/Weapons & Armour.md" "data/equipment.json"
 *
 * Layout it expects:
 *   intro text
 *   ## Equipment Attributes   - **Name - X:** description
 *   # Weapons → ## Melee Weapons / Ranged Weapons / Spell Foci → ### Item
 *       *Type*  /  STR | DEX  /  **Full Action Attack:** 1d6 | Slashing  /  **Attributes:** Light, Crit 1 ...
 *   # Armour, # Shields → ## Light / Medium / Heavy → ### Item
 *       **AC** = 10  /  **Spell AC** = 13  /  **Proficiency Bonus:** ...
 * "# Notes" is ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] ?? "A:/Obsidian/Arkadia/Weapons & Armour.md";
const OUT = path.resolve(process.argv[3] ?? path.join(HERE, "..", "data", "equipment.json"));
const SCHEMA_VERSION = 1;
const STATS = "STR|DEX|INT|WIS|CON|AGI|CHA";

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const clean = (s) => s.replace(/\\([*[\]_])/g, "$1").replace(/\s+/g, " ").trim();
const none = (v) => (v == null || /^none\.?$/i.test(v.trim()) ? null : v.trim());

/** "1d6 | Slashing or Piercing" → { dice, damage }; "None" → null */
function attack(v) {
  if (!none(v)) return null;
  const [dice, damage] = v.split("|").map((x) => x.trim());
  return { dice, damage: damage || null };
}

/** "Light, Crit 1, Range - 12m" → [{ name: "Light", value: null }, { name: "Crit", value: "1" }, ...] */
function attributes(v) {
  if (!none(v)) return [];
  return v.split(",").map((a) => a.trim()).filter(Boolean).map((a) => {
    const m = a.match(/^(.+?)(?:\s*-\s*|\s+)(\d+\s*m?)$/i);
    return m ? { name: m[1].trim(), value: m[2].replace(/\s+/g, "") } : { name: a, value: null };
  });
}

function parseItem(name, lines, category, weight) {
  const item = { id: slug(name), name, category: category.id };
  if (weight) item.weight = weight;
  const extras = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(\*{3,}|-{3,})$/.test(line)) continue;
    const type = line.match(/^\*([^*].*?)\*$/);
    if (type && !item.type) { item.type = clean(type[1]); continue; }
    if (new RegExp(`^(${STATS})(\\s*\\|\\s*(${STATS}))*$`).test(line)) { item.stats = line.split("|").map((s) => s.trim()); continue; }
    const kv = line.match(/^\*\*(.+?)\*\*\s*[:=]?\s*(.*)$/);
    if (!kv) { extras.push({ label: null, value: clean(line) }); continue; }
    const key = kv[1].replace(/:$/, "").trim().toLowerCase();
    const value = clean(kv[2].replace(/^[:=]\s*/, ""));
    switch (key) {
      case "full action attack": item.fullAction = attack(value); break;
      case "half action attack": item.halfAction = attack(value); break;
      case "attributes": item.attributes = attributes(value); break;
      case "ac": item.ac = value; break;
      case "spell ac": item.spellAc = value; break;
      case "requirements": item.requirements = none(value); break;
      case "penalty": item.penalty = none(value); break;
      case "proficiency bonus": item.proficiencyBonus = none(value); break;
      case "expertise bonus": item.expertiseBonus = none(value); break;
      default: extras.push({ label: kv[1].replace(/:$/, "").trim(), value });
    }
  }
  if (extras.length) item.extras = extras;
  return item;
}

function parse(md) {
  md = md.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const data = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    source: path.basename(SRC),
    intro: "",
    attributes: [],
    categories: [],
  };
  const blocks = [{ depth: 0, title: "", lines: [] }];
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (h) blocks.push({ depth: h[1].length, title: h[2], lines: [] });
    else blocks.at(-1).lines.push(line);
  }

  const warnings = [];
  const catById = new Map();
  const category = (name, kind) => {
    const id = slug(name);
    if (!catById.has(id)) { const c = { id, name, kind, items: [] }; catById.set(id, c); data.categories.push(c); }
    return catById.get(id);
  };

  let top = null;      // current "# " section: weapons | armour | shields | null
  let current = null;  // weapons: category; armour/shields: weight
  for (const b of blocks) {
    const title = b.title.trim();
    const t = title.toLowerCase();
    if (b.depth === 0) { data.intro = clean(b.lines.filter((l) => l.trim()).join(" ")); continue; }
    if (b.depth === 1) {
      top = t.startsWith("weapon") ? "weapons" : t.startsWith("armour") || t.startsWith("armor") ? "armour" : t.startsWith("shield") ? "shields" : null;
      current = null;
      if (!top && t !== "notes") warnings.push(`section "# ${title}" ignored`);
      continue;
    }
    if (b.depth === 2 && t === "equipment attributes") {
      for (const l of b.lines) {
        const m = l.match(/^\s*[-*]\s+\*\*(.+?):?\*\*:?\s*(.*)$/);
        if (!m) continue;
        const [label, param] = m[1].replace(/:$/, "").split(/\s+-\s+/);
        data.attributes.push({ name: label.trim(), param: param?.trim() ?? null, text: clean(m[2]) });
      }
      continue;
    }
    if (!top) continue;
    if (b.depth === 2) {
      current = top === "weapons" ? category(title, "weapon") : title;
      continue;
    }
    if (b.depth === 3) {
      const cat = top === "weapons" ? current : category(top === "armour" ? "Armour" : "Shields", top === "armour" ? "armour" : "shield");
      if (!cat) { warnings.push(`"${title}" has no category heading, skipped`); continue; }
      cat.items.push(parseItem(title, b.lines, cat, top === "weapons" ? null : current));
    }
  }
  return { data, warnings };
}

if (!fs.existsSync(SRC)) {
  console.error(`Equipment note not found: ${SRC}`);
  process.exit(1);
}
const { data, warnings } = parse(fs.readFileSync(SRC, "utf8"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");

console.log(`✓ ${data.attributes.length} attributes`);
for (const c of data.categories) console.log(`✓ ${c.name}: ${c.items.map((i) => i.name).join(", ")}`);
for (const w of warnings) console.log(`  ! ${w}`);
console.log(`\nEquipment written to ${OUT}`);
