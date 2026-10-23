/* Combat classes: the overview roster and each class page. */

import {
  anchorId, beyond, classHidden, classHref, CONFIG, designerNotes, esc, groupBy, hiddenBadge, ICONS,
  inScope, masonry, md, plain, shownClasses, signatureSpells, state,
} from "./core.js";
import { crystalColor, signatureLink, spellCard } from "./magic.js";

function classSubtabs(activeId) {
  return `
    <nav class="subtabs" aria-label="Classes">
      <a href="#/classes" ${!activeId ? 'aria-current="page"' : ""}>Overview</a>
      <span class="sep" aria-hidden="true"></span>
      ${shownClasses().map((c) => `<a href="#/classes/${c.id}"${classHidden(c) ? ' class="hidden-page"' : ""} ${c.id === activeId ? 'aria-current="page"' : ""}>${esc(c.name)}</a>`).join("")}
    </nav>`;
}

// data/class-summaries.json: { "<class-id>": { "summary": "...", "icon": "<svg shapes>" } } (a plain string is also accepted)
const summaryOf = (c) => { const s = state.summaries[c.id]; return (typeof s === "string" ? s : s?.summary) ?? c.description ?? null; };
export const classIcon = (c, cls = "class-icon") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${state.summaries[c.id]?.icon ?? ICONS.classes}</svg>`;
const chipsFor = (c, lit = new Set()) => c.tags.length ? `<div class="chips">${c.tags.map((t) => `<span class="chip${lit.has(t) ? " lit" : ""}">${esc(t)}</span>`).join("")}</div>` : "";

/** "1d8 + 3" — the part that matters at a glance. */
function hpCore(hp) {
  if (!hp) return "";
  if (!hp.dice) return esc(hp.raw);
  return `${esc(hp.dice)}${hp.flat ? ` + ${hp.flat}` : ""}`;
}

function classOverview() {
  const classes = shownClasses();
  const tags = [...new Set(classes.flatMap((c) => c.tags))].sort();
  const f = state.tagFilter, on = f.size > 0;
  const isMatch = (c) => c.tags.some((t) => f.has(t));
  const hits = classes.filter(isMatch).length;
  return `
    ${classSubtabs(null)}
    <header class="page-head">
      <h1>Combat Classes</h1>
    </header>
    <div class="filter" role="group" aria-label="Filter by tag">
      <button type="button" data-tag="" aria-pressed="${!on}">All</button>
      ${tags.map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${f.has(t)}">${esc(t)}</button>`).join("")}
      ${on ? `<span class="filter-count">${hits} of ${classes.length}</span>` : ""}
    </div>
    <div class="roster${on ? " filtering" : ""}">
      ${classes.map((c) => `
        <a class="facet${on && isMatch(c) ? " match" : ""}${classHidden(c) ? " draft-panel" : ""}" href="#/classes/${c.id}">
          <div class="roster-top">
            <h2>${classIcon(c)}${esc(c.name)}${classHidden(c) ? hiddenBadge : ""}</h2>
            ${c.healthPerLevel ? `<span class="roster-hp" title="Health per level">${hpCore(c.healthPerLevel)}</span>` : ""}
          </div>
          ${summaryOf(c) ? `<p class="summary">${esc(summaryOf(c))}</p>` : ""}
          ${chipsFor(c, f)}
        </a>`).join("")}
    </div>`;
}

export const allAbilities = (cls) => (cls.abilityGroups ?? []).flatMap((g) => g.abilities.map((a) => ({ ...a, group: g })));

function levelTable(cls) {
  const abilities = allAbilities(cls).filter((a) => inScope(a.level));
  const levels = [...cls.levels.map((l) => l.level), ...cls.features.map((f) => f.level), ...abilities.map((a) => a.level)];
  const top = Math.max(0, ...levels.filter((n) => n != null));
  const max = state.showDrafts ? top : Math.min(top, CONFIG.maxLevel);
  if (!max) return "";
  const link = (id, name, cls2 = "") => `<a class="${cls2}" href="${classHref(cls.id, id)}">${esc(name || "Unnamed")}</a>`;

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
          <thead><tr><th scope="col">Level</th><th scope="col">CA</th><th scope="col">Features and Abilities</th></tr></thead>
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
  const title = f.name ? `<h3>${esc(f.name)}</h3>` : `<h3 class="untitled">Unnamed Feature</h3>`;
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

  return `
    ${levelTable(cls)}
    <section class="block">
      <h2>Features</h2>
      <div class="levels">${levelRows || '<p class="empty">No finished features yet.</p>'}</div>
    </section>
    ${drafts}
    ${designerNotes(cls.designerNotes)}`;
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

  return mechanics + groups + sections + signatureSection(cls);
}

/** Right column: this class's signature spells as a list of names (one colour per crystal); a name opens the spell. */
function signatureSection(cls) {
  const sigs = signatureSpells().filter((x) => x.cls === cls);
  if (!sigs.length) return "";
  const idOf = (x) => anchorId(cls.id, `sig-${x.crystal.id}-${x.spell.id}`);
  return `
    <section class="block signature-block">
      <h2>Signature Spells - ${esc(cls.name)}${classHidden(cls) ? hiddenBadge : ""}</h2>
      <p class="lede">Usable once you've unlocked the Signature Spell feature for this class.</p>
      <div class="index-names sig-names">
        ${sigs.map((x) => `<button type="button" class="${x.spell.draftReason ? "draft" : ""}" style="--crystal: ${crystalColor(x.crystal)}" data-sig-toggle="${idOf(x)}" aria-controls="${idOf(x)}" aria-expanded="${state.sigOpen.has(idOf(x))}">${esc(x.spell.name)}</button>`).join("")}
      </div>
      ${masonry(sigs.map((x) => spellCard(x.crystal, x.spell, { label: signatureLink(x, true), id: idOf(x) })
        .replace("<article ", `<article style="--crystal: ${crystalColor(x.crystal)}"${state.sigOpen.has(idOf(x)) ? "" : " hidden"} `)), 230, 2, "sig-cards")}
    </section>`;
}

function classPage(cls) {
  const right = systemColumn(cls);
  const hp = cls.healthPerLevel;
  return `
    <div class="class-watermark">${classIcon(cls, "")}</div>
    ${classSubtabs(cls.id)}
    <header class="class-head">
      <div>
        <h1>${esc(cls.name)}${classHidden(cls) ? hiddenBadge : ""}</h1>
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

/** #/classes, #/classes/<id> and #/classes/<id>/<anchor>. */
export function classesPage(sub, anchor) {
  if (!sub) return { html: classOverview() };
  const cls = shownClasses().find((c) => c.id === sub);
  if (!cls && state.byId.has(sub)) return { html: classOverview() };   // a hidden class, with drafts off
  if (!cls) return { html: `${classSubtabs(null)}<div class="error"><h1>Class not found</h1><p>There's no class called “${esc(sub)}”. Pick one from the list above.</p></div>` };
  if (anchor?.startsWith("sig-")) state.sigOpen.add(anchorId(cls.id, anchor));   // a link to a signature spell opens it
  if (anchor) {
    // a link into a tabbed section (e.g. one Samurai stance) opens that tab
    for (const s of cls.sections) {
      const hit = s.entries.find((e) => anchor === e.id || anchor.startsWith(e.id + "--"));
      if (hit) state.sectionTab[`${cls.id}/${s.id}`] = hit.id;
    }
  }
  return { html: classPage(cls), title: cls.name };
}
