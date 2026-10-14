/**
 * Arkadia — patch notes for data updates (no dependencies).
 *
 * convert-all.mjs calls snapshot() before converting and writeChangelog() after.
 * Old and new JSON are compared item by item (matched by id / name, not by line),
 * and a readable Markdown note is written to log/YYYY-MM-DD_HH-MM.md if anything changed.
 *
 * In the log:  ~~removed words~~  ==added words==   (Obsidian shows == as a highlight)
 *
 * Renames: when an item vanishes and a new one appears in the same list (or a
 * class/crystal file is swapped for a new one), their contents are compared. If
 * they're mostly the same, it's logged as one "Renamed" line plus whatever else
 * changed, instead of a separate "Removed" and "Added".
 */
import fs from "node:fs";
import path from "node:path";

const IGNORE_KEYS = new Set(["generatedAt", "schemaVersion", "source", "id", "file"]);
const LABELS = { body: "text", ca: "CA", ba: "BA", spellAc: "Spell AC", ac: "AC", fullAction: "full action", halfAction: "half action",
  proficiencyBonus: "proficiency bonus", expertiseBonus: "expertise bonus", healthPerLevel: "health per level", designerNotes: "designer notes",
  damageTypes: "damage types", ascendsInto: "ascends into", draftReason: "draft reason" };
/** Lists that are just containers: left out of the path, and used to name what was added/removed. */
const NOUNS = { groups: "group", races: "race", categories: "category", items: "item", panels: "panel", sections: "section",
  entries: "entry", options: "option", features: "feature", abilityGroups: "ability group", abilities: "ability", spells: "spell",
  traits: "trait", upgrades: "upgrade", drafts: "draft", mechanics: "mechanic", levels: "level", attributes: "attribute",
  pointsTable: "points row", conditions: "condition" };

/** Read every JSON file under data/ into { "classes/samurai.json": {...}, ... }. */
export function snapshot(dataDir) {
  const out = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json") && e.name !== "index.json") {
        try { out[path.relative(dataDir, p).replace(/\\/g, "/")] = JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* skip unreadable */ }
      }
    }
  };
  walk(dataDir);
  return out;
}

// ---------- matching and labels ----------

const plain = (s) => String(s ?? "").replace(/\*\*?|__?/g, "").replace(/\s+/g, " ").trim();
const short = (s, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function keyOf(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  return String(x.id ?? x.name ?? x.title ?? (x.level != null ? `level ${x.level}` : null) ?? x.roll ?? x.text ?? JSON.stringify(x));
}
function labelOf(x) {
  if (x === null || typeof x !== "object") return String(x);
  if (x.name || x.title) return x.name || x.title;
  if (x.level != null) return `Level ${x.level}`;
  if (x.roll != null) return `d20 ${x.roll}`;
  if (x.text) return `“${short(plain(x.text), 40)}”`;
  return keyOf(x);
}
/** Map array items by key; duplicate keys get #2, #3 so identical entries still pair up. */
function keyed(arr) {
  const seen = {}, map = new Map();
  for (const x of arr) { const k = keyOf(x); seen[k] = (seen[k] ?? 0) + 1; map.set(seen[k] > 1 ? `${k}#${seen[k]}` : k, x); }
  return map;
}
const isObjArray = (a) => Array.isArray(a) && a.some((x) => x && typeof x === "object");

// ---------- rename detection ----------

const NAME_KEYS = new Set(["id", "name", "title"]);
/** How sure we need to be (0–1) that a removed + added pair is really one renamed item. */
const RENAME_THRESHOLD = 0.6;

/** Every word in an item except its name, lowercased (a bag of words). */
function words(x, out = []) {
  if (x === null || x === undefined) return out;
  if (typeof x !== "object") { out.push(...plain(String(x)).toLowerCase().split(/[^\p{L}\p{N}+-]+/u).filter(Boolean)); return out; }
  for (const [k, v] of Object.entries(x)) if (!NAME_KEYS.has(k) && !IGNORE_KEYS.has(k)) words(v, out);
  return out;
}
/** Overlap of two bags of words: 1 = identical, 0 = nothing shared. */
function overlap(a, b) {
  if (!a.length && !b.length) return 1;
  const count = new Map();
  for (const w of a) count.set(w, (count.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of b) { const n = count.get(w); if (n) { shared++; count.set(w, n - 1); } }
  return (2 * shared) / (a.length + b.length);
}
const named = (x) => x && typeof x === "object" && (x.name || x.title);

/**
 * Pair removed items with added ones that look like the same thing under a new name.
 * Mostly judged by content; a shared word in the name helps a little. Best pairs first.
 */
function findRenames(removed, added) {
  const nameWords = (x) => plain(named(x)).toLowerCase().split(" ");
  const pairs = [];
  for (const [ka, a] of removed) for (const [kb, b] of added) {
    if (!named(a) || !named(b)) continue;
    const wa = words(a), wb = words(b);
    if (wa.length + wb.length < 4) continue;               // too little content to judge
    const score = 0.85 * overlap(wa, wb) + 0.15 * overlap(nameWords(a), nameWords(b));
    if (score >= RENAME_THRESHOLD) pairs.push({ ka, kb, a, b, score });
  }
  pairs.sort((x, y) => y.score - x.score);
  const usedA = new Set(), usedB = new Set(), out = [];
  for (const p of pairs) if (!usedA.has(p.ka) && !usedB.has(p.kb)) { usedA.add(p.ka); usedB.add(p.kb); out.push(p); }
  return out;
}

// ---------- word diff for changed text ----------

function wordDiff(a, b) {
  const A = plain(a).split(" "), B = plain(b).split(" ");
  if (A.length * B.length > 400000) return `~~${short(plain(a), 200)}~~ ==${short(plain(b), 200)}==`;
  const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { ops.push(["=", A[i++]]); j++; }
    else if (j < B.length && (i >= A.length || dp[i][j + 1] > dp[i + 1][j])) ops.push(["+", B[j++]]);
    else ops.push(["-", A[i++]]);
  }
  // keep a few words of context around each change, elide the rest
  const CONTEXT = 6, near = ops.map(() => false);
  ops.forEach(([t], k) => { if (t !== "=") for (let d = -CONTEXT; d <= CONTEXT; d++) if (ops[k + d]) near[k + d] = true; });
  let out = "", run = null, gap = false;
  const flush = () => { if (run) out += run.t === "-" ? `~~${run.w.join(" ")}~~ ` : `==${run.w.join(" ")}== `; run = null; };
  ops.forEach(([t, w], k) => {
    if (!near[k]) { flush(); if (!gap) { out += "… "; gap = true; } return; }
    gap = false;
    if (t === "=") { flush(); out += w + " "; return; }
    if (run && run.t === t) run.w.push(w); else { flush(); run = { t, w: [w] }; }
  });
  flush();
  return out.trim();
}

// ---------- structural diff ----------

function describe(v) {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "object") return short(plain(Object.values(v).filter((x) => typeof x !== "object").join(" ")), 80) || "…";
  return short(plain(String(v)), 80);
}

function diff(a, b, trail, out, noun = "", renamed = false) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const where = trail.join(" › ");
  const at = (x) => [where, labelOf(x)].filter(Boolean).join(" › ");
  if (isObjArray(a) || isObjArray(b)) {
    const A = keyed(a ?? []), B = keyed(b ?? []);
    const what = noun ? `${noun}: ` : "";
    const added = new Map([...B].filter(([k]) => !A.has(k)));
    const removed = new Map([...A].filter(([k]) => !B.has(k)));
    for (const r of findRenames(removed, added)) {
      removed.delete(r.ka); added.delete(r.kb);
      out.push(`**Renamed** ${what}${at(r.a)} → ${labelOf(r.b)}`);
      diff(r.a, r.b, [...trail, labelOf(r.b)], out, "", true);
    }
    for (const x of added.values()) out.push(`**Added** ${what}${at(x)}`);
    for (const x of removed.values()) out.push(`**Removed** ${what}${at(x)}`);
    for (const [k, x] of A) if (B.has(k)) diff(x, B.get(k), [...trail, labelOf(x)], out);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const A = (a ?? []).map(String), B = (b ?? []).map(String);
    const added = B.filter((x) => !A.includes(x)), removed = A.filter((x) => !B.includes(x));
    if (added.length || removed.length) {
      out.push(`**Changed** ${where}: ${[added.length && `added ${added.join(", ")}`, removed.length && `removed ${removed.join(", ")}`].filter(Boolean).join("; ")}`);
    } else out.push(`**Changed** ${where}: reordered`);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (IGNORE_KEYS.has(key) || (renamed && NAME_KEYS.has(key))) continue;
      if (NOUNS[key] && (isObjArray(a[key]) || isObjArray(b[key]))) diff(a[key], b[key], trail, out, NOUNS[key]);
      else diff(a[key], b[key], [...trail, LABELS[key] ?? key], out);
    }
    return;
  }
  const sa = a == null ? "" : String(a), sb = b == null ? "" : String(b);
  if (sa.length > 60 || sb.length > 60) out.push(`**Changed** ${where}\n  > ${wordDiff(sa, sb)}`);
  else out.push(`**Changed** ${where}: ${describe(a)} → ${describe(b)}`);
}

// ---------- files → sections ----------

function sectionOf(file, data) {
  if (file.startsWith("classes/")) return ["Classes", data?.name ?? file];
  if (file.startsWith("magic/")) return ["Magic", data?.name ?? file];
  const top = { "races.json": "Races", "equipment.json": "Equipment", "info.json": "Info", "conditions.json": "Conditions", "class-summaries.json": "Class summaries" }[file];
  return [top ?? file, null];
}

export function buildChangelog(before, after) {
  const sections = new Map();
  const add = (sec, line) => { if (!sections.has(sec)) sections.set(sec, []); sections.get(sec).push(line); };

  // a renamed class or crystal note shows up as one file gone and a new one in the same folder
  const folder = (f) => f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
  const gone = new Map(Object.keys(before).filter((f) => !(f in after)).map((f) => [f, before[f]]));
  const fresh = new Map(Object.keys(after).filter((f) => !(f in before)).map((f) => [f, after[f]]));
  const renamedFiles = findRenames(gone, fresh).filter((r) => folder(r.ka) && folder(r.ka) === folder(r.kb));
  for (const r of renamedFiles) {
    const [sec] = sectionOf(r.kb, r.b);
    add(sec, `**Renamed** ${labelOf(r.a)} → ${labelOf(r.b)}`);
    const lines = [];
    diff(r.a, r.b, [labelOf(r.b)], lines, "", true);
    for (const l of lines) add(sec, l);
  }
  const skip = new Set(renamedFiles.flatMap((r) => [r.ka, r.kb]));

  for (const file of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (skip.has(file)) continue;
    const a = before[file], b = after[file];
    const [sec, name] = sectionOf(file, b ?? a);
    if (!a) { add(sec, `**Added** ${name ?? sec}`); continue; }
    if (!b) { add(sec, `**Removed** ${name ?? sec}`); continue; }
    const lines = [];
    diff(a, b, name ? [name] : [], lines);
    for (const l of lines) add(sec, l);
  }
  if (!sections.size) return null;

  const order = ["Info", "Races", "Classes", "Class summaries", "Magic", "Equipment", "Conditions"];
  const keys = [...sections.keys()].sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99));
  return keys.map((k) => `## ${k}\n\n${sections.get(k).map((l) => `- ${l}`).join("\n")}`).join("\n\n");
}

/** Compare, and write log/<date>.md if anything changed. Returns the file path or null. */
export function writeChangelog(before, after, logDir) {
  const body = buildChangelog(before, after);
  if (!body) return null;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  fs.mkdirSync(logDir, { recursive: true });
  const file = path.join(logDir, `${stamp}_${time}.md`);
  if (fs.existsSync(file)) fs.appendFileSync(file, `\n---\n\n${body}\n`); // second update in the same minute
  else fs.writeFileSync(file, `# Patch notes ${stamp} ${time.replace("-", ":")}\n\n${body}\n`);
  return file;
}
