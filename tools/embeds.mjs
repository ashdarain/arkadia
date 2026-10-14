/**
 * Arkadia — Obsidian embeds for the converters (no dependencies).
 *
 * A line that is only an embed, like  ![[Conditions#Taunt]]  or  ![[Conditions]],
 * is replaced by that section of the other note, wrapped in a marker the site
 * draws as a titled sub-box:
 *
 *   :::embed Taunt
 *   A taunted creature must make all attack rolls ...
 *   :::
 *
 * Embeds inside the embedded text are left alone (one level deep), and headings
 * inside it become bold lines so they can't split the note being converted.
 */
import fs from "node:fs";
import path from "node:path";

const cache = new Map();
const readNote = (vault, note) => {
  const file = path.join(vault, `${note}.md`);
  if (!cache.has(file)) cache.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n") : null);
  return cache.get(file);
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isTagLine = (l) => /^\s*(#[A-Za-z][\w\-/]*\s*)+$/.test(l);
const isSeparator = (l) => /^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(l);

/** "Conditions#Taunt|alias" → { name, lines } for that heading's section (or the whole note), or null. */
export function findSection(vault, target) {
  const [ref] = target.split("|");
  const [note, heading] = ref.split("#").map((s) => s?.trim());
  const md = readNote(vault, note);
  if (md == null) return null;
  const lines = md.split("\n");
  if (!heading) return { name: note, lines: lines.filter((l) => !isTagLine(l)) };
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${escapeRe(heading)}\\s*$`, "i").test(l));
  if (start < 0) return null;
  const depth = lines[start].match(/^#+/)[0].length;
  const body = [];
  for (const l of lines.slice(start + 1)) {
    const h = l.match(/^(#+)\s/);
    if (h && h[1].length <= depth) break;
    body.push(l);
  }
  return { name: lines[start].replace(/^#+\s+/, "").trim(), lines: body };
}

/**
 * Replace every embed-only line in a note's Markdown with the embedded text.
 * Missing targets are left as they are and reported through `warn`.
 */
export function expandEmbeds(md, vault, warn = () => {}) {
  return md.replace(/\r\n?/g, "\n").split("\n").flatMap((line) => {
    const m = line.trim().match(/^!\[\[([^\]]+)\]\]$/);
    if (!m) return [line];
    const found = findSection(vault, m[1]);
    if (!found) { warn(`embed not found: ${m[1]}`); return [line]; }
    const body = found.lines
      .filter((l) => !isSeparator(l))
      .map((l) => l.replace(/^#{1,6}\s+(.*?)\s*$/, "**$1**"))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return ["", `:::embed ${found.name}`, body, ":::", ""];
  }).join("\n");
}
