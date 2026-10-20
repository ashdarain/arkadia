/* Races page. */

import { designerNotes, esc, mdInline, plain, state, wipPage } from "./core.js";

function traitItem(t) {
  return `
    <li class="trait${t.unique ? " is-unique" : ""}">
      <span class="trait-cost" title="${t.cost} trait point${t.cost === 1 ? "" : "s"}">${t.cost}</span>
      <div class="trait-text">
        ${t.unique ? `<span class="unique-tag">Unique: ${esc(t.unique)}</span>` : ""}${mdInline(t.text)}
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

export function racesPage() {
  const d = state.races;
  if (!d) return wipPage({ label: "Races", wip: "Race data hasn't been generated yet. Run updateFromDocs.bat in the Website folder." });
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
    ${designerNotes(d.designerNotes)}`;
}
