/**
 * Arkadia — site settings.
 *
 * This one file is read by the website (js/app.js) and by every converter in tools/.
 * After changing it: refresh the browser. If you changed `vault`, `classes` or `crystals`,
 * also run updateFromDocs.bat so the data is regenerated.
 */
export default {
  // Where your Obsidian vault lives. Converters read their notes from here.
  vault: "A:/Obsidian/Arkadia",

  // What playtesters see by default. Everything beyond this appears when
  // "Show drafts & hidden content" is switched on in the sidebar.
  playtest: {
    maxClassLevel: 3,                 // class features/abilities above this level are hidden
    maxSpellBA: 15,                   // spells above this Base Acuity tier are hidden
    hideSpellsEndingWith: ["Talent"], // e.g. "Firemaker's Talent"
  },

  // Class notes: which ones are converted.
  classes: {
    folder: "Classes",          // inside the vault
    requiredTag: "combat_class",
    excludedTags: ["wip"],
  },

  // Crystals to convert (in display order), each with its accent colour on the site.
  // The note must be at <vault>/Magic/<name>.md
  crystals: [
    { name: "Fire", color: "#ff9a5c" },
    { name: "Ice", color: "#9ed6ff" },
    { name: "Lightning", color: "#f2d85c" },
    { name: "Water", color: "#245fb1" },
    { name: "Void", color: "#6630a0" },
  ],

  // Other notes, relative to the vault.
  notes: {
    magicFolder: "Magic",
    races: "Races.md",
    equipment: "Weapons & Armour.md",
    info: "Basic Info.md",
  },
};
