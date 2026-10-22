/* Conditions page, and links from embedded conditions elsewhere. */

import {
  classHidden, classHref, crystalHidden, crystalHref, esc, escapeRe, inScope, main, masonry,
  md, plain, spellInScope, state, wipPage,
} from "./core.js";
import { allAbilities, classIcon } from "./classes.js";
import { crystalColor, gem } from "./magic.js";

/** "Weak Debuff" → the tag on a condition card; colour says buff/debuff, fill says strong. */
const conditionTag = (c) =>
  `<span class="cond-tag ${esc(c.kind)}${c.strength === "strong" ? " strong" : ""}">${esc(c.label)}</span>`;
const conditionByName = (name) =>
  state.conditions?.conditions.find((c) => c.name.toLowerCase() === String(name).trim().toLowerCase());

/**
 * Where a condition comes from ("Ice", "Sentinel" in the # Connections table) → a link that lands
 * on the spot that uses it, the way search results do: the crystal's mechanic or the first spell /
 * class feature that mentions it, else just that crystal or class page.
 */
function conditionSource(name, condition) {
  const mentions = (text) => new RegExp(`\\b${escapeRe(condition.name)}`, "i").test(plain(text));
  const key = String(name).trim().toLowerCase();
  const crystal = state.magic?.crystals.find((c) => c.name.toLowerCase() === key);
  if (crystal) {
    const at = (anchor) => crystalHref(crystal.id, anchor);
    const mech = crystal.mechanics.find((m) => m.name.toLowerCase() === condition.name.toLowerCase());
    const spell = !mech && crystal.spells.filter(spellInScope).find((sp) => mentions(sp.body));
    return { name: crystal.name, color: crystalColor(crystal), icon: gem, hidden: !state.showDrafts && crystalHidden(crystal),
      href: at(mech ? "mech-" + mech.id : spell?.id) };
  }
  const cls = state.classes.find((c) => c.name.toLowerCase() === key);
  if (cls) {
    const hit = [...cls.features, ...allAbilities(cls)].filter((f) => inScope(f.level)).find((f) => mentions(f.body));
    return { name: cls.name, color: null, icon: classIcon(cls), hidden: !state.showDrafts && classHidden(cls), href: classHref(cls.id, hit?.id) };
  }
  return { name, color: null, icon: "", href: null };   // not on the site (yet)
}

/** Top bar of a condition card: one stripe per crystal it comes from (classes have no colour).
    Also colours the card's copy corner to match the bar's right end. */
function sourceBar(sources) {
  const colors = sources.map((s) => s.color).filter(Boolean);
  if (!colors.length) return "";
  const w = 100 / colors.length;
  const stops = colors.map((c, i) => `${c} ${(i * w).toFixed(2)}% ${((i + 1) * w).toFixed(2)}%`).join(", ");
  // the copy corner sits at the right end of the bar, so it takes the last colour
  return ` style="--bar: linear-gradient(90deg, ${stops}); --copy: ${colors.at(-1)}"`;
}

export function conditionsPage() {
  const d = state.conditions;
  if (!d) return wipPage({ label: "Conditions", wip: "Conditions haven't been generated yet. Run updateFromDocs.bat in the Website folder." });
  const cards = d.conditions.map((c) => {
    const sources = (c.sources ?? []).map((name) => conditionSource(name, c)).filter((s) => !s.hidden);
    return `
    <article class="facet condition ${esc(c.kind)}" id="condition--${c.id}"${sourceBar(sources)}>
      <div class="condition-head">
        <h2>${esc(c.name)}</h2>
        ${conditionTag(c)}
      </div>
      ${c.body ? `<div class="body">${md(c.body)}</div>` : '<p class="empty">No description yet.</p>'}
      ${sources.length ? `
        <nav class="cond-sources" aria-label="Where ${esc(c.name)} comes from">
          ${sources.map((s) => s.href
            ? `<a class="source-link" href="${s.href}"${s.color ? ` style="--src: ${s.color}"` : ""}>${s.icon}${esc(s.name)}</a>`
            : `<span class="source-link missing">${esc(s.name)}</span>`).join("")}
        </nav>` : ""}
    </article>`;
  });
  return `
    <header class="page-head"><h1>Conditions</h1></header>
    ${cards.length ? masonry(cards, 260, 4) : '<p class="empty">No conditions yet.</p>'}`;
}

/** Embedded sections named after a condition (e.g. "Taunt" in a class feature) link to it. */
export function linkConditionEmbeds() {
  if (!state.conditions) return;
  for (const h of main.querySelectorAll(".embed > h4")) {
    const c = conditionByName(h.textContent);
    if (!c || h.querySelector("a")) continue;
    h.innerHTML = `<a href="#/conditions/${c.id}">${esc(c.name)}</a>${conditionTag(c)}`;
  }
}
