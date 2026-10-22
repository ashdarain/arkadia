/* Settings page: hidden content and the colour theme. Both are saved in this browser only. */

import { classHidden, CONFIG, crystalHidden, state, writePref } from "./core.js";

/** " hidden classes and crystals (Mind, Wind)," for the drafts switch, from config.mjs. */
function hiddenList() {
  const names = [...state.classes.filter(classHidden), ...(state.magic?.crystals ?? []).filter(crystalHidden)].map((c) => c.name);
  return names.length ? ` hidden classes and crystals (${names.join(", ")}),` : "";
}

/* Colour themes. The colours themselves live in css/themes.css, one block per id.
   To add a theme: add a block there, then a line here. The first one is the default.
   light: true makes crystals use their lightColor (config.mjs) in that theme. */
export const THEMES = [
  { id: "amethyst", name: "Amethyst", blurb: "Slate and amethyst." },
  { id: "obsidian", name: "Obsidian", blurb: "Near-black with silver highlights." },
  { id: "verdigris", name: "Verdigris", blurb: "Deep teal with patina green, with brass highlights." },
  { id: "astral", name: "Astral", blurb: "A deep night sky lit in starlight gold." },
  { id: "parchment", light: true, name: "Parchment", blurb: "Paper and ink, for daylight and bright tables." },
  { id: "glacier", light: true, name: "Glacier", blurb: "Cool blue-white and slate ink, crisp as packed snow." },
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
    </section>

    <section class="block settings-block">
      <h2>Content</h2>
      <label class="switch-row">
        <input type="checkbox" id="setting-drafts" ${state.showDrafts ? "checked" : ""}>
        <span class="toggle-track" aria-hidden="true"></span>
        <span class="switch-text">
          <span class="switch-name">Show drafts &amp; hidden content</span>
          <small>Class levels ${CONFIG.maxLevel + 1}+, spells at BA ${CONFIG.maxBA + 15}+, Talents,${hiddenList()} unfinished drafts and designer notes. Anything hidden from playtesters is marked in amber when shown.</small>
        </span>
      </label>
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
