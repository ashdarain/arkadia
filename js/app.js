/* Arkadia reference site: tabs, routing, events and start-up. No build step, no dependencies.
   Each page lives in its own file next to this one; shared pieces are in core.js. */

import {
  anchorId, esc, flash, icon, jumpTo, loadData,
  main, nav, navFoot, packMasonry, state, stickColumns,
} from "./core.js";
import { classesPage } from "./classes.js";
import { racesPage } from "./races.js";
import { magicPage, magicPicks } from "./magic.js";
import { equipmentPage } from "./equipment.js";
import { infoPage } from "./info.js";
import { conditionsPage, linkConditionEmbeds } from "./conditions.js";
import { addCopyButtons, copyText, plainText } from "./copy.js";
import { searchPage, searchResults } from "./search.js";
import { settingsChanged, settingsPage } from "./settings.js";

/* ---------------- Tabs ---------------- */

const TABS = [
  { id: "info", label: "Info" },
  { id: "classes", label: "Classes" },
  { id: "magic", label: "Magic" },
  { id: "races", label: "Races" },
  { id: "equipment", label: "Equipment" },
  { id: "conditions", label: "Conditions" },
  { id: "search", label: "Search" },
  { id: "settings", label: "Settings", foot: true },   // foot: sits at the bottom of the sidebar
];

function renderNav(active) {
  // Clicking the tab you're on goes to its front page; other tabs return to where you left them.
  const link = (t) => {
    // while hidden content is shown, Settings carries a small amber dot as a reminder
    const dot = t.id === "settings" && state.showDrafts;
    return `
    <a href="${t.id !== active && state.lastPage[t.id] || `#/${t.id}`}" ${t.id === active ? 'aria-current="page"' : ""}${dot ? ' title="Hidden content is shown"' : ""}>
      ${icon(t.id)}<span>${t.label}</span>${dot ? '<span class="nav-dot"><span class="sr-only"> (hidden content shown)</span></span>' : ""}
    </a>`;
  };
  nav.innerHTML = TABS.filter((t) => !t.foot).map(link).join("");
  navFoot.innerHTML = TABS.filter((t) => t.foot).map(link).join("");
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
  if (tab === "search") html = searchPage();
  else if (tab === "races") html = racesPage();
  else if (tab === "info") html = infoPage();
  else if (tab === "conditions") html = conditionsPage();
  else if (tab === "settings") html = settingsPage();
  else if (tab === "magic") { const r = magicPage(sub); html = r.html; title = r.title ?? title; }
  else if (tab === "equipment") {
    if (sub) state.equipFilter = null; // a link to one item opens the full view so it's visible
    html = equipmentPage();
  }
  else if (tab === "classes") { const r = classesPage(sub, anchor); html = r.html; title = r.title ?? title; }

  const view = `${tab}/${sub ?? ""}`;
  main.innerHTML = html;
  document.title = `${title} · Arkadia`;
  linkConditionEmbeds();
  addCopyButtons();
  packMasonry();
  stickColumns();
  fitRosters();
  markCurrentTier();

  const targetId = tab === "races" && sub ? `race--${sub}`
    : tab === "equipment" && sub ? `equip--${sub}`
    : tab === "info" && sub ? `info--${sub}`
    : tab === "conditions" && sub ? `condition--${sub}`
    : anchor ? anchorId(sub, anchor) : null;
  const target = targetId && document.getElementById(targetId);
  if (target) {
    jumpTo(target);
    flash(target);
  } else if (view !== lastView) {
    window.scrollTo(0, scrollMemory.get(view) ?? 0);
    // Keep the active sub tab visible on narrow screens
    main.querySelector('.subtabs [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }
  lastView = view;

  // Web fonts change card heights slightly, so lay out again once they're in, and if we jumped
  // to a card (and the reader hasn't scrolled since), line it up again.
  const jumpedAt = window.scrollY;
  document.fonts?.ready.then(() => {
    packMasonry();
    stickColumns();
    fitRosters();
    if (target?.isConnected && window.scrollY === jumpedAt) jumpTo(target);
  });

  if (tab === "search") {
    const q = document.getElementById("q");
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  }
}

/* ---------------- Events ---------------- */

// "Skip to content" moves keyboard focus past the sidebar without changing the page
document.querySelector(".skip")?.addEventListener("click", (e) => { e.preventDefault(); main.focus(); });

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
  const attr = e.target.closest(".attr.has-def");
  if (attr) {
    const row = attr.parentElement;
    const open = row.nextElementSibling?.classList.contains("attr-def") ? row.nextElementSibling : null;
    const same = open && open.dataset.for === attr.textContent;
    open?.remove();
    row.querySelectorAll(".attr").forEach((a) => a.setAttribute("aria-expanded", "false"));
    if (!same) {
      row.insertAdjacentHTML("afterend", `<p class="attr-def" data-for="${esc(attr.textContent)}">${esc(attr.dataset.def)}</p>`);
      attr.setAttribute("aria-expanded", "true");
    }
    packMasonry();
    return;
  }
  const go = e.target.closest("[data-mfilter-go]");
  if (go) {
    e.preventDefault();
    state.magicFilters = { [go.dataset.mfilterGo]: new Set([go.dataset.value]) };
    scrollMemory.set("magic/", 0);
    location.hash = "#/magic";
    return;
  }
  const spellJump = e.target.closest("[data-spell-jump]");
  if (spellJump) {
    const el = document.getElementById(spellJump.dataset.spellJump);
    if (el) { jumpTo(el, { smooth: true }); flash(el); }
    return;
  }
  const jump = e.target.closest(".ba-jump button");
  if (jump) {
    const el = document.getElementById(jump.dataset.jump);
    if (el) jumpTo(el, { smooth: true });
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
  const mf = e.target.closest("[data-mfilter]");
  if (mf) {
    const picks = magicPicks(mf.dataset.mfilter);
    picks.has(mf.dataset.value) ? picks.delete(mf.dataset.value) : picks.add(mf.dataset.value);
    render();
    return;
  }
  if (e.target.closest("[data-mfilter-toggle]")) {
    state.magicFiltersOpen = !state.magicFiltersOpen;
    render();
    return;
  }
  if (e.target.closest("[data-mfilter-clear]")) {
    state.magicFilters = {};
    render();
    return;
  }
  const btn = e.target.closest(".filter button");
  if (!btn) return;
  const t = btn.dataset.tag;
  if (!t) state.tagFilter.clear();
  else state.tagFilter.has(t) ? state.tagFilter.delete(t) : state.tagFilter.add(t);
  render();
});

// Settings page switches. The page itself doesn't need redrawing (so keyboard focus stays put);
// other pages pick the change up when you open them, and the sidebar dot updates now.
main.addEventListener("change", (e) => {
  if (settingsChanged(e.target)) renderNav(parseRoute().tab);
});

main.addEventListener("toggle", (e) => {
  if (e.target.matches?.("details.glossary")) state.glossaryOpen = e.target.open;
}, true);

// Touch screens: the first tap on a card reveals its copy corner; tapping the corner then copies.
main.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse" || e.target.closest(".copy-btn")) return;
  const card = e.target.closest(".copyable");
  for (const c of main.querySelectorAll(".copyable.touched")) if (c !== card) c.classList.remove("touched");
  card?.classList.add("touched");
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

/** While a filter is on, matches move to the front of the list, but only when the list doesn't
    already fit on screen (a phone, or a zoomed-in desktop). Reordering doesn't change its height. */
function fitRosters() {
  for (const r of main.querySelectorAll(".roster.filtering")) {
    const bottom = r.getBoundingClientRect().bottom + window.scrollY;
    r.classList.toggle("reorder", bottom > window.innerHeight);
  }
}

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

// A highlight plays once. Drop the class when it ends, otherwise re-inserting the card
// (masonry repacks on resize, e.g. a phone's address bar sliding away) would replay it.
main.addEventListener("animationend", (e) => {
  if (e.animationName === "flash") e.target.classList.remove("flash");
});

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { packMasonry(); stickColumns(); fitRosters(); }, 120);
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
          : `<p>${esc(err.message)}. Check that <code>data/classes/</code> exists, and run <code>updateFromDocs.bat</code> in the Website folder to regenerate it.</p>`}
      </div>`;
  }
})();
