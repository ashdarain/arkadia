#!/usr/bin/env node
/**
 * Arkadia — regenerate all site data from the Obsidian vault.
 *   node tools/convert-all.mjs
 */
await import("./convert-classes.mjs");
console.log("");
await import("./convert-races.mjs");
console.log("");
await import("./convert-magic.mjs");
console.log("");
await import("./convert-equipment.mjs");
console.log("");
await import("./convert-info.mjs");
