/* Basic Info page. */

import { esc, masonry, md, state, wipPage } from "./core.js";

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

export function infoPage() {
  const d = state.info;
  if (!d) return wipPage({ label: "Info", wip: "Info hasn't been generated yet. Run updateFromDocs.bat in the Website folder." });
  // important panels first (two columns wide), then the rest fill whatever column is shortest
  const panels = [...d.panels.filter((p) => p.important), ...d.panels.filter((p) => !p.important)];
  return `
    <header class="page-head"><h1>Basic Info</h1></header>
    ${masonry(panels.map(infoPanel), 260, 4, "span-masonry info-grid")}`;
}
