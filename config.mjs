/**
 * Arkadia — site settings.
 *
 * This one file is read by the website (js/core.js) and by every converter in tools/.
 * After changing it: refresh the browser. If you changed `classes` or `crystals`,
 * also run updateFromDocs.bat so the data is regenerated.
 *
 * Private settings (like where your vault is) live in config.local.mjs, which is not
 * committed to git. Copy config.local.example.mjs to config.local.mjs to create it.
 * Only the converters read it: the website never loads it, so anything you put there
 * stays off GitHub Pages. Its settings are added to (and can override) the ones below.
 */
const local = typeof window === "undefined"
  ? (await import("./config.local.mjs").catch((err) => {
      if (err.code !== "ERR_MODULE_NOT_FOUND") throw err; // a typo inside the file should still be reported
      throw new Error("config.local.mjs is missing. Copy config.local.example.mjs to config.local.mjs and set your vault path in it.");
    })).default
  : {};

export default {
  // What playtesters see by default. Everything beyond this appears when
  // "Show drafts & hidden content" is switched on in the sidebar.
  playtest: {
    maxClassLevel: 3,                 // class features/abilities above this level are hidden
    maxSpellBA: 15,                   // spells above this Base Acuity tier are hidden
    hideSpellsEndingWith: ["Talent"], // e.g. "Firemaker's Talent"
    hiddenClasses: [],                // whole classes to hide, by name, e.g. ["Lurker"]
    hiddenCrystals: ["Mind", "Wind"], // whole crystals to hide, by name
  },

  // Class notes: which ones are converted.
  classes: {
    folder: "Classes",          // inside the vault
    requiredTag: "combat_class",
    excludedTags: ["wip"],
  },

  // Crystals to convert (in display order), each with its accent colour on the site.
  // The note must be at <vault>/Magic/<name>.md
  //   color       used on the dark themes
  //   lightColor  used on the light themes (Parchment, Glacier). Optional: pale colours need one
  //               to stay readable on paper; leave it out and `color` is used on every theme.
  crystals: [
    { name: "Fire", color: "#ff9a5c"},
    { name: "Ice", color: "#9ed6ff", lightColor: "#85b6dd" },
    { name: "Wind", color: "#4db344", lightColor: "#40a137" },
    { name: "Light", color: "#e2ebb3", lightColor: "#6e7a22" },
    { name: "Mind", color: "#dcbae9", lightColor: "#bf85d6" },
    { name: "Lightning", color: "#f2d85c", lightColor: "#d1b745" },
    { name: "Water", color: "#245fb1" },
    { name: "Void", color: "#633a8f" },
  ],

  // Other notes, relative to the vault.
  notes: {
    magicFolder: "Magic",
    races: "Races.md",
    equipment: "Equipment.md",
    info: "Basic Info.md",
    conditions: "Conditions.md",
  },

  ...local,
};
