/*
 * Motion runtime for metrix-video-assembly compositions.
 *
 * Every visual property is a pure function of t (seconds). Nothing here uses
 * CSS animations, CSS transitions, requestAnimationFrame loops or timers, so
 * the renderer can seek to any frame in any order and get the same pixels.
 *
 * Markup vocabulary (all times are absolute seconds on the ad timeline):
 *
 *   <section data-scene="s1" data-start="0" data-end="2.4"
 *            data-trans-in="cut|fade|dip|slide|zoom" data-trans-out="..."
 *            data-trans="0.35">
 *
 *   <h1 data-text="hook" data-in="0" data-out="2.3"
 *       data-enter="none|fade|rise|slam|pop|type|wipe" data-dur="0.35"
 *       data-exit="fade|none">
 *
 *   <video data-clip src="clip.mp4" data-start="2.4" data-offset="0" muted>
 *   <img data-ken data-from="1" data-to="1.08" data-pan="0,-2">
 *   <span data-count data-from="0" data-to="249" data-in="3" data-dur="0.8"
 *         data-format="int|1dp|comma">
 *
 *   Motion.on((t) => { ... })  bespoke per-frame logic, also pure in t.
 *
 * data-text marks copy a viewer must read. The renderer's layout check and the
 * storyboard check both key on its id, so give every readable line one.
 *
 *   data-hold           stillness here is deliberate (the craft check's dead_stretch skips it)
 *   data-layout-ignore  text that is texture, not reading (the type-floor check skips it)
 *
 * render.mjs injects window.__MCE before the page runs: settleDefault (timeline/rules.mjs
 * SETTLE_DEFAULT, so the data-dur default cannot drift from the storyboard check), and the
 * seek-fallback and video-ready waits. The literals below serve only a page opened without
 * render.mjs; src/__tests__/render-health.test.ts holds the settle default equal to rules.mjs.
 */
(function () {
  const CFG = Object.assign({ settleDefault: 0.35, seekFallbackMs: 3000, readyVideoMs: 15000 }, window.__MCE || {});
  const stats = { seekFallbacks: [], frameMismatches: [] };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const ease = {
    out: (p) => 1 - Math.pow(1 - p, 3),
    inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    back: (p) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
  };
  const num = (el, k, d) => {
    const v = el.getAttribute(k);
    return v === null || v === "" ? d : parseFloat(v);
  };
  const hooks = [];

  function sceneOf(el) {
    return el.closest("[data-scene]");
  }

  function applyScene(sc, t) {
    const s = num(sc, "data-start", 0);
    const e = num(sc, "data-end", Infinity);
    const d = num(sc, "data-trans", 0.35);
    const tin = sc.getAttribute("data-trans-in") || "dip";
    const tout = sc.getAttribute("data-trans-out") || "dip";
    let o = 1, ty = 0, sc_ = 1;
    if (t < s || t >= e) {
      sc.style.visibility = "hidden";
      sc.style.opacity = "0";
      return;
    }
    sc.style.visibility = "visible";
    // Entrance. "dip" uses only half the transition so the outgoing scene is
    // gone before this one arrives: no muddy double exposure between layouts.
    const inD = tin === "dip" ? d / 2 : d;
    if (tin !== "cut" && t < s + inD) {
      const p = ease.out(clamp((t - s) / inD, 0, 1));
      o = p;
      if (tin === "slide") ty = lerp(6, 0, p);
      if (tin === "zoom") sc_ = lerp(1.06, 1, p);
    }
    const outD = tout === "dip" ? d / 2 : d;
    if (tout !== "cut" && isFinite(e) && t > e - outD) {
      const p = ease.inOut(clamp((e - t) / outD, 0, 1));
      o = Math.min(o, p);
      if (tout === "slide") ty = lerp(-6, 0, p);
    }
    sc.style.opacity = String(o);
    sc.style.transform = `translateY(${ty}%) scale(${sc_})`;
  }

  function applyText(el, t) {
    const sc = sceneOf(el);
    const tin = num(el, "data-in", sc ? num(sc, "data-start", 0) : 0);
    const tout = num(el, "data-out", sc ? num(sc, "data-end", Infinity) : Infinity);
    const d = num(el, "data-dur", CFG.settleDefault);
    const enter = el.getAttribute("data-enter") || "fade";
    const exit = el.getAttribute("data-exit") || "none";
    if (el.__full === undefined) el.__full = el.textContent;
    if (t < tin || t >= tout) {
      el.style.opacity = "0";
      if (enter === "type") el.textContent = el.__full;
      return;
    }
    let o = 1, tx = 0, ty = 0, s = 1, clip = null;
    const p = enter === "none" ? 1 : clamp((t - tin) / d, 0, 1);
    if (enter === "fade") o = ease.out(p);
    if (enter === "rise") { o = ease.out(p); ty = lerp(0.6, 0, ease.out(p)); }
    if (enter === "slam") { o = clamp(p * 3, 0, 1); s = lerp(1.35, 1, ease.out(p)); }
    if (enter === "pop") { o = clamp(p * 2, 0, 1); s = lerp(0.6, 1, ease.back(p)); }
    if (enter === "wipe") clip = `inset(0 ${100 - ease.out(p) * 100}% 0 0)`;
    if (enter === "type") {
      const n = Math.round(el.__full.length * p);
      el.textContent = el.__full.slice(0, n);
    }
    if (exit === "fade" && isFinite(tout)) {
      const xd = Math.min(0.25, d);
      if (t > tout - xd) o = Math.min(o, clamp((tout - t) / xd, 0, 1));
    }
    el.style.opacity = String(o);
    el.style.transform = `translate(${tx}em, ${ty}em) scale(${s})`;
    el.style.clipPath = clip || "";
  }

  function applyKen(el, t) {
    const sc = sceneOf(el);
    const s = sc ? num(sc, "data-start", 0) : 0;
    const e = sc ? num(sc, "data-end", s + 5) : s + 5;
    const p = clamp((t - s) / Math.max(0.01, e - s), 0, 1);
    const from = num(el, "data-from", 1), to = num(el, "data-to", 1.08);
    const [px, py] = (el.getAttribute("data-pan") || "0,0").split(",").map(parseFloat);
    el.style.transform = `scale(${lerp(from, to, p)}) translate(${px * p}%, ${py * p}%)`;
  }

  function applyCount(el, t) {
    const tin = num(el, "data-in", 0), d = num(el, "data-dur", 0.8);
    const from = num(el, "data-from", 0), to = num(el, "data-to", 0);
    const v = lerp(from, to, ease.out(clamp((t - tin) / d, 0, 1)));
    const f = el.getAttribute("data-format") || "int";
    el.textContent =
      f === "1dp" ? v.toFixed(1) : f === "comma" ? Math.round(v).toLocaleString("en-US") : String(Math.round(v));
  }

  // The clip's own time at ad time t: data-start places it, data-offset trims its head.
  // The frame shown must be floor((t - start + offset) * srcFps). Seeking to that exact time is
  // not enough: on a source frame boundary (25 fps under 30 fps meets every 0.2 s; a 30 fps clip
  // at offset 0 meets every ad frame) float noise, the 5 dp time render.mjs sends, or a WebM's
  // whole-millisecond timestamps (30 fps frame 2 sits at 67 ms) show the previous frame. With the
  // clip's rate known (render.mjs probes it into CFG.clipFps) the seek goes to the middle of the
  // wanted frame. Without it, FRAME_NUDGE (0.1 ms) still moves an exact boundary onto the later
  // frame, which covers exact-timebase files such as staged MP4s, but not WebM rounding.
  const FRAME_NUDGE = 1e-4;
  function clipLocal(v, t) {
    const s = num(v, "data-start", 0), off = num(v, "data-offset", 0);
    const hi = Math.max(0, (v.duration || 0) - 0.001);
    const fps = (CFG.clipFps || {})[v.getAttribute("src")];
    if (fps > 0) {
      const k = Math.max(0, Math.floor((t - s + off) * fps + 1e-3)); // 1e-3 of a frame absorbs float and 5 dp noise
      return clamp((k + 0.5) / fps, 0, hi);
    }
    return clamp(t - s + off + FRAME_NUDGE, 0, hi);
  }

  // Seek one visible clip to a local time. A seek that never reports "seeked" resolves after
  // the fallback wait so a render cannot hang, but it is counted, and render.mjs FAILs it.
  //
  // "seeked" alone does not prove which frame was presented. A clip whose rate is known also
  // waits until requestVideoFrameCallback reports the wanted frame (mediaTime); a callback for
  // another frame (a presentation still pending from an earlier seek) is not taken as done, and
  // if the wanted frame never arrives within the fallback wait the last frame seen is counted as
  // a mismatch. A clip of unknown rate cannot be checked this way and waits for seeked only.
  const hasFrameCallback = (v) => typeof v.requestVideoFrameCallback === "function";
  function seekTo(v, local, t, { frame = true } = {}) {
    const src = v.getAttribute("src");
    const fps = (CFG.clipFps || {})[src];
    const want = fps > 0 ? Math.floor(local * fps + 1e-3) : null;
    const waitFrame = frame && want !== null && hasFrameCallback(v);
    return new Promise((res) => {
      let timer = null, seeked = false, framed = !waitFrame, handle = null, seen = null;
      const done = (fallback) => {
        v.removeEventListener("seeked", onSeeked);
        if (handle !== null && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
        clearTimeout(timer);
        if (fallback && seeked && seen !== null && seen !== want) stats.frameMismatches.push({ src, t, local, want, got: seen });
        else if (fallback) stats.seekFallbacks.push({ src, t, local, waited_for: seeked ? "frame" : "seeked" });
        res();
      };
      const ask = () => {
        handle = v.requestVideoFrameCallback((now, meta) => {
          handle = null;
          // a presented frame sits at its own timestamp, which a container may round (WebM: whole ms)
          seen = Math.round(meta.mediaTime * fps);
          if (seen !== want) return ask();
          framed = true;
          if (seeked) done(false);
        });
      };
      const onSeeked = () => { seeked = true; if (framed) done(false); };
      if (waitFrame) ask();
      v.addEventListener("seeked", onSeeked);
      v.currentTime = local;
      timer = setTimeout(() => done(true), CFG.seekFallbackMs);
    });
  }

  // A seek is skipped only when the clip already sits within 10 us of the target (currentTime
  // reads back rounded to the microsecond); the old 0.5 ms window could keep a frame across a
  // boundary.
  function seekClip(v, t) {
    const local = clipLocal(v, t);
    if (Math.abs(v.currentTime - local) < 1e-5) return Promise.resolve();
    return seekTo(v, local, t);
  }

  // Everything but the clips: scenes, text, Ken Burns, counters and per-frame hooks.
  function apply(t) {
    document.querySelectorAll("[data-scene]").forEach((sc) => applyScene(sc, t));
    document.querySelectorAll("[data-text],[data-in]").forEach((el) => {
      if (!el.hasAttribute("data-count")) applyText(el, t);
    });
    document.querySelectorAll("[data-ken]").forEach((el) => applyKen(el, t));
    document.querySelectorAll("[data-count]").forEach((el) => applyCount(el, t));
    for (const h of hooks) h(t);
  }

  const twoFrames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Returns each clip's src and currentTime after the seek, so a caller can check the frame map.
  //
  // A clip that turns visible (v19 shows and hides its shots with visibility:hidden on a
  // wrapper) can keep an older picture on screen although "seeked" and requestVideoFrameCallback
  // both report the new frame. Measured on scratch copies, 4x5 CAP, alternating capture times:
  //   seeking every clip, hidden or not:            v19 S3H frame 0 at 15.409 s in 5 of 30
  //   seeking visible clips only:                   v19 wrong picture at 13.0 s in 15 of 45
  //   + two animation frames before seeking a clip that just turned visible: 1 of 30
  //   + then presenting the same frame once more:   0 of 270 on v19, 0 of 240 on the fixture
  // So: hidden clips are not seeked (their frame cannot be seen; their reported currentTime is
  // stale), and a clip that turns visible gets its layer first, its frame, then that frame again.
  async function seek(t) {
    apply(t);
    const clips = [...document.querySelectorAll("video[data-clip]")];
    const on = clips.map((v) => shown(v) > 0);
    const turnedOn = clips.map((v, i) => on[i] && v.__wasShown !== true);
    clips.forEach((v, i) => (v.__wasShown = on[i]));
    if (turnedOn.some(Boolean)) await twoFrames();
    await Promise.all(clips.map(async (v, i) => {
      if (!on[i]) return;
      await seekClip(v, t);
      if (!turnedOn[i]) return;
      // a quarter frame later is the same frame (known rate), or 1 ms later (unknown rate)
      const fps = (CFG.clipFps || {})[v.getAttribute("src")];
      const again = Math.min(clipLocal(v, t) + (fps > 0 ? 0.25 / fps : 0.001), Math.max(0, (v.duration || 0) - 0.001));
      await seekTo(v, again, t, { frame: false });
    }));
    await twoFrames();
    return clips.map((v) => ({ src: v.getAttribute("src"), currentTime: v.currentTime, local: clipLocal(v, t) }));
  }

  async function ready() {
    // Load every declared face, not only the ones already used: a face that fails shows as
    // "error", while an unused face would otherwise stay "unloaded" and read as broken.
    if (document.fonts) {
      await Promise.all([...document.fonts].map((f) => (f.status === "loaded" ? null : f.load().catch(() => {}))));
      await document.fonts.ready;
    }
    await Promise.all(
      [...document.images].map((im) => (im.complete ? im.decode().catch(() => {}) : new Promise((r) => { im.onload = im.onerror = r; })))
    );
    await Promise.all(
      [...document.querySelectorAll("video")].map((v) => {
        v.muted = true; v.pause();
        if (v.readyState >= 2 || v.error) return null;
        return new Promise((r) => {
          v.addEventListener("loadeddata", r, { once: true });
          v.addEventListener("error", r, { once: true });
          setTimeout(r, CFG.readyVideoMs);
        });
      })
    );
    const broken = [...document.images].filter((im) => !im.naturalWidth).map((im) => im.getAttribute("src"));
    const fonts = document.fonts ? [...document.fonts].filter((f) => f.status !== "loaded").map((f) => `${f.family} ${f.weight} (${f.status})`) : [];
    const videos = [...document.querySelectorAll("video")].map((v) => ({
      src: v.getAttribute("src"),
      readyState: v.readyState,
      duration: Number.isFinite(v.duration) ? v.duration : String(v.duration),
      error: v.error ? v.error.code : null,
    }));
    return { broken_images: broken, unloaded_fonts: fonts, videos };
  }

  function health() {
    return {
      seek_fallbacks: stats.seekFallbacks.length, seek_fallback_at: stats.seekFallbacks.slice(0, 10),
      frame_mismatches: stats.frameMismatches.length, frame_mismatch_at: stats.frameMismatches.slice(0, 10),
    };
  }

  // The DOM as authored: raw attributes and copy, read before any seek or bind changes it.
  function authored() {
    const attr = (el, k) => (el.hasAttribute(k) ? el.getAttribute(k) : null);
    const scene = (sc) => (sc ? { id: sc.getAttribute("data-scene"), start: attr(sc, "data-start"), end: attr(sc, "data-end") } : null);
    return {
      texts: [...document.querySelectorAll("[data-text]")].map((el) => ({
        id: el.getAttribute("data-text"),
        text: el.__full !== undefined ? el.__full : el.textContent,
        in: attr(el, "data-in"), out: attr(el, "data-out"), dur: attr(el, "data-dur"),
        enter: attr(el, "data-enter"), exit: attr(el, "data-exit"),
        scene: scene(sceneOf(el)),
      })),
      scenes: [...document.querySelectorAll("[data-scene]")].map(scene),
    };
  }

  // Effective opacity up the ancestor chain; 0 when the element does not render at all.
  function shown(el) {
    if (!el.isConnected || el.getClientRects().length === 0) return 0;
    if (getComputedStyle(el).visibility !== "visible") return 0;
    let o = 1;
    for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
      o *= parseFloat(getComputedStyle(a).opacity);
      if (!(o > 0)) return 0;
    }
    return o;
  }

  // Elements that carry reading text directly (a text node child), found once.
  let textEls = null;
  function readingElements() {
    if (textEls) return textEls;
    let k = 0;
    textEls = [...document.body.querySelectorAll("*")]
      .filter((el) => !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName))
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((el) => {
        const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
        return { el, key: k++, label: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls };
      });
    return textEls;
  }

  // FNV-1a: the page signature without shipping the whole string over CDP.
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16);
  }

  // Craft samples at each t. Clips are not seeked; their local time enters the signature.
  // floorPx: report only reading text under it.
  function probe(times, floorPx) {
    const items = [...document.querySelectorAll("[data-text]")];
    const els = readingElements();
    const all = [...document.body.querySelectorAll("*")];
    return times.map((t) => {
      apply(t);
      const out = { t, items: {}, small: [], held: false, sig: "" };
      for (const el of items) {
        const sc = sceneOf(el);
        const eff = !sc || getComputedStyle(sc).visibility === "visible" ? shown(el) : 0;
        out.items[el.getAttribute("data-text")] = { vis: eff > 0, own: parseFloat(getComputedStyle(el).opacity), eff: Math.round(eff * 1000) / 1000 };
      }
      for (const { el, key, label } of els) {
        if (el.closest("[data-layout-ignore]")) continue;
        const fp = parseFloat(getComputedStyle(el).fontSize);
        if (!(fp < floorPx - 0.5)) continue;
        if (shown(el) >= 0.5) out.small.push({ key, label, text: el.textContent, font_px: fp });
      }
      out.held = [...document.querySelectorAll("[data-hold]")].some((el) => shown(el) > 0);
      let s = "";
      for (const el of all) s += (el.getAttribute("style") || "") + "|" + (typeof el.className === "string" ? el.className : "") + ";";
      for (const el of document.querySelectorAll("[data-text],[data-count]")) s += el.textContent + ";";
      for (const v of document.querySelectorAll("video[data-clip]")) if (shown(v) > 0) s += "v" + clipLocal(v, t).toFixed(3) + ";";
      out.sig = fnv(s);
      return out;
    });
  }

  function clippedByAncestor(el, r) {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflow === "visible") continue;
      const b = a.getBoundingClientRect();
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) return true;
    }
    return false;
  }

  // Readable-copy geometry at time t, for the renderer's layout check.
  function layout(t) {
    const W = window.innerWidth, H = window.innerHeight;
    return [...document.querySelectorAll("[data-text]")]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const sc = sceneOf(el);
        return parseFloat(cs.opacity) > 0.98 && (!sc || getComputedStyle(sc).visibility === "visible");
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          id: el.getAttribute("data-text"),
          text: el.__full || el.textContent,
          box: { x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H },
          font_px: parseFloat(cs.fontSize),
          // A word wider than its box, or copy cut off by a clipping container.
          // Display type taller than its line box is normal and not counted.
          overflow:
            el.scrollWidth > el.clientWidth + 2 ||
            (cs.overflow !== "visible" && el.scrollHeight > el.clientHeight + 2) ||
            clippedByAncestor(el, r),
          color: cs.color,
        };
      });
  }

  window.Motion = { on: (fn) => hooks.push(fn), clamp, lerp, ease };
  window.__seek = seek;
  window.__ready = ready;
  window.__layout = layout;
  window.__health = health;
  window.__authored = authored;
  window.__probe = probe;
  window.__config = () => ({ ...CFG });
  // render.mjs hands over each clip's probed constant frame rate, keyed by its src attribute.
  window.__clipFps = (map) => ((CFG.clipFps = { ...(CFG.clipFps || {}), ...map }), CFG.clipFps);
})();
