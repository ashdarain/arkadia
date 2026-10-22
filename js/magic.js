/* Magic: the crystal overview (with its filters) and each crystal page. */

import {
  anchorId, beyond, CONFIG, crystalHidden, esc, groupBy, hiddenBadge, masonry, md, shownCrystals,
  spellByDefault, spellInScope, state, wipPage,
} from "./core.js";
import { THEMES } from "./settings.js";

/* Each crystal's colour is a CSS variable (--crystal-fire …) that the light themes redefine with
   the crystal's lightColor, so a page doesn't need redrawing when the theme changes. */
export const crystalColor = (c) => CONFIG.crystalColors[c.id] ? `var(--crystal-${c.id})` : "var(--accent)";
{
  const entries = Object.entries(CONFIG.crystalColors);
  const lightThemes = THEMES.filter((t) => t.light).map((t) => `[data-theme="${t.id}"]`).join(", ");
  const style = document.createElement("style");
  style.id = "crystal-colours";
  style.textContent =
    `:root { ${entries.map(([id, c]) => `--crystal-${id}: ${c.color};`).join(" ")} }\n` +
    // crystals without a lightColor keep their normal colour on the light themes too
    (lightThemes ? `${lightThemes} { ${entries.filter(([, c]) => c.lightColor).map(([id, c]) => `--crystal-${id}: ${c.lightColor};`).join(" ")} }` : "");
  document.head.append(style);
}
const damageTypesOf = (c) => c.damageTypes ?? (c.damageType ? [c.damageType] : []);
export const gem = `<svg class="crystal-gem" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 19 9 12 22 5 9z"/><path class="cut" d="M5 9h14M12 2 9.5 9 12 22l2.5-13z"/></svg>`;

/** A chip on a crystal page that opens the Magic overview filtered to just this value. */
const filterLink = (key, value, label, cls, tip) =>
  `<a class="${cls} filter-link" href="#/magic" data-mfilter-go="${key}" data-value="${esc(value)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${esc(label)}</a>`;

function magicSubtabs(activeId) {
  return `
    <nav class="subtabs" aria-label="Crystals">
      <a href="#/magic" ${!activeId ? 'aria-current="page"' : ""}>Overview</a>
      <span class="sep" aria-hidden="true"></span>
      ${shownCrystals().map((c) => `<a class="crystal-tab${crystalHidden(c) ? " hidden-page" : ""}" style="--crystal: ${crystalColor(c)}" href="#/magic/${c.id}" ${c.id === activeId ? 'aria-current="page"' : ""}>${esc(c.name)}</a>`).join("")}
    </nav>`;
}

/* Display order of filter buttons. Only values some crystal actually has get a
   button; anything not listed here goes at the end, alphabetically. */
const STAT_ORDER = ["AGI", "CON", "STR", "DEX", "WIS", "INT", "CHA"];
const DAMAGE_ORDER = ["physical", "fire", "cold", "lightning", "aether", "radiant", "entropic", "psychic", "necrotic"];
/** Sort by a fixed list (case-insensitive), unknown values last in A–Z order. */
const byList = (list) => (a, b) => {
  const rank = (v) => { const i = list.indexOf(String(v).toLowerCase()); return i < 0 ? list.length : i; };
  return rank(a) - rank(b) || String(a).localeCompare(String(b));
};
/* Magic overview filters. Each group is a set of picked values: a crystal
   lights up when it has any of the picked values, in any group. */
const MAGIC_FILTERS = [
  { key: "tier", label: "Tier", values: (c) => (c.tier ? [String(c.tier)] : []), sort: (a, b) => a - b },
  { key: "stat", label: "Stats", values: (c) => c.stats ?? [], sort: byList(STAT_ORDER.map((s) => s.toLowerCase())) },
  { key: "damage", label: "Damage", values: (c) => damageTypesOf(c), sort: byList(DAMAGE_ORDER) },
  { key: "tag", label: "Tags", values: (c) => c.keywords ?? [], sort: undefined },
];
export const magicPicks = (key) => (state.magicFilters[key] ??= new Set());
const magicFiltering = () => MAGIC_FILTERS.some((g) => magicPicks(g.key).size);
const crystalMatches = (c) => MAGIC_FILTERS.some((g) => g.values(c).some((v) => magicPicks(g.key).has(v)));
/** True if this value of this crystal is one of the active picks (lights up the matching chip). */
const litFor = (key, v) => magicPicks(key).has(v) ? " lit" : "";

function magicFilterBar() {
  const crystals = shownCrystals();
  const groups = MAGIC_FILTERS.map((g) => {
    const vals = [...new Set(crystals.flatMap(g.values))].sort(g.sort);
    if (!vals.length) return "";
    return `
      <div class="fgroup fgroup-${g.key}" role="group" aria-label="Filter by ${g.label.toLowerCase()}">
        <span class="fgroup-label">${g.label}</span>
        <span class="fopts">${vals.map((v) => `<button type="button" data-mfilter="${g.key}" data-value="${esc(v)}" aria-pressed="${magicPicks(g.key).has(v)}">${esc(v)}</button>`).join("")}</span>
      </div>`;
  }).join("");
  const on = magicFiltering();
  const hits = on ? crystals.filter(crystalMatches).length : 0;
  const picked = MAGIC_FILTERS.reduce((n, g) => n + magicPicks(g.key).size, 0);
  return `
    <div class="filter-bar${state.magicFiltersOpen ? " open" : ""}">
      <button type="button" class="fbar-toggle" aria-expanded="${state.magicFiltersOpen}" data-mfilter-toggle>
        Filters${picked ? ` <span class="fbar-n">${picked}</span>` : ""}
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>
      </button>
      <div class="fgroups">${groups}</div>
      ${on ? `<div class="fbar-end"><span class="filter-count">${hits} of ${crystals.length}</span><button type="button" class="fclear" data-mfilter-clear>Clear</button></div>` : ""}
    </div>`;
}

function magicOverview() {
  const on = magicFiltering();
  return `
    ${magicSubtabs(null)}
    <header class="page-head">
      <h1>Crystal Magic</h1>
    </header>
    ${magicFilterBar()}
    <div class="roster${on ? " filtering" : ""}">
      ${shownCrystals().map((c) => {
        const shown = c.spells.filter(spellInScope);
        const dmg = damageTypesOf(c);
        return `
        <a class="facet crystal-card${on && crystalMatches(c) ? " match" : ""}${crystalHidden(c) ? " draft-panel" : ""}" href="#/magic/${c.id}" style="--crystal: ${crystalColor(c)}">
          <div class="roster-top">
            <h2>${gem}${esc(c.name)}${crystalHidden(c) ? hiddenBadge : ""}</h2>
            ${c.tier ? `<span class="chip${litFor("tier", String(c.tier))}">Tier ${c.tier}</span>` : ""}
          </div>
          ${c.stats?.length ? `<div class="crystal-stats"><span class="hp-label">Stats</span>${c.stats.map((st) => `<span class="stat-pill${litFor("stat", st)}">${esc(st)}</span>`).join("")}</div>` : ""}
          <p class="summary">
            ${shown.length} spell${shown.length === 1 ? "" : "s"}${dmg.length ? `, ${dmg.map((d) => `<span class="dmg${litFor("damage", d)}">${esc(d)}</span>`).join(" and ")} damage` : ""}.
            ${c.ascendsInto.length ? `<br>Ascends into ${c.ascendsInto.map(esc).join(", ")}.` : ""}
          </p>
          ${c.keywords.length ? `<div class="chips">${c.keywords.map((k) => `<span class="chip${litFor("tag", k)}">${esc(k)}</span>`).join("")}</div>` : ""}
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
    <div class="crystal-mechanics">
      <h2>Mechanics</h2>
      ${masonry(c.mechanics.map((m) => `
        <article class="facet panel mechanic" id="${anchorId(c.id, "mech-" + m.id)}">
          <h3>${esc(m.name)}</h3>
          <div class="body">${md(m.body)}</div>
        </article>`), 300)}
    </div>` : "";
  // every spell on the page by name, grouped like the page (BA tiers, then drafts)
  const indexGroups = [
    ...tiers.map(([ba, list]) => ({ label: `BA ${ba}`, beyond: ba > CONFIG.maxBA, spells: list, draft: false })),
    ...(state.showDrafts && c.drafts.length ? [{ label: "Drafts", beyond: true, spells: c.drafts, draft: true }] : []),
  ];
  const spellIndex = indexGroups.length ? `
    <nav class="spell-index" aria-label="Jump to a spell">
      <h2>Spell list</h2>
      ${indexGroups.map((g) => `
        <div class="index-group${g.beyond ? " beyond" : ""}">
          <span class="index-label">${g.label}</span>
          <div class="index-names">
            ${g.spells.map((s) => `<button type="button" data-spell-jump="${anchorId(c.id, (g.draft ? "draft-" : "") + s.id)}">${esc(s.name)}</button>`).join("")}
          </div>
        </div>`).join("")}
    </nav>` : "";
  const top = mechanics || spellIndex ? `
    <section class="block crystal-top${mechanics ? "" : " index-only"}">${mechanics}${spellIndex}</section>` : "";
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
          <h1>${gem}${esc(c.name)}${crystalHidden(c) ? hiddenBadge : ""}</h1>
          <div class="chips">
            ${c.tier ? filterLink("tier", String(c.tier), `Tier ${c.tier}`, "chip", `Show all Tier ${c.tier} crystals`) : ""}
            ${damageTypesOf(c).map((t) => filterLink("damage", t, `${t} damage`, "chip", `Show crystals that deal ${t} damage`)).join("")}
            ${c.keywords.map((k) => filterLink("tag", k, k, "chip", `Show crystals with ${k}`)).join("")}
          </div>
        </div>
        <div class="crystal-facts">
          ${c.stats?.length ? `
            <div class="hp-block">
              <span class="hp-label">Stats</span>
              <span class="crystal-stats big">${c.stats.map((st) => filterLink("stat", st, st, "stat-pill", `Show crystals that use ${st}`)).join("")}</span>
            </div>` : ""}
          ${c.ascendsInto.length ? `
            <div class="hp-block">
              <span class="hp-label">Ascends into</span>
              <span class="ascends">${c.ascendsInto.map(esc).join(", ")}</span>
            </div>` : ""}
        </div>
      </header>
      ${top}
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

export function magicPage(sub) {
  if (!state.magic) return { html: wipPage({ label: "Magic", wip: "Magic data hasn't been generated yet" }) };
  if (!sub) return { html: magicOverview() };
  const c = shownCrystals().find((x) => x.id === sub);
  if (!c && state.magic.crystals.some((x) => x.id === sub)) return { html: magicOverview() };   // hidden, with drafts off
  if (!c) return { html: `${magicSubtabs(null)}<div class="error"><h1>Crystal not found</h1><p>There's no crystal called “${esc(sub)}”. Pick one from the list above.</p></div>` };
  return { html: crystalPage(c), title: c.name };
}
