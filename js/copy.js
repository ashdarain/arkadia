/* Copy to clipboard: the cut-off card corner. */

import { main } from "./core.js";

// Cards that get a copy button (search results deliberately left out).
const COPYABLE = [
  ".info-panel", ".info-sub",                                   // info
  ".race",                                                      // races
  ".feature", ".ability", ".mechanic", ".entry", ".option",      // classes (and crystal conditions)
  ".spell",                                                     // magic
  ".equip",                                                     // equipment
  ".condition",                                                 // conditions
].join(", ");

/** The card's cut-off corner becomes the copy button: it fills in on hover and copies on click. */
export function addCopyButtons() {
  for (const card of main.querySelectorAll(COPYABLE)) {
    if (card.querySelector(":scope > .copy-btn")) continue;
    card.classList.add("copyable");
    card.insertAdjacentHTML("afterbegin", `<button type="button" class="copy-btn" aria-label="Copy to clipboard"></button><span class="copy-tip" aria-hidden="true">Copy to clipboard</span>`);
  }
}

// Rows whose parts read best on one line, and what joins them.
const JOINED = [
  [".meta, .chips, .attrs, .equip-sub, .ac-pair, .entry-head, .equip-title", " · "],
  [".equip-row, .upgrade", ": "],
  [".trait", " - "],
];
const BLOCK = /^(DIV|P|H[1-6]|ARTICLE|SECTION|UL|OL|TABLE|DL|DT|DD|HEADER|NAV)$/;

/** Card → plain text: one line per heading/paragraph/bullet, no formatting. */
export function plainText(el) {
  const out = [];
  const words = (n) => [...n.childNodes].map((x) => x.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, " ")); return; }
    if (n.nodeType !== 1 || n.matches(".copy-btn, .copy-tip, .attr-def, [hidden], svg, .level-divider")) return;
    for (const [sel, sep] of JOINED) {
      if (n.matches(sel)) {
        const parts = [...n.children].map((c) => (c.matches(".equip-rows, ul, .body, .up-text, .trait-text") ? plainText(c).replace(/\n+/g, " ") : words(c))).filter(Boolean);
        out.push(`\n${parts.join(sep)}\n`);
        return;
      }
    }
    if (n.matches(".unique-tag")) { out.push(`(${n.textContent.trim()}) `); return; }
    if (n.tagName === "BR") { out.push("\n"); return; }
    if (n.tagName === "TR") { out.push(`\n${[...n.children].map((c) => c.textContent.trim()).join(" | ")}\n`); return; }
    if (n.tagName === "LI") out.push("\n- ");
    const block = BLOCK.test(n.tagName);
    if (block) out.push("\n");
    n.childNodes.forEach(walk);
    if (block) out.push("\n");
  };
  walk(el);
  return out.join("").replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").replace(/^- \n/gm, "- ").trim();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API needs https/localhost; fall back for plain-http LAN hosting
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
}
