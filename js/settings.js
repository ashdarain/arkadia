/* Settings page: hidden content and the colour theme. Both are saved in this browser only. */

import { CONFIG, state, writePref } from "./core.js";

/* Colour themes. The colours themselves live in css/themes.css, one block per id.
   To add a theme: add a block there, then a line here. The first one is the default. */
export const THEMES = [
  { id: "amethyst", name: "Amethyst", blurb: "Slate and amethyst. The original look." },
  { id: "obsidian", name: "Obsidian", blurb: "Near-black with silver highlights. The highest contrast, easy on the eyes in the dark." },
  { id: "verdigris", name: "Verdigris", blurb: "Deep teal with patina green, and costs in brass." },
  { id: "astral", name: "Astral", blurb: "A deep night sky lit in starlight gold." },
  { id: "parchment", name: "Parchment", blurb: "Paper and ink, for daylight and bright tables." },
  { id: "glacier", name: "Glacier", blurb: "Cool blue-white and slate ink, crisp as packed snow." },
];

const THEME_KEY = "arkadia.theme"; // index.html reads this too, to apply the theme before the page draws

export const currentTheme = () => {
  const id = document.documentElement.dataset.theme;
  return THEMES.some((t) => t.id === id) ? id : THEMES[0].id;
};

function setTheme(id) {
  if (id === THEMES[0].id) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  writePref(THEME_KEY, id);
}

/** A tiny sketch of the site drawn in the theme's own colours (data-theme on the card scopes them). */
const themePreview = `
  <span class="theme-preview" aria-hidden="true">
    <span class="tp-side"><i></i><i class="on"></i><i></i><i></i></span>
    <span class="tp-main">
      <span class="tp-card"><b></b><s></s><s></s><s class="short"></s><em></em></span>
      <span class="tp-card draft"><b></b><s></s><s class="short"></s></span>
    </span>
  </span>`;

export function settingsPage() {
  const theme = currentTheme();
  return `
    <header class="page-head">
      <h1>Settings</h1>
      <p class="lede">Saved in this browser, on this device.</p>
    </header>

    <section class="block settings-block">
      <h2>Content</h2>
      <label class="switch-row">
        <input type="checkbox" id="setting-drafts" ${state.showDrafts ? "checked" : ""}>
        <span class="toggle-track" aria-hidden="true"></span>
        <span class="switch-text">
          <span class="switch-name">Show drafts &amp; hidden content</span>
          <small>Class levels ${CONFIG.maxLevel + 1}+, spells at BA ${CONFIG.maxBA + 15}+, Talents, unfinished drafts and designer notes. Anything hidden from playtesters is marked in amber when shown.</small>
        </span>
      </label>
    </section>

    <section class="block settings-block">
      <h2>Theme</h2>
      <div class="theme-grid" role="radiogroup" aria-label="Colour theme">
        ${THEMES.map((t) => `
          <label class="theme-card" data-theme="${t.id}">
            <input type="radio" name="theme" value="${t.id}" ${t.id === theme ? "checked" : ""}>
            ${themePreview}
            <span class="theme-name">${t.name}</span>
            <span class="theme-blurb">${t.blurb}</span>
          </label>`).join("")}
      </div>
      <!-- <p class="settings-note">Crystal, buff and debuff colours stay the same in every theme.</p>-->
    </section>`;
}

/** Handle a change on the settings page. Returns true if it was one of ours. */
export function settingsChanged(target) {
  if (target.id === "setting-drafts") {
    state.showDrafts = target.checked;
    writePref("arkadia.showDrafts", state.showDrafts ? "1" : "0");
    return true;
  }
  if (target.name === "theme") {
    setTheme(target.value);
    return true;
  }
  return false;
}
