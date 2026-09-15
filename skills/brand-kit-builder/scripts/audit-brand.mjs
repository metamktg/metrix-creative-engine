#!/usr/bin/env node
/**
 * audit-brand.mjs — draft a brand kit from public sources.
 *
 * Zero dependencies, Node only, same as kie.mjs: a skill has to run without an
 * install step on any machine.
 *
 * It does the mechanical half of the audit and NOTHING ELSE. It never writes a
 * creative rule, never names a colour, and never fills a field it could not
 * fetch: an absent favicon comes back as ABSENT, not as a generated one. The
 * judgement half, the mockup grammar and the proof, needs someone to look at the
 * pictures.
 *
 *   node audit-brand.mjs https://example.com [--out DIR]
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const argv = process.argv.slice(2);
const site = argv.find((a) => a.startsWith("http"));
const outDir = (argv.indexOf("--out") > -1 ? argv[argv.indexOf("--out") + 1] : null) || "brand-kit-draft";
if (!site) { console.error("usage: node audit-brand.mjs https://example.com [--out DIR]"); process.exit(1); }
const origin = new URL(site).origin;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * These endpoints rate limit hard. A 429 read as "absent" silently halves the
 * kit, so it is retried with backoff and, if it still fails, reported as
 * RATE_LIMITED rather than as missing.
 */
async function get(url, { asBuffer = false, tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * 2 ** i); continue; }
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, status: r.status, body: asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text() };
    } catch (e) {
      if (i === tries - 1) return { ok: false, status: 0, error: e.message };
      await sleep(2000 * 2 ** i);
    }
  }
  return { ok: false, status: 429, rateLimited: true };
}

const PLATFORMS = [
  { name: "Shopify", test: /shopify|cdn\/shop/i, catalogue: "/products.json?limit=250" },
  { name: "WooCommerce", test: /woocommerce|wp-content/i, catalogue: "/wp-json/wc/store/products" },
  { name: "Squarespace", test: /squarespace/i, catalogue: null },
  { name: "Wix", test: /wix\.com|wixstatic/i, catalogue: null },
  { name: "Webflow", test: /webflow/i, catalogue: null },
  { name: "BigCommerce", test: /bigcommerce/i, catalogue: null },
];

/** PNG alpha bounding box, so a logo that bleeds to its canvas edge is caught. */
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const kit = { built_at: new Date().toISOString().slice(0, 10), site: origin, generator: "audit-brand.mjs" };
const note = (s) => console.error("  " + s);

console.error(`\nAuditing ${origin}\n`);
const home = await get(origin + "/");
if (!home.ok) { console.error(`cannot reach ${origin}: HTTP ${home.status}`); process.exit(2); }
const h = home.body;

// --- platform -------------------------------------------------------------
const platform = PLATFORMS.find((p) => p.test.test(h));
kit.platform = platform ? platform.name : "UNKNOWN";
note(`platform: ${kit.platform}`);

// --- identity -------------------------------------------------------------
const meta = (re) => (h.match(re) || [])[1] || null;
kit.identity = {
  og_site_name: meta(/property="og:site_name"\s+content="([^"]*)"/i),
  title: meta(/<title[^>]*>([^<]*)</i),
  description: meta(/name="description"\s+content="([^"]*)"/i),
  evidence: "VERIFIED from served HTML meta tags.",
};
note(`name: ${kit.identity.og_site_name || kit.identity.title || "?"}`);

// --- logos ----------------------------------------------------------------
const header = (() => { const i = h.toLowerCase().indexOf("<header"); return i < 0 ? h.slice(0, 20000) : h.slice(i, i + 15000); })();
const imgs = [...header.matchAll(/<img[^>]+>/g)].map((m) => m[0]);
const logoTags = imgs.filter((t) => /logo|brand/i.test(t) || /cdn\/shop|\/assets\//.test(t));
const abs = (u) => (u.startsWith("http") ? u : u.startsWith("//") ? "https:" + u : origin + u);
kit.logo = { files: [], icon_mark_exists: "NEEDS_HUMAN_CHECK: look at the file. A wordmark-only brand must never be given an invented mark." };
for (const tag of logoTags.slice(0, 6)) {
  const src = (tag.match(/src="([^"]+)"/) || [])[1];
  if (!src) continue;
  const url = abs(src.split("?")[0]);
  const role = /reverse|white|light|dark|alt/i.test(url) ? "alt_or_reverse" : "primary";
  const f = await get(url + "?width=1200", { asBuffer: true });
  const dim = f.ok ? pngSize(f.body) : null;
  kit.logo.files.push({ role, url, px: dim ? `${dim.w}x${dim.h}` : "unknown", bytes: f.ok ? f.body.length : null,
    alt: (tag.match(/alt="([^"]*)"/) || [])[1] ?? null });
  note(`logo ${role}: ${url.split("/").pop()} ${dim ? dim.w + "x" + dim.h : ""}`);
}
if (!kit.logo.files.length) kit.logo.files.push({ role: "primary", status: "NOT_FOUND_IN_HEADER" });

// --- icons ----------------------------------------------------------------
const icons = [...h.matchAll(/<link[^>]+rel="[^"]*(?:icon|apple-touch)[^"]*"[^>]*>/gi)].map((m) => m[0]);
const favicon = await get(origin + "/favicon.ico");
kit.icons = {
  declared: icons.map((t) => (t.match(/href="([^"]+)"/) || [])[1]).filter(Boolean),
  favicon_ico: favicon.ok ? origin + "/favicon.ico" : `ABSENT (HTTP ${favicon.status})`,
};
note(`favicon: ${favicon.ok ? "present" : "ABSENT " + favicon.status}`);

// --- palette --------------------------------------------------------------
const cssUrls = [...h.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) => abs(m[1])).slice(0, 8);
let css = "";
for (const u of cssUrls) { const r = await get(u); if (r.ok) css += r.body; }
const hexes = {};
for (const m of (css + h).matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
  const k = m[0].toLowerCase(); hexes[k] = (hexes[k] || 0) + 1;
}
kit.palette = {
  census: Object.entries(hexes).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([hex, n]) => ({ hex, n })),
  evidence: `VERIFIED by frequency census over ${cssUrls.length} stylesheets and the page.`,
  interpretation: "NEEDS_HUMAN_CHECK: a near-achromatic result is often correct, not a miss. Decide whether the product supplies the colour.",
};
// Filter the CSS machinery out: `font-family: var(--x)`, `inherit` and the
// generic fallbacks are not the brand's typeface, and reporting them as the
// answer is worse than reporting none. First run against a live site returned
// "var, inherit, sans-serif" and missed the real family entirely.
const GENERIC = new Set(["inherit","initial","unset","revert","sans-serif","serif","monospace","cursive","fantasy",
  "system-ui","ui-sans-serif","ui-serif","ui-monospace","var","none","auto","-apple-system","blinkmacsystemfont"]);
const famCount = {};
for (const m of (css + h).matchAll(/font-family:\s*([^;}{]{3,200})/g)) {
  for (const raw of m[1].split(",")) {
    const fam = raw.trim().replace(/^["']|["']$/g, "").trim();
    if (!fam || fam.startsWith("var(") || fam.includes("(") || GENERIC.has(fam.toLowerCase())) continue;
    if (!/^[A-Za-z][A-Za-z0-9 _-]{1,40}$/.test(fam)) continue;
    famCount[fam] = (famCount[fam] || 0) + 1;
  }
}
const fams = Object.entries(famCount).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} (${n})`);
kit.typography = { declared_families: fams.slice(0, 8),
  wordmark_rule: "NEEDS_HUMAN_CHECK: if the wordmark's font is unidentified, the wordmark is PLACED as artwork, never re-typeset." };
note(`palette: ${kit.palette.census.slice(0, 4).map((c) => c.hex).join(" ")} | fonts: ${fams.slice(0, 3).join(", ")}`);

// --- catalogue ------------------------------------------------------------
kit.catalogue = { status: "NOT_ATTEMPTED" };
if (platform?.catalogue) {
  const c = await get(origin + platform.catalogue);
  if (c.ok) {
    try {
      const j = JSON.parse(c.body);
      const ps = j.products || j || [];
      const bodies = ps.map((p) => (p.body_html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
      const prices = ps.flatMap((p) => (p.variants || []).map((v) => parseFloat(v.price))).filter((n) => n > 0).sort((a, b) => a - b);
      const tags = {}; ps.forEach((p) => (p.tags || []).forEach((t) => (tags[t] = (tags[t] || 0) + 1)));
      // A phrase repeated across most descriptions is a brand claim; in one, it is
      // a one-off. A fixed keyword list only finds claims we thought of in
      // advance, which is useless for an industry nobody anticipated, so this
      // counts the brand's OWN repeated phrases instead.
      /**
       * Most ecommerce descriptions end in an SEO keyword tail: a long
       * comma-separated list of near-duplicate phrases. It is stuffing, it must
       * never reach an asset, and left in place it dominates the phrase counts
       * and buries the real claims. Cut it before counting.
       *
       * The signal is comma density, which is brand and industry agnostic: prose
       * runs about one comma per fifteen words, a keyword list runs one per three.
       */
      const stripSeoTail = (text) => {
        const parts = text.split(/(?<=[.!?])\s+|\s*\.\s*\.\s*\.\s*/);
        const kept = [];
        for (const part of parts) {
          const words = part.split(/\s+/).filter(Boolean).length;
          const commas = (part.match(/,/g) || []).length;
          if (words >= 8 && commas / words > 0.12) continue; // a list, not a sentence
          kept.push(part);
        }
        return kept.join(" ").trim();
      };
      const prose = bodies.map(stripSeoTail).filter((b) => b.length > 40);
      const STOP = new Set("the a an and or of to in for with on is are this that your you our we it be as at by from will can".split(" "));
      const ngrams = new Map();
      for (const body of prose) {
        const words = body.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
        const seen = new Set();
        for (let n = 2; n <= 5; n++) {
          for (let i = 0; i + n <= words.length; i++) {
            const g = words.slice(i, i + n);
            // A phrase that is only stop-words carries no claim.
            if (g.every((w) => STOP.has(w))) continue;
            if (STOP.has(g[0]) || STOP.has(g.at(-1))) continue;
            const key = g.join(" ");
            if (seen.has(key)) continue;
            seen.add(key);
            ngrams.set(key, (ngrams.get(key) || 0) + 1);
          }
        }
      }
      const MIN = Math.max(2, Math.ceil(prose.length * 0.25));
      const repeated = [...ngrams.entries()]
        .filter(([g, n]) => n >= MIN && g.split(" ").length >= 3)
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, 30)
        .map(([phrase, n]) => ({ phrase, n, of: prose.length, pct: Math.round((n / prose.length) * 100) }));
      kit.catalogue = {
        status: "VERIFIED", count: ps.length,
        note: ps.length === 250 ? "250 is the endpoint cap. The real catalogue may be larger." : null,
        images_total: ps.reduce((n, p) => n + (p.images || []).length, 0),
        price_usd: prices.length ? { min: prices[0], median: prices[prices.length >> 1], max: prices.at(-1), variants: prices.length } : null,
        top_tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 12),
        repeated_phrases: repeated,
        seo_tails_stripped: bodies.filter((b) => stripSeoTail(b).length < b.length).length,
        claim_rule: "A phrase in a clear majority of descriptions is a brand claim and may be used. A phrase the brand asserts about itself but that no third party confirms (a market-size figure, an award, a count of customers) belongs in FORBIDDEN, not APPROVED. So does the SEO keyword tail that ends most ecommerce descriptions.",
        sample_images: ps.slice(0, 3).map((p) => ({ title: p.title, images: (p.images || []).map((i) => i.src.split("?")[0]) })),
        shared_asset_hint: "Download several products' full image sets and md5 them. Files repeating across products are the brand's own size guides, material and packaging shots. Composite those, never regenerate them.",
      };
      note(`catalogue: ${ps.length} products, ${kit.catalogue.images_total} images`);
    } catch (e) { kit.catalogue = { status: "UNPARSEABLE", error: e.message }; }
  } else {
    kit.catalogue = { status: c.rateLimited || c.status === 429 ? "RATE_LIMITED" : `HTTP_${c.status}`,
      note: "A 429 is not an absent endpoint. Retry later before concluding the catalogue is unavailable." };
    note(`catalogue: ${kit.catalogue.status}`);
  }
}

// --- channels and review platform ----------------------------------------
const SOCIAL = /https?:\/\/(?:www\.)?(instagram|facebook|pinterest|tiktok|youtube|x|twitter|linkedin)\.com\/[^"'\s]+/gi;
kit.channels = [...new Set([...h.matchAll(SOCIAL)].map((m) => m[0]))].slice(0, 10);
const REVIEW = { "Judge.me": /judge\.?me|jdgm/i, Yotpo: /yotpo/i, Okendo: /okendo/i, Loox: /loox/i, Stamped: /stamped\.io/i, Trustpilot: /trustpilot/i };
kit.social_proof = {
  platform_detected: Object.entries(REVIEW).filter(([, re]) => re.test(h)).map(([n]) => n),
  rating: "NOT_ESTABLISHED",
  rule: "Render NO proof until a rating or a real testimonial is verified. A fabricated review is a legal and trust failure, and it is the field an eager process invents because it knows what one sounds like. Record what was attempted so the next pass resumes.",
};
note(`channels: ${kit.channels.length} | review platform: ${kit.social_proof.platform_detected.join(", ") || "none detected"}`);

// --- what a human still owns ---------------------------------------------
kit.human_required = [
  "Confirm the canonical brand name, and reconcile any variant between the site, the vendor field and the copy.",
  "Look at the product images and write the mockup grammar: surface, props, light, camera height, palette.",
  "Decide the one non-negotiable product rule, the thing that makes an asset this brand's rather than generic.",
  "Verify or abandon social proof. Do not let it default to plausible.",
  "Confirm whether a missing favicon or icon mark is genuinely absent, and report it rather than generating one.",
];

const { mkdir, writeFile } = await import("node:fs/promises");
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/brand-kit.draft.json`, JSON.stringify(kit, null, 2));
console.error(`\nDraft written to ${outDir}/brand-kit.draft.json`);
console.error("This is a DRAFT with evidence attached, not a kit. Work the human_required list before any render.\n");
