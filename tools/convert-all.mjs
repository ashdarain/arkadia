#!/usr/bin/env node
/**
 * Arkadia — regenerate all site data from the Obsidian vault.
 *   node tools/convert-all.mjs
 * Also writes patch notes to log/ describing what changed (see changelog.mjs).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot, writeChangelog } from "./changelog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const before = snapshot(DATA);

await import("./convert-classes.mjs");
console.log("");
await import("./convert-races.mjs");
console.log("");
await import("./convert-magic.mjs");
console.log("");
await import("./convert-equipment.mjs");
console.log("");
await import("./convert-info.mjs");

const log = writeChangelog(before, snapshot(DATA), path.join(ROOT, "log"));
console.log(log ? `\nPatch notes written to ${path.relative(ROOT, log)}` : "\nNo data changes since the last update.");
