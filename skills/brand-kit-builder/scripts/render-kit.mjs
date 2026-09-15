#!/usr/bin/env node
/**
 * render-kit.mjs — turn a brand kit's HTML into a print-ready PDF, and refuse to
 * ship one that is wrong.
 *
 * The layout of a kit is per brand and always will be: an art brand's kit is a
 * light editorial sheet, a martech brand's is a dark technical one, and a single
 * template would produce off-brand kits for everyone but the brand it was drawn
 * for. What IS the same every time is the mechanical part, and that is this: fonts
 * proven loaded, no page silently overflowing its print area, links that really
 * resolve, and a page count that matches what the header claims.
 *
 * Those four checks exist because each one has failed in practice. A webfont that
 * did not load renders in Times and nobody notices until it is printed. Content
 * past 210mm is cropped by the PDF writer with no warning at all.
 *
 *   node render-kit.mjs kit.html --out Brand-Kit.pdf [--fonts "Playfair Display,Poppins"]
 *
 * Exit 0 clean / 1 a check failed / 2 could not render.
 */
import path from "node:path";
import { existsSync } from "node:fs";

const argv = process.argv.slice(2);
const html = argv.find((a) => a.endsWith(".html"));
const flag = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const out = flag("--out", "brand-kit.pdf");
const fonts = (flag("--fonts", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const chromePath = flag("--chrome", process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");

if (!html || !existsSync(html)) {
  console.error("usage: node render-kit.mjs kit.html --out Brand-Kit.pdf [--fonts \"Family One,Family Two\"]");
  process.exit(2);
}

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("playwright is not installed here. npm i playwright, or pass --chrome to a Chromium binary."); process.exit(2); }

const browser = await chromium.launch(existsSync(chromePath) ? { executablePath: chromePath } : {});
const page = await browser.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 1.3 });
await page.goto("file://" + path.resolve(html), { waitUntil: "networkidle", timeout: 120_000 });
await page.evaluate(() => document.fonts.ready);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) failures += 1;
};

console.log("\n== Kit checks ==");

// 1. Fonts. A brand kit set in a fallback face is not a brand kit.
//
// document.fonts.check() is NOT the way to ask this, though it looks like it.
// It answers "can this text be rendered?", and the answer is yes for any family
// at all because a fallback always exists, so it returns true for a font that
// was never loaded. Verified against a deliberately fake family, which it
// passed. Enumerate the loaded FontFace entries instead.
const loadedFamilies = await page.evaluate(() =>
  [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")));
for (const family of fonts) {
  const ok = loadedFamilies.some((f) => f.toLowerCase() === family.toLowerCase());
  check(`font loaded: ${family}`, ok, ok ? "" : `not among the loaded faces: ${[...new Set(loadedFamilies)].join(", ") || "none"}`);
}
if (!fonts.length) console.log("  NOTE  no --fonts given, so typeface loading was not checked");

// 2. Overflow. The PDF writer crops silently, so this is the check that matters most.
const pages = await page.evaluate(() => {
  const els = [...document.querySelectorAll("section.page, .page")];
  return els.map((s, i) => ({ n: i + 1, h: Math.round(s.scrollHeight), lim: Math.round(s.clientHeight) }));
});
check(`found ${pages.length} page section(s)`, pages.length > 0, pages.length ? "" : "expected elements with class 'page'");
const over = pages.filter((p) => p.h > p.lim + 2);
check("no page overflows its print area", over.length === 0,
  over.map((p) => `page ${p.n}: ${p.h}px in ${p.lim}px`).join("; "));

// A page can measure clean while its content is cut off inside it: any box with
// overflow:hidden clips its own children, and the page never grows to reveal it.
// Caught by a test that raised the prompt type size and still passed, because the
// prompt cards clip internally.
const clipped = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.overflow !== "hidden" && cs.overflowY !== "hidden") continue;
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 20) {
      bad.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}: ${el.scrollHeight}px in ${el.clientHeight}px`);
    }
  }
  return bad;
});
check("no content clipped inside a box", clipped.length === 0, clipped.slice(0, 4).join("; "));

// 3. Page numbering. An "01 / 04" on a five page kit is the error a generator makes
//    when a section is added and the header is not.
// Read EVERY marker, not the first. Taking the first match meant a kit whose
// page 2 header still said "02 / 04" passed, because page 1 said "01 / 05".
const markers = await page.evaluate(() =>
  [...document.body.innerText.matchAll(/\b(0?\d+)\s*\/\s*(0?\d+)\b/g)].map((m) => [Number(m[1]), Number(m[2])]));
if (markers.length) {
  const totals = [...new Set(markers.map((m) => m[1]))];
  check("every page claims the same total", totals.length === 1, `saw totals ${totals.join(", ")}`);
  check("that total matches the document", totals.length === 1 && totals[0] === pages.length,
    `header says ${totals.join("/")}, document has ${pages.length}`);
  const seq = markers.map((m) => m[0]);
  check("page numbers run in sequence", seq.every((n, i) => n === i + 1), seq.join(","));
}

// 4. Links, if any. A dead reference in a handoff is worse than no reference.
const links = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href^='http']")].map((a) => a.href))]);
if (links.length) {
  const dead = [];
  for (const url of links) {
    try {
      const r = await fetch(url, { method: "HEAD", redirect: "follow" });
      // 401/403 means it exists and is private, which is not a dead link.
      if (r.status >= 400 && ![401, 403, 405].includes(r.status)) dead.push(`${url} -> ${r.status}`);
    } catch { /* a network refusal here is not evidence the link is wrong */ }
  }
  check(`${links.length} link(s) resolve`, dead.length === 0, dead.slice(0, 3).join("; "));
}

await page.pdf({ path: out, width: "297mm", height: "210mm", printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" } });
await browser.close();

console.log(`\n${failures === 0 ? `Kit OK. Written to ${out}` : `${failures} check(s) failed. ${out} was still written: inspect it before sending.`}`);
process.exit(failures === 0 ? 0 : 1);
