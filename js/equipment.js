/* Equipment page. */

import { esc, masonry, md, mdInline, slugCss, state, wipPage } from "./core.js";

function attrChip(a) {
  const def = state.equipment.attributes.find((d) => d.name.toLowerCase() === a.name.toLowerCase());
  const label = a.value ? `${a.name} ${a.value}` : a.name;
  if (!def) return `<span class="attr">${esc(label)}</span>`;
  const text = `${def.name}${def.param ? ` - ${def.param}` : ""}: ${def.text}`;
  return `<button type="button" class="attr has-def" title="${esc(text)}" data-def="${esc(text)}" aria-expanded="false">${esc(label)}</button>`;
}

function equipRow(label, value) {
  return value ? `<div class="equip-row"><span class="equip-lbl">${label}</span><span>${mdInline(value)}</span></div>` : "";
}

function equipCard(item) {
  const sub = [
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
      <div class="equip-title">
        <h3>${esc(item.name)}</h3>
        ${item.type ? `<span class="equip-type">${esc(item.type)}</span>` : ""}
      </div>
      ${item.attributes?.length ? `<div class="attrs">${item.attributes.map(attrChip).join("")}</div>` : ""}
      ${sub ? `<div class="equip-sub">${sub}</div>` : ""}
      ${ac}
      ${attacks ? `<div class="equip-rows">${attacks}</div>` : ""}
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

export function equipmentPage() {
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
      <details class="facet glossary"${state.glossaryOpen ?? window.innerWidth > 760 ? " open" : ""}>
        <summary><h2>Equipment attributes</h2></summary>
        <dl>${d.attributes.map((a) => `<div><dt>${esc(a.name)}${a.param ? ` <span>${esc(a.param)}</span>` : ""}</dt><dd>${mdInline(a.text)}</dd></div>`).join("")}</dl>
      </details>` : ""}
    ${filter}
    ${content}`;
}
