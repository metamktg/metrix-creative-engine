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
 */
(function () {
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
    const d = num(el, "data-dur", 0.35);
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

  function seekClip(v, t) {
    const s = num(v, "data-start", 0), off = num(v, "data-offset", 0);
    const local = clamp(t - s + off, 0, Math.max(0, (v.duration || 0) - 0.001));
    if (Math.abs(v.currentTime - local) < 0.0005) return Promise.resolve();
    return new Promise((res) => {
      const done = () => { v.removeEventListener("seeked", done); res(); };
      v.addEventListener("seeked", done);
      v.currentTime = local;
      setTimeout(done, 3000);
    });
  }

  async function seek(t) {
    document.querySelectorAll("[data-scene]").forEach((sc) => applyScene(sc, t));
    document.querySelectorAll("[data-text],[data-in]").forEach((el) => {
      if (!el.hasAttribute("data-count")) applyText(el, t);
    });
    document.querySelectorAll("[data-ken]").forEach((el) => applyKen(el, t));
    document.querySelectorAll("[data-count]").forEach((el) => applyCount(el, t));
    for (const h of hooks) h(t);
    await Promise.all([...document.querySelectorAll("video[data-clip]")].map((v) => seekClip(v, t)));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function ready() {
    if (document.fonts) await document.fonts.ready;
    await Promise.all(
      [...document.images].map((im) => (im.complete ? im.decode().catch(() => {}) : new Promise((r) => { im.onload = im.onerror = r; })))
    );
    await Promise.all(
      [...document.querySelectorAll("video")].map((v) => {
        v.muted = true; v.pause();
        return v.readyState >= 2 ? null : new Promise((r) => { v.addEventListener("loadeddata", r, { once: true }); setTimeout(r, 15000); });
      })
    );
    const broken = [...document.images].filter((im) => !im.naturalWidth).map((im) => im.getAttribute("src"));
    const fonts = document.fonts ? [...document.fonts].filter((f) => f.status !== "loaded").map((f) => f.family) : [];
    return { broken_images: broken, unloaded_fonts: fonts };
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
})();
