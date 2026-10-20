/* Arkadia reference site: settings, shared state, Markdown, layout helpers and data loading. */

import SETTINGS from "../config.mjs";

/* ---------------- Site settings (edit config.mjs, not here) ---------------- */

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idOf = (name) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const CONFIG = {
  maxLevel: SETTINGS.playtest.maxClassLevel,
  maxBA: SETTINGS.playtest.maxSpellBA,
  hiddenSpells: SETTINGS.playtest.hideSpellsEndingWith.map((w) => new RegExp(`${escapeRe(w)}$`, "i")),
  crystalColors: Object.fromEntries(SETTINGS.crystals.map((c) => [idOf(c.name), c.color])),
};

const DATA_ROOT = "data";
export const main = document.getElementById("main");
export const nav = document.getElementById("nav");
export const draftToggle = document.getElementById("toggle-drafts");

export const state = {
  classes: [],          // full class objects, in index order
  byId: new Map(),
  summaries: {},        // id -> one-line description (data/class-summaries.json)
  races: null,          // data/races.json
  magic: null,          // data/magic/*.json
  equipment: null,      // data/equipment.json
  info: null,           // data/info.json
  conditions: null,     // data/conditions.json
  equipFilter: null,    // null = show all categories, otherwise a category id
  glossaryOpen: null,   // equipment attribute glossary; null = open on desktop, closed on phones
  showDrafts: readPref("arkadia.showDrafts") === "1",
  tagFilter: new Set(),  // class overview: picked tags (a class lights up if it has any of them)
  magicFiltersOpen: false, // phones only: the magic filter strip starts folded away
  magicFilters: {},     // magic overview: group key -> Set of picked values (see MAGIC_FILTERS)
  query: "",
  sectionTab: {},       // "classId/sectionId" -> active entry id (e.g. which Samurai stance is open)
  lastPage: {},         // tab -> last page opened in it, so the sidebar returns you there
};

/** True if something at this class level should be shown right now. */
export const inScope = (level) => state.showDrafts || level == null || level <= CONFIG.maxLevel;
export const beyond = (level) => level != null && level > CONFIG.maxLevel;
/** Spells shown to playtesters by default: BA within the cap and not a hidden type (Talents). */
export const spellByDefault = (s) => (s.ba ?? 0) <= CONFIG.maxBA && !CONFIG.hiddenSpells.some((re) => re.test(s.name));
export const spellInScope = (s) => state.showDrafts || spellByDefault(s);


export const ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  races: '<circle cx="12" cy="9" r="4"/><path d="M4.5 21c.6-4 3.7-6.5 7.5-6.5s6.9 2.5 7.5 6.5"/><path d="M8.6 6.4 6.5 2.5l3.6 2.6M15.4 6.4l2.1-3.9-3.6 2.6"/>',
  classes: '<path d="M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  magic: '<path d="M12 2 19 9 12 22 5 9z"/><path d="M5 9h14M12 2 9.5 9 12 22l2.5-13z"/>',
  equipment: '<path d="M14.5 3.5 20.5 3.5 20.5 9.5 10 20 4 14z"/><path d="M7 17l-3 3M8.5 12.5l3 3"/>',
  conditions: '<path d="M2.5 12h4l2.2-5.5 4.3 11 2.6-7 1.6 1.5h4.3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
};

export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------------- Helpers ---------------- */

function readPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function writePref(key, val) { try { localStorage.setItem(key, val); } catch { /* storage unavailable */ } }

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Minimal Markdown: paragraphs, line breaks, "- " lists, **bold**, *italic*. */
export function md(src) {
  if (!src) return "";
  // ":::embed Name … :::" blocks (from ![[Note#Heading]] in the notes) become titled sub-boxes
  if (src.includes(":::embed")) {
    const parts = src.split(/^:::embed[ \t]*(.*)\n([\s\S]*?)\n?^:::[ \t]*$/m);
    return parts.map((part, i) =>
      i % 3 === 0 ? mdBlocks(part)
      : i % 3 === 1 ? `<aside class="embed"><h4>${esc(part)}</h4>${mdBlocks(parts[i + 1])}</aside>`
      : "").join("");
  }
  return mdBlocks(src);
}

function mdBlocks(src) {
  if (!src || !src.trim()) return "";
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  const bullet = /^\s*[-*•]\s+/;
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const table = (rows) => {
    const hasHead = rows.length > 1 && /^[\s|:-]+$/.test(rows[1]);
    const align = hasHead ? cells(rows[1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : "")) : [];
    const td = (tag, c, i) => `<${tag}${align[i] ? ` style="text-align:${align[i]}"` : ""}>${inline(c)}</${tag}>`;
    const head = hasHead ? `<thead><tr>${cells(rows[0]).map((c, i) => td("th", c, i)).join("")}</tr></thead>` : "";
    const body = (hasHead ? rows.slice(2) : rows).map((r) => `<tr>${cells(r).map((c, i) => td("td", c, i)).join("")}</tr>`).join("");
    return `<div class="md-table"><table>${head}<tbody>${body}</tbody></table></div>`;
  };
  return src.trim().split(/\n{2,}/).map((block) => {
    const out = [];
    let para = [], list = [], rows = [];
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    // indented bullets (tab or spaces) nest under the bullet above them
    const flushList = () => {
      if (!list.length) return;
      let html = "";
      const stack = [];
      for (const { w, text } of list) {
        if (!stack.length || w > stack.at(-1)) { html += `<ul class="md">`; stack.push(w); }
        else {
          while (stack.length > 1 && w < stack.at(-1)) { html += "</li></ul>"; stack.pop(); }
          html += "</li>";
        }
        html += `<li>${inline(text)}`;
      }
      while (stack.length) { html += "</li></ul>"; stack.pop(); }
      out.push(html);
      list = [];
    };
    const indentOf = (l) => l.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    const flushRows = () => { if (rows.length) out.push(table(rows)); rows = []; };
    for (const line of block.split("\n")) {
      if (isRow(line)) { flushPara(); flushList(); rows.push(line); }
      else if (bullet.test(line)) { flushRows(); flushPara(); list.push({ w: indentOf(line), text: line.replace(bullet, "") }); }
      else { flushRows(); flushList(); para.push(line); }
    }
    flushRows(); flushPara(); flushList();
    return out.join("");
  }).join("");
}

/** Markdown for a single line of text: no surrounding <p>. */
export const mdInline = (s) => md(s).replace(/^<p>|<\/p>$/g, "");

export const plain = (s) => String(s ?? "").replace(/^:::(embed[ \t]*)?/gm, "").replace(/\*\*?|__?/g, "");

/** Briefly outline a card (e.g. the one a link or search result jumped to). */
export function flash(el) {
  el.classList.remove("flash");
  void el.offsetWidth; // restart the animation if it's already playing
  el.classList.add("flash");
}

/** Room left above a card we jump to, below any sticky bars. */
const JUMP_ROOM = 20;

/** Height of the sticky bars that will sit over `el` once it's at the top: the sub tabs, and the BA bar for things below it. */
function stickyHeight(el) {
  let h = 0;
  for (const bar of main.querySelectorAll(".subtabs, .ba-jump")) {
    const covers = bar.classList.contains("subtabs") || bar.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (covers) h += bar.offsetHeight;
  }
  return h;
}

/**
 * Scroll so `el` (title included) sits just below the sticky bars, measured now rather than guessed,
 * since their height changes with fonts and screen width. Smooth unless reduced motion is on.
 */
export function jumpTo(el, { smooth = false } = {}) {
  const goal = () => Math.round(el.getBoundingClientRect().top + window.scrollY - stickyHeight(el) - JUMP_ROOM);
  if (smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.scrollTo({ top: goal(), behavior: "smooth" });
    return;
  }
  // sticky class columns move as the page scrolls, so settle in a couple of steps
  for (let i = 0; i < 4; i++) {
    const top = goal();
    if (Math.abs(top - window.scrollY) < 2) break;
    window.scrollTo(0, top);
  }
}

export function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/** Element ids and links for things inside a class or crystal page: "samurai--iaijutsu". */
export const anchorId = (pageId, itemId) => `${pageId}--${itemId}`;
export const classHref = (classId, anchor) => `#/classes/${classId}${anchor ? `/${encodeURIComponent(anchor)}` : ""}`;
export const crystalHref = (crystalId, anchor) => `#/magic/${crystalId}${anchor ? `/${encodeURIComponent(anchor)}` : ""}`;
export const slugCss = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

/* ---------------- Data ---------------- */

/** Fetch one JSON file from data/. Optional files resolve to null when missing. */
async function getJson(file, { required = false } = {}) {
  try {
    const res = await fetch(`${DATA_ROOT}/${file}`, { cache: "no-cache" });
    if (res.ok) return await res.json();
    if (required) throw new Error(`${file} returned ${res.status}`);
  } catch (err) {
    if (required) throw err;
  }
  return null;
}

export async function loadData() {
  // classes are required; everything else falls back to a "work in progress" page when missing
  const index = await getJson("classes/index.json", { required: true });
  state.classes = await Promise.all(index.classes.map((c) => getJson(`classes/${c.file}`, { required: true })));
  state.byId = new Map(state.classes.map((c) => [c.id, c]));
  state.summaries = (await getJson("class-summaries.json")) ?? {};
  state.races = await getJson("races.json");
  try {
    // one file per crystal, listed in data/magic/index.json
    const mi = await getJson("magic/index.json");
    if (mi) state.magic = { crystals: await Promise.all(mi.crystals.map((c) => getJson(`magic/${c.file}`, { required: true }))) };
  } catch (err) { console.warn("Magic data not loaded:", err); }
  state.equipment = await getJson("equipment.json");
  state.info = await getJson("info.json");
  state.conditions = await getJson("conditions.json");
}

/* ---------------- Masonry columns ---------------- */

/**
 * A grid of cards that stack straight under each other (no row gaps).
 * Cards are rendered flat; packMasonry() then splits them into as many
 * columns as fit (at least `min` px wide), putting each card into the
 * currently shortest column while keeping the note's order.
 */
export const masonry = (cards, min, max = 99, extraClass = "") =>
  `<div class="masonry${extraClass ? ` ${extraClass}` : ""}" data-min="${min}" data-max="${max}">${cards.map((html, i) => html.replace("<article ", `<article data-order="${i}" `)).join("")}</div>`;

/**
 * Two-column class pages: both columns are sticky. A column shorter than the window stays in view;
 * a taller one scrolls until its bottom reaches the window, then holds while the other side continues.
 */
export function stickColumns() {
  const twoCol = window.innerWidth > 1180;
  const subtabs = main.querySelector(".subtabs")?.offsetHeight ?? 0;
  document.documentElement.style.setProperty("--subtabs-h", `${subtabs}px`);
  const offset = subtabs + 12;
  for (const col of main.querySelectorAll(".class-body:not(.single) > .col")) {
    col.style.top = twoCol ? `${Math.min(offset, window.innerHeight - col.offsetHeight - 16)}px` : "";
  }
}

export function packMasonry() {
  const grids = [...main.querySelectorAll(".masonry")];
  grids.forEach(packGrid);
  // grids that contain packed grids (e.g. info panels with sub boxes) changed height: pack them again
  grids.filter((g) => g.querySelector(".masonry")).forEach(packGrid);
}

/**
 * Variant for grids where some cards are wider (data-span="2"): cards are placed absolutely,
 * each at the lowest spot where it fits, so narrow cards fill the gaps beside wide ones.
 */
function packSpanGrid(grid) {
  const gap = 12;
  const cards = [...grid.querySelectorAll(":scope > [data-order]")].sort((a, b) => a.dataset.order - b.dataset.order);
  const min = Number(grid.dataset.min) || 300;
  const W = grid.clientWidth;
  const n = Math.max(1, Math.min(Number(grid.dataset.max) || 99, Math.floor((W + gap) / (min + gap))));
  const colW = (W - gap * (n - 1)) / n;
  const heights = new Array(n).fill(0);
  for (const card of cards) {
    const span = Math.min(n, Number(card.dataset.span) || 1);
    let col = 0, top = Infinity;
    for (let c = 0; c + span <= n; c++) {
      const t = Math.max(...heights.slice(c, c + span));
      if (t < top - 0.5) { top = t; col = c; }
    }
    Object.assign(card.style, { position: "absolute", left: `${col * (colW + gap)}px`, top: `${top}px`, width: `${span * colW + (span - 1) * gap}px` });
    const h = card.getBoundingClientRect().height;
    for (let c = col; c < col + span; c++) heights[c] = top + h + gap;
  }
  grid.style.height = `${Math.max(0, ...heights) - gap}px`;
}

function packGrid(grid) {
  if (grid.classList.contains("span-masonry")) return packSpanGrid(grid);
  const gap = 12;
  const cards = [...grid.querySelectorAll(":scope > [data-order], :scope > .masonry-col > [data-order]")].sort((a, b) => a.dataset.order - b.dataset.order);
  const min = Number(grid.dataset.min) || 300;
  const n = Math.max(1, Math.min(Number(grid.dataset.max) || 99, Math.floor((grid.clientWidth + gap) / (min + gap))));
  grid.style.setProperty("--cols", n);
  const cols = Array.from({ length: n }, () => Object.assign(document.createElement("div"), { className: "masonry-col" }));
  grid.replaceChildren(...cols);
  cards.forEach((card) => cols[0].appendChild(card)); // measure at column width
  const heights = cards.map((card) => card.getBoundingClientRect().height);
  const totals = cols.map(() => 0);
  cards.forEach((card, i) => {
    const k = totals.indexOf(Math.min(...totals));
    cols[k].appendChild(card);
    totals[k] += heights[i] + gap;
  });
}

/* ---------------- Pages ---------------- */

export function wipPage(tab) {
  return `
    <section class="wip">
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <path class="half" d="M30 4 52 22 30 22z"/>
        <path d="M30 4 52 22 30 56 8 22z"/>
        <path d="M8 22h44M30 4 22 22l8 34 8-34z"/>
      </svg>
      <h1>${esc(tab.label)}</h1>
      <span class="badge draft">Work in progress</span>
      <p>${esc(tab.wip)}</p>
    </section>`;
}

/** Designer notes from a note's # Notes section; only shown with drafts on. */
export function designerNotes(notes) {
  return state.showDrafts && notes.length ? `
    <section class="block">
      <h2>Designer notes</h2>
      <ul class="notes">${notes.map((n) => `<li>${md(n)}</li>`).join("")}</ul>
    </section>` : "";
}
