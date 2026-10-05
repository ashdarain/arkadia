/* Arkadia reference site — no build step, no dependencies. */

/* ---------------- Site settings (edit config.mjs, not here) ---------------- */

import SETTINGS from "../config.mjs";

const idOf = (name) => name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const CONFIG = {
  maxLevel: SETTINGS.playtest.maxClassLevel,
  maxBA: SETTINGS.playtest.maxSpellBA,
  hiddenSpells: SETTINGS.playtest.hideSpellsEndingWith.map((w) => new RegExp(`${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")),
  crystalColors: Object.fromEntries(SETTINGS.crystals.map((c) => [idOf(c.name), c.color])),
};

const DATA_ROOT = "data";
const main = document.getElementById("main");
const nav = document.getElementById("nav");
const draftToggle = document.getElementById("toggle-drafts");

const state = {
  classes: [],          // full class objects, in index order
  byId: new Map(),
  summaries: {},        // id -> one-line description (data/class-summaries.json)
  races: null,          // data/races.json
  magic: null,          // data/magic/*.json
  equipment: null,      // data/equipment.json
  info: null,           // data/info.json
  equipFilter: null,    // null = show all categories, otherwise a category id
  showDrafts: readPref("arkadia.showDrafts") === "1",
  tagFilter: null,
  query: "",
  sectionTab: {},       // "classId/sectionId" -> active entry id (e.g. which Samurai stance is open)
  lastPage: {},         // tab -> last page opened in it, so the sidebar returns you there
};

/** True if something at this class level should be shown right now. */
const inScope = (level) => state.showDrafts || level == null || level <= CONFIG.maxLevel;
const beyond = (level) => level != null && level > CONFIG.maxLevel;
/** Spells shown to playtesters by default: BA within the cap and not a hidden type (Talents). */
const spellByDefault = (s) => (s.ba ?? 0) <= CONFIG.maxBA && !CONFIG.hiddenSpells.some((re) => re.test(s.name));
const spellInScope = (s) => state.showDrafts || spellByDefault(s);

/* ---------------- Tabs ---------------- */

const ICONS = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  races: '<circle cx="12" cy="9" r="4"/><path d="M4.5 21c.6-4 3.7-6.5 7.5-6.5s6.9 2.5 7.5 6.5"/><path d="M8.6 6.4 6.5 2.5l3.6 2.6M15.4 6.4l2.1-3.9-3.6 2.6"/>',
  classes: '<path d="M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  magic: '<path d="M12 2 19 9 12 22 5 9z"/><path d="M5 9h14M12 2 9.5 9 12 22l2.5-13z"/>',
  equipment: '<path d="M14.5 3.5 20.5 3.5 20.5 9.5 10 20 4 14z"/><path d="M7 17l-3 3M8.5 12.5l3 3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
};

const TABS = [
  { id: "info", label: "Info" },
  { id: "races", label: "Races" },
  { id: "classes", label: "Classes" },
  { id: "magic", label: "Magic" },
  { id: "equipment", label: "Equipment" },
  { id: "search", label: "Search" },
];

const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function renderNav(active) {
  // Clicking the tab you're on goes to its front page; other tabs return to where you left them.
  nav.innerHTML = TABS.map((t) => `
    <a href="${t.id !== active && state.lastPage[t.id] || `#/${t.id}`}" ${t.id === active ? 'aria-current="page"' : ""}>
      ${icon(t.id)}<span>${t.label}</span>${t.wip ? '<span class="wip-tag">WIP</span>' : ""}
    </a>`).join("");
}

/* ---------------- Helpers ---------------- */

function readPref(key) { try { return localStorage.getItem(key); } catch { return null; } }
function writePref(key, val) { try { localStorage.setItem(key, val); } catch { /* storage unavailable */ } }

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Minimal Markdown: paragraphs, line breaks, "- " lists, **bold**, *italic*. */
function md(src) {
  if (!src) return "";
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
    const flushList = () => { if (list.length) out.push(`<ul class="md">${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`); list = []; };
    const flushRows = () => { if (rows.length) out.push(table(rows)); rows = []; };
    for (const line of block.split("\n")) {
      if (isRow(line)) { flushPara(); flushList(); rows.push(line); }
      else if (bullet.test(line)) { flushRows(); flushPara(); list.push(line.replace(bullet, "")); }
      else { flushRows(); flushList(); para.push(line); }
    }
    flushRows(); flushPara(); flushList();
    return out.join("");
  }).join("");
}

const plain = (s) => String(s ?? "").replace(/\*\*?|__?/g, "");

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/* ---------------- Data ---------------- */

async function loadData() {
  const res = await fetch(`${DATA_ROOT}/classes/index.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`index.json returned ${res.status}`);
  const index = await res.json();
  const classes = await Promise.all(index.classes.map(async (c) => {
    const r = await fetch(`${DATA_ROOT}/classes/${c.file}`, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${c.file} returned ${r.status}`);
    return r.json();
  }));
  state.classes = classes;
  try {
    const sr = await fetch(`${DATA_ROOT}/class-summaries.json`, { cache: "no-cache" });
    if (sr.ok) state.summaries = await sr.json();
  } catch { /* summaries are optional */ }
  try {
    const rr = await fetch(`${DATA_ROOT}/races.json`, { cache: "no-cache" });
    if (rr.ok) state.races = await rr.json();
  } catch { /* races page falls back to "work in progress" */ }
  try {
    // one file per crystal, listed in data/magic/index.json
    const mi = await fetch(`${DATA_ROOT}/magic/index.json`, { cache: "no-cache" });
    if (mi.ok) {
      const index = await mi.json();
      const crystals = await Promise.all(index.crystals.map(async (c) => {
        const r = await fetch(`${DATA_ROOT}/magic/${c.file}`, { cache: "no-cache" });
        if (!r.ok) throw new Error(`magic/${c.file} returned ${r.status}`);
        return r.json();
      }));
      state.magic = { crystals };
    }
  } catch (err) { console.warn("Magic data not loaded:", err); /* magic page falls back to "work in progress" */ }
  try {
    const er = await fetch(`${DATA_ROOT}/equipment.json`, { cache: "no-cache" });
    if (er.ok) state.equipment = await er.json();
  } catch { /* equipment page falls back to "work in progress" */ }
  try {
    const ir = await fetch(`${DATA_ROOT}/info.json`, { cache: "no-cache" });
    if (ir.ok) state.info = await ir.json();
  } catch { /* info page falls back to "work in progress" */ }
  state.byId = new Map(classes.map((c) => [c.id, c]));
}

/* ---------------- Masonry columns ---------------- */

/**
 * A grid of cards that stack straight under each other (no row gaps).
 * Cards are rendered flat; packMasonry() then splits them into as many
 * columns as fit (at least `min` px wide), putting each card into the
 * currently shortest column while keeping the note's order.
 */
const masonry = (cards, min, max = 99, extraClass = "") =>
  `<div class="masonry${extraClass ? ` ${extraClass}` : ""}" data-min="${min}" data-max="${max}">${cards.map((html, i) => html.replace("<article ", `<article data-order="${i}" `)).join("")}</div>`;

/**
 * Two-column class pages: both columns are sticky. A column shorter than the window stays in view;
 * a taller one scrolls until its bottom reaches the window, then holds while the other side continues.
 */
function stickColumns() {
  const twoCol = window.innerWidth > 1180;
  const subtabs = main.querySelector(".subtabs")?.offsetHeight ?? 0;
  document.documentElement.style.setProperty("--subtabs-h", `${subtabs}px`);
  const offset = subtabs + 12;
  for (const col of main.querySelectorAll(".class-body:not(.single) > .col")) {
    col.style.top = twoCol ? `${Math.min(offset, window.innerHeight - col.offsetHeight - 16)}px` : "";
  }
}

function packMasonry() {
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
  {
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
}

/* ---------------- Pages ---------------- */

function wipPage(tab) {
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

function classSubtabs(activeId) {
  return `
    <nav class="subtabs" aria-label="Classes">
      <a href="#/classes" ${!activeId ? 'aria-current="page"' : ""}>Overview</a>
      <span class="sep" aria-hidden="true"></span>
      ${state.classes.map((c) => `<a href="#/classes/${c.id}" ${c.id === activeId ? 'aria-current="page"' : ""}>${esc(c.name)}</a>`).join("")}
    </nav>`;
}

// data/class-summaries.json: { "<class-id>": { "summary": "...", "icon": "<svg shapes>" } } (a plain string is also accepted)
const summaryOf = (c) => { const s = state.summaries[c.id]; return (typeof s === "string" ? s : s?.summary) ?? c.description ?? null; };
const classIcon = (c, cls = "class-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${state.summaries[c.id]?.icon ?? ICONS.classes}</svg>`;
const chipsFor = (c) => c.tags.length ? `<div class="chips">${c.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : "";

/** "1d8 + 3" — the part that matters at a glance. */
function hpCore(hp) {
  if (!hp) return "";
  if (!hp.dice) return esc(hp.raw);
  return `${esc(hp.dice)}${hp.flat ? ` + ${hp.flat}` : ""}`;
}

function classOverview() {
  const tags = [...new Set(state.classes.flatMap((c) => c.tags))].sort();
  const shown = state.tagFilter ? state.classes.filter((c) => c.tags.includes(state.tagFilter)) : state.classes;
  return `
    ${classSubtabs(null)}
    <header class="page-head">
      <h1>Combat Classes</h1>
    </header>
    <div class="filter" role="group" aria-label="Filter by tag">
      <button type="button" data-tag="" aria-pressed="${!state.tagFilter}">All</button>
      ${tags.map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${state.tagFilter === t}">${esc(t)}</button>`).join("")}
    </div>
    <div class="roster">
      ${shown.map((c) => `
        <a class="facet" href="#/classes/${c.id}">
          <div class="roster-top">
            <h2>${classIcon(c)}${esc(c.name)}</h2>
            ${c.healthPerLevel ? `<span class="roster-hp" title="Health per level">${hpCore(c.healthPerLevel)}</span>` : ""}
          </div>
          ${summaryOf(c) ? `<p class="summary">${esc(summaryOf(c))}</p>` : ""}
          ${chipsFor(c)}
        </a>`).join("")}
    </div>`;
}

const allAbilities = (cls) => (cls.abilityGroups ?? []).flatMap((g) => g.abilities.map((a) => ({ ...a, group: g })));

function levelTable(cls) {
  const abilities = allAbilities(cls).filter((a) => inScope(a.level));
  const levels = [...cls.levels.map((l) => l.level), ...cls.features.map((f) => f.level), ...abilities.map((a) => a.level)];
  const top = Math.max(0, ...levels.filter((n) => n != null));
  const max = state.showDrafts ? top : Math.min(top, CONFIG.maxLevel);
  if (!max) return "";
  const link = (id, name, cls2 = "") => `<a class="${cls2}" href="#/classes/${cls.id}/${encodeURIComponent(id)}">${esc(name || "Unnamed")}</a>`;

  const rows = Array.from({ length: max }, (_, i) => i + 1).map((lvl) => {
    const row = cls.levels.find((l) => l.level === lvl);
    const ca = row?.ca
      ? `<span class="ca-total">${row.ca.total}</span>${row.ca.gain != null ? `<span class="ca-gain">+${row.ca.gain}</span>` : ""}`
      : `<span class="none">–</span>`;
    const gained = [
      row?.grants && `<span class="badge resource">${esc(row.grants)}</span>`,
      ...cls.features.filter((f) => f.level === lvl).map((f) => link(f.id, f.name)),
      ...abilities.filter((a) => a.level === lvl).map((a) => link(a.id, a.name, "ability-link")),
    ].filter(Boolean);
    return `
      <tr${beyond(lvl) ? ' class="beyond"' : ""}>
        <th scope="row">${lvl}</th>
        <td class="ca">${ca}</td>
        <td class="gained">${gained.length ? gained.join('<span class="comma">, </span>') : '<span class="none">–</span>'}</td>
      </tr>`;
  }).join("");

  return `
    <section class="block">
      <div class="facet level-table-wrap">
        <table class="level-table">
          <thead><tr><th scope="col">Level</th><th scope="col">CA</th><th scope="col">Features and abilities</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function featurePanel(cls, f, { draft = false } = {}) {
  const badges = [
    f.cost && `<span class="badge resource">${esc(f.cost)}</span>`,
    draft && `<span class="badge draft">Draft</span>`,
    !draft && beyond(f.level) && `<span class="badge draft">Above level ${CONFIG.maxLevel}</span>`,
  ].filter(Boolean).join("");
  const title = f.name ? `<h3>${esc(f.name)}</h3>` : `<h3 class="untitled">Unnamed feature</h3>`;
  return `
    <article class="facet panel feature${draft || beyond(f.level) ? " draft-panel" : ""}" id="${anchorId(cls.id, (draft ? "draft-" : "") + f.id)}">
      ${title}
      ${badges ? `<div class="meta">${badges}</div>` : ""}
      <div class="body">${md(f.body) || '<p class="empty">No description yet.</p>'}</div>
    </article>`;
}

function abilityCard(cls, a) {
  return `
    <article class="facet ability${beyond(a.level) ? " draft-panel" : ""}" id="${anchorId(cls.id, a.id)}">
      <h4>${esc(a.name)}</h4>
      <div class="meta">
        ${a.cost ? `<span class="badge resource">${esc(a.cost)}</span>` : ""}
        ${beyond(a.level) ? `<span class="badge draft">Above level ${CONFIG.maxLevel}</span>` : ""}
      </div>
      <div class="body">${md(a.body)}</div>
    </article>`;
}

function featureColumn(cls, { wide }) {
  const byLevel = groupBy(cls.features.filter((f) => inScope(f.level)), (f) => f.level);
  const levelRows = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([lvl, feats]) => `
    <div class="level-row">
      <div class="level-mark"><span class="num">${lvl}</span><span class="lbl">Level ${lvl}</span></div>
      <div class="panels${wide ? "" : " stack"}">${feats.map((f) => featurePanel(cls, f)).join("")}</div>
    </div>`).join("");

  const drafts = state.showDrafts && cls.drafts.length ? `
    <section class="block">
      <h2>Drafts</h2>
      <p class="lede">Unfinished features from the notes. Turn off “Show drafts &amp; hidden content” to hide these.</p>
      <div class="panels${wide ? "" : " stack"}">${cls.drafts.map((d) => featurePanel(cls, d, { draft: true })).join("")}</div>
    </section>` : "";

  const notes = state.showDrafts && cls.designerNotes.length ? `
    <section class="block">
      <h2>Designer notes</h2>
      <ul class="notes">${cls.designerNotes.map((n) => `<li>${md(n)}</li>`).join("")}</ul>
    </section>` : "";

  return `
    ${levelTable(cls)}
    <section class="block">
      <h2>Features</h2>
      <div class="levels">${levelRows || '<p class="empty">No finished features yet.</p>'}</div>
    </section>
    ${drafts}
    ${notes}`;
}

function systemColumn(cls) {
  const groupsData = cls.abilityGroups ?? [];
  const linked = new Set(groupsData.map((g) => g.mechanicId).filter(Boolean));
  const loose = cls.mechanics.filter((m) => !linked.has(m.id));

  const mechanics = loose.length ? `
    <section class="block">
      <h2>Mechanics</h2>
      <div class="facet panel mechanic">
        ${loose.map((m) => `
          <div class="mech-item" id="${anchorId(cls.id, "mech-" + m.id)}">
            <h3>${esc(m.name)}</h3>
            <div class="body">${md(m.body)}</div>
          </div>`).join("")}
      </div>
    </section>` : "";

  const groups = groupsData.map((g) => {
    const mech = g.mechanicId && cls.mechanics.find((m) => m.id === g.mechanicId);
    const shown = g.abilities.filter((a) => inScope(a.level));
    if (!shown.length && !mech) return "";
    return `
      <section class="block">
        <h2>${esc(g.name)}</h2>
        ${mech ? `
          <div class="facet panel mechanic" id="${anchorId(cls.id, "mech-" + mech.id)}">
            <div class="body">${md(mech.body)}</div>
          </div>` : ""}
        ${[...groupBy(shown, (a) => a.level).entries()].sort((x, y) => (x[0] ?? 99) - (y[0] ?? 99)).map(([lvl, list]) => `
          <div class="ability-level">
            <div class="level-divider${beyond(lvl) ? " beyond" : ""}"><span>${lvl != null ? `Level ${lvl}` : "Any level"}</span></div>
            ${masonry(list.map((a) => abilityCard(cls, a)), 240)}
          </div>`).join("")}
      </section>`;
  }).join("");

  const entryHtml = (e) => `
    <div class="entry-head">
      <h3>${esc(e.name)}</h3>
      ${e.subtitle ? `<span class="sub">${esc(e.subtitle)}</span>` : ""}
    </div>
    ${e.flavor ? `<p class="flavor">${esc(e.flavor)}</p>` : ""}
    <div class="body">${md(e.body)}</div>
    ${e.options.length ? `
      <div class="options">
        ${e.options.map((o) => `
          <div class="facet option" id="${anchorId(cls.id, e.id + "--" + o.id)}">
            <h4>${esc(o.name)}</h4>
            <div class="body">${md(o.body)}</div>
          </div>`).join("")}
      </div>` : ""}`;

  const sections = cls.sections.map((s) => {
    const key = `${cls.id}/${s.id}`;
    const tabbed = s.entries.length > 1;
    const active = state.sectionTab[key] ?? s.entries[0]?.id;
    return `
    <section class="block">
      <h2>${esc(s.name)}</h2>
      ${s.intro ? `<p class="lede">${esc(plain(s.intro))}</p>` : ""}
      ${tabbed ? `
        <div class="entry-tabs" role="tablist" aria-label="${esc(s.name)}" data-key="${esc(key)}">
          ${s.entries.map((e) => `
            <button type="button" role="tab" id="tab-${cls.id}-${e.id}" aria-controls="${anchorId(cls.id, e.id)}"
              aria-selected="${e.id === active}" tabindex="${e.id === active ? 0 : -1}" data-entry="${e.id}">
              <span class="tab-name">${esc(e.name)}</span>${e.subtitle ? `<span class="tab-sub">${esc(e.subtitle)}</span>` : ""}
            </button>`).join("")}
        </div>` : ""}
      <div class="entries">
        ${s.entries.map((e) => `
          <article class="facet entry" id="${anchorId(cls.id, e.id)}"
            ${tabbed ? `role="tabpanel" aria-labelledby="tab-${cls.id}-${e.id}" ${e.id === active ? "" : "hidden"}` : ""}>
            ${entryHtml(e)}
          </article>`).join("")}
      </div>
    </section>`;
  }).join("");

  return mechanics + groups + sections;
}

function classPage(cls) {
  const right = systemColumn(cls);
  const hp = cls.healthPerLevel;
  return `
    <div class="class-watermark">${classIcon(cls, "")}</div>
    ${classSubtabs(cls.id)}
    <header class="class-head">
      <div>
        <h1>${esc(cls.name)}</h1>
        ${summaryOf(cls) ? `<p class="lede">${esc(summaryOf(cls))}</p>` : ""}
        ${chipsFor(cls)}
      </div>
      ${hp ? `
        <div class="hp-block">
          <span class="hp-label">Health per level</span>
          <span class="hp">${hpCore(hp)}${hp.stat ? `<small> + ${esc(hp.stat)}</small>` : ""}</span>
        </div>` : ""}
    </header>
    <div class="class-body${!right ? " single" : cls.sections.length ? " wide-right" : ""}">
      <div class="col col-features">${featureColumn(cls, { wide: !right })}</div>
      ${right ? `<div class="col-divider" aria-hidden="true"></div><div class="col col-systems">${right}</div>` : ""}
    </div>`;
}

const anchorId = (classId, itemId) => `${classId}--${itemId}`;

/* ---------------- Races ---------------- */

function traitItem(t) {
  return `
    <li class="trait${t.unique ? " is-unique" : ""}">
      <span class="trait-cost" title="${t.cost} trait point${t.cost === 1 ? "" : "s"}">${t.cost}</span>
      <div class="trait-text">
        ${t.unique ? `<span class="unique-tag">Unique: ${esc(t.unique)}</span>` : ""}${md(t.text).replace(/^<p>|<\/p>$/g, "")}
      </div>
    </li>`;
}

function racePanel(r, i) {
  return `
    <article class="facet race" id="race--${r.id}" style="order: ${i}">
      <h3>${esc(r.name)}</h3>
      ${r.sizes ? `<p class="race-size"><span>Size</span> ${esc(r.sizes)}</p>` : ""}
      ${r.description ? `<p class="race-desc">${esc(r.description)}</p>` : ""}
      <ul class="traits">${r.traits.map(traitItem).join("")}</ul>
    </article>`;
}

function racesPage() {
  const d = state.races;
  if (!d) return wipPage({ label: "Races", wip: "Race data hasn't been generated yet. Run node tools/convert-races.mjs in the Website folder." });
  const points = d.pointsTable.length ? `
    <table class="points-table">
      <tr><th scope="row">d20</th>${d.pointsTable.map((p) => `<td>${esc(p.roll)}</td>`).join("")}</tr>
      <tr><th scope="row">Trait points</th>${d.pointsTable.map((p) => `<td class="pts">${esc(p.points)}</td>`).join("")}</tr>
    </table>` : "";
  return `
    <header class="page-head races-head">
      <h1>Races</h1>
      <div class="races-intro">
        ${d.intro ? `<p class="lede">${esc(plain(d.intro))}</p>` : ""}
        ${points}
      </div>
    </header>
    <div class="race-groups">
      ${d.groups.map((g) => `
        <section class="race-group" aria-labelledby="rg-${g.id}">
          <div class="race-group-head">
            <h2 id="rg-${g.id}">${esc(g.name)}</h2>
            ${g.description ? `<p>${esc(g.description)}</p>` : ""}
          </div>
          <div class="race-grid">
            ${[0, 1].map((col) => `<div class="race-col">${g.races.map(racePanel).filter((_, i) => i % 2 === col).join("")}</div>`).join("")}
          </div>
        </section>`).join("")}
    </div>
    ${state.showDrafts && d.designerNotes.length ? `
      <section class="block">
        <h2>Designer notes</h2>
        <ul class="notes">${d.designerNotes.map((n) => `<li>${md(n)}</li>`).join("")}</ul>
      </section>` : ""}`;
}

/* ---------------- Magic ---------------- */

const crystalColor = (c) => CONFIG.crystalColors[c.id] ?? "var(--accent)";
const damageTypesOf = (c) => c.damageTypes ?? (c.damageType ? [c.damageType] : []);
const statPills = (c) => (c.stats ?? []).map((st) => `<span class="stat-pill">${esc(st)}</span>`).join("");
const gem = `<svg class="crystal-gem" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 19 9 12 22 5 9z"/><path class="cut" d="M5 9h14M12 2 9.5 9 12 22l2.5-13z"/></svg>`;

function magicSubtabs(activeId) {
  return `
    <nav class="subtabs" aria-label="Crystals">
      <a href="#/magic" ${!activeId ? 'aria-current="page"' : ""}>Overview</a>
      <span class="sep" aria-hidden="true"></span>
      ${state.magic.crystals.map((c) => `<a class="crystal-tab" style="--crystal: ${crystalColor(c)}" href="#/magic/${c.id}" ${c.id === activeId ? 'aria-current="page"' : ""}>${esc(c.name)}</a>`).join("")}
    </nav>`;
}

function magicOverview() {
  return `
    ${magicSubtabs(null)}
    <header class="page-head">
      <h1>Magic</h1>
    </header>
    <div class="roster">
      ${state.magic.crystals.map((c) => {
        const shown = c.spells.filter(spellInScope);
        return `
        <a class="facet crystal-card" href="#/magic/${c.id}" style="--crystal: ${crystalColor(c)}">
          <div class="roster-top">
            <h2>${gem}${esc(c.name)}</h2>
            ${c.tier ? `<span class="chip">Tier ${c.tier}</span>` : ""}
          </div>
          ${c.stats?.length ? `<div class="crystal-stats"><span class="hp-label">Stats</span>${statPills(c)}</div>` : ""}
          <p class="summary">
            ${shown.length} spell${shown.length === 1 ? "" : "s"}${damageTypesOf(c).length ? `, ${damageTypesOf(c).map(esc).join(" and ")} damage` : ""}.
            ${c.ascendsInto.length ? `<br>Ascends into ${c.ascendsInto.map(esc).join(", ")}.` : ""}
          </p>
          ${c.keywords.length ? `<div class="chips">${c.keywords.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>` : ""}
        </a>`;
      }).join("")}
    </div>`;
}

function spellCard(c, s, { draft = false } = {}) {
  const hidden = !draft && !spellByDefault(s);
  const meta = [
    s.ca && `<span class="chip ca-chip" ${s.ca === "Auto" ? 'title="Learned automatically"' : ""}>${s.ca === "Auto" ? "Auto" : `${esc(s.ca)} CA`}</span>`,
    s.mana && `<span class="badge resource">${esc(s.mana)} Mana</span>`,
    s.concentration && `<span class="chip">${esc(s.concentration)}</span>`,
    ...s.tags.map((t) => `<span class="chip">${esc(t)}</span>`),
    draft && `<span class="badge draft">Draft</span>`,
    hidden && `<span class="badge draft">Hidden by default</span>`,
  ].filter(Boolean).join("");
  return `
    <article class="facet spell${draft || hidden ? " draft-panel" : ""}" id="${anchorId(c.id, (draft ? "draft-" : "") + s.id)}">
      <h3>${esc(s.name)}</h3>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      ${s.body ? `<div class="body">${md(s.body)}</div>` : '<p class="empty">No description yet.</p>'}
      ${s.upgrades.length ? `
        <div class="upgrades">
          ${s.upgrades.map((u) => `
            <div class="upgrade">
              <span class="up-cost">${u.ca ? `${esc(u.ca)} CA` : "Upgrade"}</span>
              <div class="up-text">${u.variant ? `<span class="up-variant">${esc(u.variant)}</span>` : ""}${md(u.text)}</div>
            </div>`).join("")}
        </div>` : ""}
    </article>`;
}

function crystalPage(c) {
  const shown = c.spells.filter(spellInScope);
  const tiers = [...groupBy(shown, (s) => s.ba ?? 0).entries()].sort((a, b) => a[0] - b[0]);
  const mechanics = c.mechanics.length ? `
    <section class="block crystal-mechanics">
      <h2>Mechanics</h2>
      <div class="mechanics-grid">
        ${c.mechanics.map((m) => `
          <article class="facet panel mechanic" id="${anchorId(c.id, "mech-" + m.id)}">
            <h3>${esc(m.name)}</h3>
            <div class="body">${md(m.body)}</div>
          </article>`).join("")}
      </div>
    </section>` : "";
  const drafts = state.showDrafts && c.drafts.length ? `
    <section class="block">
      <h2>Drafts</h2>
      <p class="lede">Unfinished spells from the notes. Turn off “Show drafts &amp; hidden content” to hide these.</p>
      ${masonry(c.drafts.map((s) => spellCard(c, s, { draft: true })), 290, 3)}
    </section>` : "";
  return `
    ${magicSubtabs(c.id)}
    <div class="crystal-page" style="--crystal: ${crystalColor(c)}">
      <header class="class-head crystal-head">
        <div>
          <h1>${gem}${esc(c.name)}</h1>
          <div class="chips">
            ${c.tier ? `<span class="chip">Tier ${c.tier}</span>` : ""}
            ${damageTypesOf(c).map((t) => `<span class="chip">${esc(t)} damage</span>`).join("")}
            ${c.keywords.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}
          </div>
        </div>
        <div class="crystal-facts">
          ${c.stats?.length ? `
            <div class="hp-block">
              <span class="hp-label">Stats</span>
              <span class="crystal-stats big">${statPills(c)}</span>
            </div>` : ""}
          ${c.ascendsInto.length ? `
            <div class="hp-block">
              <span class="hp-label">Ascends into</span>
              <span class="ascends">${c.ascendsInto.map(esc).join(", ")}</span>
            </div>` : ""}
        </div>
      </header>
      ${mechanics}
      <section class="block">
        <h2>Spells</h2>
        ${tiers.length > 1 ? `
          <nav class="ba-jump" aria-label="Jump to spell tier">
            ${tiers.map(([ba]) => `<button type="button" data-jump="${anchorId(c.id, `ba-${ba}`)}"${ba > CONFIG.maxBA ? ' class="beyond"' : ""}>BA ${ba}</button>`).join("")}
          </nav>` : ""}
        ${tiers.map(([ba, list]) => `
          <div class="ability-level ba-tier" id="${anchorId(c.id, `ba-${ba}`)}">
            <div class="level-divider crystal-divider${ba > CONFIG.maxBA ? " beyond" : ""}"><span>BA ${ba}</span></div>
            ${masonry(list.map((s) => spellCard(c, s)), 290, 3)}
          </div>`).join("") || '<p class="empty">No spells yet.</p>'}
      </section>
      ${drafts}
    </div>`;
}

function magicPage(sub) {
  if (!state.magic) return { html: wipPage({ label: "Magic", wip: "Magic data hasn't been generated yet. Run updateFromDocs.bat in the Website folder." }) };
  if (!sub) return { html: magicOverview() };
  const c = state.magic.crystals.find((x) => x.id === sub);
  if (!c) return { html: `${magicSubtabs(null)}<div class="error"><h1>Crystal not found</h1><p>There's no crystal called “${esc(sub)}”. Pick one from the list above.</p></div>` };
  return { html: crystalPage(c), title: c.name };
}

/* ---------------- Equipment ---------------- */

function attrChip(a) {
  const def = state.equipment.attributes.find((d) => d.name.toLowerCase() === a.name.toLowerCase());
  const label = a.value ? `${a.name} ${a.value}` : a.name;
  return `<span class="attr${def ? " has-def" : ""}"${def ? ` title="${esc(`${def.name}${def.param ? ` - ${def.param}` : ""}: ${def.text}`)}"` : ""}>${esc(label)}</span>`;
}

function equipRow(label, value) {
  return value ? `<div class="equip-row"><span class="equip-lbl">${label}</span><span>${md(value).replace(/^<p>|<\/p>$/g, "")}</span></div>` : "";
}

function equipCard(item) {
  const sub = [
    item.type && `<span class="chip">${esc(item.type)}</span>`,
    item.weight && `<span class="chip weight-${slugCss(item.weight)}">${esc(item.weight)}</span>`,
    item.stats && `<span class="equip-stats">${item.stats.map(esc).join(" | ")}</span>`,
  ].filter(Boolean).join("");
  const atk = (label, a) => `<div class="equip-row"><span class="equip-lbl">${label}</span><span>${a ? `<b>${esc(a.dice)}</b>${a.damage ? ` ${esc(a.damage)}` : ""}` : '<span class="none">None</span>'}</span></div>`;
  const attacks = item.fullAction || item.halfAction ? atk("Full", item.fullAction) + atk("Half", item.halfAction) : "";
  const ac = item.ac || item.spellAc ? `
    <div class="ac-pair">
      ${item.ac ? `<div><span class="ac-num">${esc(item.ac)}</span><span class="ac-lbl">AC</span></div>` : ""}
      ${item.spellAc ? `<div><span class="ac-num">${esc(item.spellAc)}</span><span class="ac-lbl">Spell AC</span></div>` : ""}
    </div>` : "";
  return `
    <article class="facet equip" id="equip--${item.id}">
      <h3>${esc(item.name)}</h3>
      ${sub ? `<div class="equip-sub">${sub}</div>` : ""}
      ${ac}
      ${attacks ? `<div class="equip-rows">${attacks}</div>` : ""}
      ${item.attributes?.length ? `<div class="attrs">${item.attributes.map(attrChip).join("")}</div>` : ""}
      ${item.requirements || item.penalty || item.proficiencyBonus || item.expertiseBonus || item.extras ? `
        <div class="equip-rows bonuses">
          ${equipRow("Requires", item.requirements)}
          ${equipRow("Penalty", item.penalty)}
          ${equipRow("Proficiency", item.proficiencyBonus)}
          ${equipRow("Expertise", item.expertiseBonus)}
          ${(item.extras ?? []).map((x) => equipRow(esc(x.label ?? "Note"), x.value)).join("")}
        </div>` : ""}
    </article>`;
}

const slugCss = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-");

function equipmentPage() {
  const d = state.equipment;
  if (!d) return wipPage({ label: "Equipment", wip: "Equipment data hasn't been generated yet. Run updateFromDocs.bat in the Website folder." });
  const active = d.categories.find((c) => c.id === state.equipFilter) ?? null;
  const filter = `
    <div class="filter equip-filter" role="group" aria-label="Show category">
      <button type="button" data-equip="" aria-pressed="${!active}">Show All</button>
      ${d.categories.map((c) => `<button type="button" data-equip="${c.id}" aria-pressed="${active?.id === c.id}">${esc(c.name)}</button>`).join("")}
    </div>`;
  const content = active
    ? masonry(active.items.map(equipCard), 200, 5)
    : `<div class="equip-columns">
        ${d.categories.map((c) => `
          <section class="equip-col" aria-labelledby="ec-${c.id}">
            <h2 id="ec-${c.id}">${esc(c.name)}</h2>
            ${c.items.map(equipCard).join("")}
          </section>`).join("")}
      </div>`;
  return `
    <header class="page-head equip-head">
      <h1>Equipment</h1>
      ${d.intro ? `<div class="lede">${md(d.intro)}</div>` : ""}
    </header>
    ${d.attributes.length ? `
      <section class="facet glossary" aria-labelledby="glossary-h">
        <h2 id="glossary-h">Equipment attributes</h2>
        <dl>${d.attributes.map((a) => `<div><dt>${esc(a.name)}${a.param ? ` <span>${esc(a.param)}</span>` : ""}</dt><dd>${md(a.text).replace(/^<p>|<\/p>$/g, "")}</dd></div>`).join("")}</dl>
      </section>` : ""}
    ${filter}
    ${content}`;
}

/* ---------------- Info ---------------- */

function infoPanel(p) {
  const subs = p.sections.map((s) => `
    <article class="info-sub" id="info--${p.id}--${s.id}">
      <h3>${esc(s.title)}</h3>
      <div class="body">${md(s.body)}</div>
    </article>`);
  return `
    <article ${p.important ? 'data-span="2" ' : ""}class="facet info-panel${p.important ? " important" : ""}" id="info--${p.id}">
      <h2>${esc(p.title)}</h2>
      ${p.body ? `<div class="body">${md(p.body)}</div>` : ""}
      ${subs.length ? masonry(subs, 230) : ""}
    </article>`;
}

function infoPage() {
  const d = state.info;
  if (!d) return wipPage({ label: "Info", wip: "Info hasn't been generated yet. Run updateFromDocs.bat in the Website folder." });
  // important panels first (two columns wide), then the rest fill whatever column is shortest
  const panels = [...d.panels.filter((p) => p.important), ...d.panels.filter((p) => !p.important)];
  return `
    <header class="page-head"><h1>Basic Info</h1></header>
    ${masonry(panels.map(infoPanel), 260, 4, "span-masonry info-grid")}`;
}

/* ---------------- Copy to clipboard ---------------- */

// Cards that get a copy button (search results deliberately left out).
const COPYABLE = [
  ".info-panel", ".info-sub",                                   // info
  ".race",                                                      // races
  ".feature", ".ability", ".mechanic", ".entry", ".option",      // classes (and crystal conditions)
  ".spell",                                                     // magic
  ".equip",                                                     // equipment
].join(", ");

/** The card's cut-off corner becomes the copy button: it fills in on hover and copies on click. */
function addCopyButtons() {
  for (const card of main.querySelectorAll(COPYABLE)) {
    if (card.querySelector(":scope > .copy-btn")) continue;
    card.classList.add("copyable");
    card.insertAdjacentHTML("afterbegin", `<button type="button" class="copy-btn" aria-label="Copy to clipboard"></button><span class="copy-tip" aria-hidden="true">Copy to clipboard</span>`);
  }
}

// Rows whose parts read best on one line, and what joins them.
const JOINED = [
  [".meta, .chips, .attrs, .equip-sub, .ac-pair, .entry-head", " · "],
  [".equip-row, .upgrade", ": "],
  [".trait", " - "],
];
const BLOCK = /^(DIV|P|H[1-6]|ARTICLE|SECTION|UL|OL|TABLE|DL|DT|DD|HEADER|NAV)$/;

/** Card → plain text: one line per heading/paragraph/bullet, no formatting. */
function plainText(el) {
  const out = [];
  const words = (n) => [...n.childNodes].map((x) => x.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, " ")); return; }
    if (n.nodeType !== 1 || n.matches(".copy-btn, .copy-tip, [hidden], svg, .level-divider")) return;
    for (const [sel, sep] of JOINED) {
      if (n.matches(sel)) {
        const parts = [...n.children].map((c) => (c.matches(".equip-rows, ul, .body, .up-text, .trait-text") ? plainText(c).replace(/\n+/g, " ") : words(c))).filter(Boolean);
        out.push(`\n${parts.join(sep)}\n`);
        return;
      }
    }
    if (n.matches(".unique-tag")) { out.push(`(${n.textContent.trim()}) `); return; }
    if (n.tagName === "BR") { out.push("\n"); return; }
    if (n.tagName === "TR") { out.push(`\n${[...n.children].map((c) => c.textContent.trim()).join(" | ")}\n`); return; }
    if (n.tagName === "LI") out.push("\n- ");
    const block = BLOCK.test(n.tagName);
    if (block) out.push("\n");
    n.childNodes.forEach(walk);
    if (block) out.push("\n");
  };
  walk(el);
  return out.join("").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").replace(/^- \n/gm, "- ").trim();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API needs https/localhost; fall back for plain-http LAN hosting
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}

/* ---------------- Search ---------------- */

let searchIndex = null;

function buildSearchIndex() {
  const items = [];
  for (const c of state.classes) {
    const group = { key: c.id, name: c.name, href: `#/classes/${c.id}` };
    const at = (anchor) => `#/classes/${c.id}/${encodeURIComponent(anchor)}`;
    for (const m of c.mechanics) {
      items.push({ group, kind: "Mechanic", title: m.name, text: plain(m.body), href: at("mech-" + m.id) });
    }
    for (const f of c.features) {
      items.push({ group, kind: `Level ${f.level} feature`, title: f.name, text: plain(f.body), href: at(f.id), level: f.level });
    }
    for (const a of allAbilities(c)) {
      items.push({ group, kind: `Level ${a.level} ${a.group.resource} ability`, title: a.name, text: plain(a.body), href: at(a.id),
        extra: a.cost ?? "", level: a.level });
    }
    for (const s of c.sections) {
      for (const e of s.entries) {
        items.push({ group, kind: s.name.replace(/s$/, ""), title: e.subtitle ? `${e.name} (${e.subtitle})` : e.name,
          text: plain([e.flavor, e.body].filter(Boolean).join(" ")), href: at(e.id) });
        for (const o of e.options) {
          items.push({ group, kind: `${e.name} option`, title: o.name, text: plain(o.body), href: at(`${e.id}--${o.id}`) });
        }
      }
    }
    for (const d of c.drafts) {
      items.push({ group, kind: "Draft", title: d.name || "Unnamed feature", text: plain(d.body), href: at("draft-" + d.id), draft: true });
    }
    for (const it of items) if (it.group === group) it.extra = `${it.extra ?? ""} ${c.name} ${c.tags.join(" ")}`;
  }
  if (state.races) {
    const group = { key: "races", name: "Races", href: "#/races" };
    for (const g of state.races.groups) {
      for (const r of g.races) {
        items.push({ group, kind: `${g.name} race`, title: r.name, href: `#/races/${r.id}`,
          text: plain([r.description, r.sizes && `Size: ${r.sizes}.`, ...r.traits.map((t) => `${t.cost}: ${t.text}.`)].filter(Boolean).join(" ")),
          extra: g.name });
      }
    }
  }
  if (state.magic) {
    for (const c of state.magic.crystals) {
      const group = { key: "magic-" + c.id, name: `${c.name} magic`, href: `#/magic/${c.id}` };
      const at = (anchor) => `#/magic/${c.id}/${encodeURIComponent(anchor)}`;
      for (const m of c.mechanics) {
        items.push({ group, kind: "Mechanic", title: m.name, text: plain(m.body), href: at("mech-" + m.id) });
      }
      for (const s of c.spells) {
        items.push({ group, kind: `BA ${s.ba ?? 0} spell`, title: s.name, href: at(s.id), hidden: !spellByDefault(s),
          text: plain([s.body, ...s.upgrades.map((u) => u.text)].join(" ")), extra: `${c.name} ${s.mana ?? ""} ${s.concentration ?? ""}` });
      }
      for (const s of c.drafts) {
        items.push({ group, kind: "Draft spell", title: s.name, text: plain(s.body), href: at("draft-" + s.id), draft: true });
      }
    }
  }
  if (state.info) {
    const group = { key: "info", name: "Basic Info", href: "#/info" };
    for (const p of state.info.panels) {
      items.push({ group, kind: "Info", title: p.title, text: plain(p.body), href: `#/info/${p.id}` });
      for (const s of p.sections) {
        items.push({ group, kind: p.title, title: s.title, text: plain(s.body), href: `#/info/${p.id}--${s.id}` });
      }
    }
  }
  if (state.equipment) {
    const group = { key: "equipment", name: "Equipment", href: "#/equipment" };
    for (const c of state.equipment.categories) {
      for (const i of c.items) {
        const parts = [
          i.type, i.weight, i.stats?.join(" "),
          i.fullAction && `Full: ${i.fullAction.dice} ${i.fullAction.damage ?? ""}.`,
          i.halfAction && `Half: ${i.halfAction.dice} ${i.halfAction.damage ?? ""}.`,
          i.ac && `AC ${i.ac}.`, i.spellAc && `Spell AC ${i.spellAc}.`,
          i.attributes?.length && `${i.attributes.map((a) => a.value ? `${a.name} ${a.value}` : a.name).join(", ")}.`,
          i.requirements && `Requires ${i.requirements}.`, i.penalty && `Penalty: ${i.penalty}`,
          i.proficiencyBonus && `Proficiency: ${i.proficiencyBonus}`, i.expertiseBonus && `Expertise: ${i.expertiseBonus}`,
        ].filter(Boolean);
        items.push({ group, kind: c.name.replace(/s$/, ""), title: i.name, text: plain(parts.join(" ")), href: `#/equipment/${i.id}`, extra: c.name });
      }
    }
  }
  for (const it of items) it.hay = `${it.title} ${it.extra ?? ""} ${it.text}`.toLowerCase();
  return items;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function highlight(text, terms) {
  if (!terms.length) return esc(text);
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "gi");
  return esc(text).replace(re, "<mark>$1</mark>");
}

function snippet(text, terms, radius = 90) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = lower.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return text.length > radius * 2 ? text.slice(0, radius * 2).trimEnd() + "…" : text;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
}

function runSearch(query) {
  searchIndex ??= buildSearchIndex();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { terms, hits: [] };
  const hits = searchIndex
    .filter((it) => (state.showDrafts || (!it.draft && !it.hidden)) && inScope(it.level) && terms.every((t) => it.hay.includes(t)))
    .map((it) => {
      const title = it.title.toLowerCase();
      const score = terms.reduce((s, t) => s + (title.includes(t) ? 10 : 0) + (title.startsWith(t) ? 5 : 0), 0);
      return { ...it, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);
  return { terms, hits };
}

function searchResults(query) {
  const { terms, hits } = runSearch(query);
  if (!terms.length) return "";
  if (!hits.length) return `<p class="empty">Nothing matches “${esc(query)}”. Try a single word, like a stat, condition or action type.</p>`;
  const groups = groupBy(hits, (h) => h.group.key);
  return `
    <p class="empty count" role="status">${hits.length} result${hits.length === 1 ? "" : "s"}</p>
    ${[...groups.values()].map((list) => `
      <section class="result-group">
        <h2><a href="${list[0].group.href}">${esc(list[0].group.name)}</a></h2>
        ${list.map((h) => `
          <a class="facet result${h.draft ? " draft-panel" : ""}" href="${h.href}">
            <div class="top"><h3>${highlight(h.title, terms)}</h3><span class="kind">${esc(h.kind)}</span></div>
            <p>${highlight(snippet(h.text, terms), terms)}</p>
          </a>`).join("")}
      </section>`).join("")}`;
}

function searchPage() {
  return `
    <header class="page-head">
      <h1>Search</h1>
    </header>
    <div class="search-box">
      ${icon("search")}
      <input id="q" type="search" placeholder="Search rules, races, classes, spells and equipment" value="${esc(state.query)}" autocomplete="off" aria-label="Search">
    </div>
    <p class="search-scope">Searching basic info, races, combat classes, magic and equipment.</p>
    <div class="results" id="results">${searchResults(state.query)}</div>`;
}

/* ---------------- Router ---------------- */

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const tab = TABS.some((t) => t.id === parts[0]) ? parts[0] : "info";
  return { tab, sub: parts[1] || null, anchor: parts[2] || null };
}

let lastView = "";

const scrollMemory = new Map(); // "tab/sub" -> scroll position when you left it
if ("scrollRestoration" in history) history.scrollRestoration = "manual"; // the site restores scroll itself

function render() {
  const { tab, sub, anchor } = parseRoute();
  // classes and magic remember which class/crystal you were on
  state.lastPage[tab] = sub && (tab === "classes" || tab === "magic") ? `#/${tab}/${encodeURIComponent(sub)}` : `#/${tab}`;
  renderNav(tab);
  const tabDef = TABS.find((t) => t.id === tab);

  let html;
  let title = tabDef.label;
  if (tabDef.wip) html = wipPage(tabDef);
  else if (tab === "search") html = searchPage();
  else if (tab === "races") html = racesPage();
  else if (tab === "info") html = infoPage();
  else if (tab === "magic") { const r = magicPage(sub); html = r.html; title = r.title ?? title; }
  else if (tab === "equipment") {
    if (sub) state.equipFilter = null; // a link to one item opens the full view so it's visible
    html = equipmentPage();
  }
  else if (tab === "classes") {
    const cls = sub && state.byId.get(sub);
    if (sub && !cls) html = `${classSubtabs(null)}<div class="error"><h1>Class not found</h1><p>There's no class called “${esc(sub)}”. Pick one from the list above.</p></div>`;
    else if (cls) {
      if (anchor) {
        for (const s of cls.sections) {
          const hit = s.entries.find((e) => anchor === e.id || anchor.startsWith(e.id + "--"));
          if (hit) state.sectionTab[`${cls.id}/${s.id}`] = hit.id;
        }
      }
      html = classPage(cls); title = cls.name;
    }
    else html = classOverview();
  }

  const view = `${tab}/${sub ?? ""}`;
  main.innerHTML = html;
  document.title = `${title} · Arkadia`;
  addCopyButtons();
  packMasonry();
  stickColumns();
  markCurrentTier();
  document.fonts?.ready.then(() => { packMasonry(); stickColumns(); }); // web fonts change card heights slightly

  const targetId = tab === "races" && sub ? `race--${sub}`
    : tab === "equipment" && sub ? `equip--${sub}`
    : tab === "info" && sub ? `info--${sub}`
    : anchor ? anchorId(sub, anchor) : null;
  if (targetId) {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  } else if (view !== lastView) {
    window.scrollTo(0, scrollMemory.get(view) ?? 0);
    // Keep the active sub tab visible on narrow screens
    main.querySelector('.subtabs [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }
  lastView = view;

  if (tab === "search") {
    const q = document.getElementById("q");
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

/* ---------------- Events ---------------- */

main.addEventListener("input", (e) => {
  if (e.target.id !== "q") return;
  state.query = e.target.value;
  document.getElementById("results").innerHTML = searchResults(state.query);
});

function selectTab(btn, focus = false) {
  const list = btn.closest(".entry-tabs");
  state.sectionTab[list.dataset.key] = btn.dataset.entry;
  for (const b of list.querySelectorAll("[role=tab]")) {
    const on = b === btn;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
    document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
  }
  stickColumns();
  if (focus) btn.focus();
}

main.addEventListener("click", (e) => {
  const copy = e.target.closest(".copy-btn");
  if (copy) {
    const tip = copy.nextElementSibling;
    copyText(plainText(copy.parentElement)).then(() => {
      copy.classList.add("done"); tip.textContent = "Copied";
      setTimeout(() => { copy.classList.remove("done"); tip.textContent = "Copy to clipboard"; }, 1200);
    });
    return;
  }
  const jump = e.target.closest(".ba-jump button");
  if (jump) {
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    return;
  }
  const tab = e.target.closest(".entry-tabs [role=tab]");
  if (tab) { selectTab(tab); return; }
  const eq = e.target.closest(".equip-filter button");
  if (eq) {
    state.equipFilter = eq.dataset.equip || null;
    if (location.hash !== "#/equipment") history.replaceState(null, "", "#/equipment");
    render();
    return;
  }
  const btn = e.target.closest(".filter button");
  if (!btn) return;
  state.tagFilter = btn.dataset.tag || null;
  render();
});

draftToggle.checked = state.showDrafts;
document.getElementById("toggle-label").innerHTML =
  `Show drafts &amp; hidden content<small>Level ${CONFIG.maxLevel + 1}+, BA ${CONFIG.maxBA + 15}+, Talents</small>`;
draftToggle.addEventListener("change", () => {
  state.showDrafts = draftToggle.checked;
  writePref("arkadia.showDrafts", state.showDrafts ? "1" : "0");
  render();
});

main.addEventListener("keydown", (e) => {
  const tab = e.target.closest?.(".entry-tabs [role=tab]");
  if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  const tabs = [...tab.parentElement.querySelectorAll("[role=tab]")];
  const i = tabs.indexOf(tab);
  const next = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1
    : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  e.preventDefault();
  selectTab(tabs[next], true);
});

window.addEventListener("hashchange", () => {
  scrollMemory.set(lastView, window.scrollY); // lastView is still the page being left
  render();
});

/** Mark the BA button for the tier currently at the top of the screen. */
function markCurrentTier() {
  const bar = main.querySelector(".ba-jump");
  if (!bar) return;
  const line = bar.getBoundingClientRect().bottom + 24;
  let current = null;
  for (const tier of main.querySelectorAll(".ba-tier")) if (tier.getBoundingClientRect().top <= line) current = tier.id;
  for (const b of bar.querySelectorAll("button")) b.setAttribute("aria-current", b.dataset.jump === (current ?? bar.querySelector("button").dataset.jump));
}
window.addEventListener("scroll", markCurrentTier, { passive: true });

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { packMasonry(); stickColumns(); }, 120);
});

/* ---------------- Boot ---------------- */

(async () => {
  renderNav(parseRoute().tab);
  try {
    await loadData();
    render();
  } catch (err) {
    const fileProtocol = location.protocol === "file:";
    main.innerHTML = `
      <div class="error">
        <h1>Couldn't load the game data</h1>
        ${fileProtocol
          ? `<p>Browsers block data files when a page is opened straight from disk. Start the local server instead: double-click <code>start.bat</code>, or run <code>node tools/serve.mjs</code> in the Website folder, then open the address it prints.</p>`
          : `<p>${esc(err.message)}. Check that <code>data/classes/</code> exists, and run <code>node tools/convert-classes.mjs</code> to regenerate it.</p>`}
      </div>`;
  }
})();
