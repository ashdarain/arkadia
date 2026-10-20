/* Search page and its index. */

import { classHref, crystalHref, esc, escapeRe, groupBy, icon, inScope, plain, spellByDefault, state } from "./core.js";
import { allAbilities } from "./classes.js";

let searchIndex = null;

function buildSearchIndex() {
  const items = [];
  for (const c of state.classes) {
    const group = { key: c.id, name: c.name, href: classHref(c.id) };
    const at = (anchor) => classHref(c.id, anchor);
    for (const m of c.mechanics) {
      items.push({ group, kind: "Mechanic", title: m.name, text: plain(m.body), href: at("mech-" + m.id) });
    }
    for (const f of c.features) {
      items.push({ group, kind: `Level ${f.level} Feature`, title: f.name, text: plain(f.body), href: at(f.id), level: f.level });
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
      items.push({ group, kind: "Draft", title: d.name || "Unnamed Feature", text: plain(d.body), href: at("draft-" + d.id), draft: true });
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
      const group = { key: "magic-" + c.id, name: `${c.name} magic`, href: crystalHref(c.id) };
      const at = (anchor) => crystalHref(c.id, anchor);
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
  if (state.conditions) {
    const group = { key: "conditions", name: "Conditions", href: "#/conditions" };
    for (const c of state.conditions.conditions) {
      items.push({ group, kind: c.label, title: c.name, text: plain(c.body), href: `#/conditions/${c.id}` });
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

export function searchResults(query) {
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

export function searchPage() {
  return `
    <header class="page-head">
      <h1>Search</h1>
    </header>
    <div class="search-box">
      ${icon("search")}
      <input id="q" type="search" placeholder="Search rules, races, classes, spells, equipment and conditions" value="${esc(state.query)}" autocomplete="off" aria-label="Search">
    </div>
    <p class="search-scope">Searching basic info, races, combat classes, magic, equipment and conditions.</p>
    <div class="results" id="results">${searchResults(state.query)}</div>`;
}
