#!/usr/bin/env python3
"""Check a talking-head script and its delivery map before any voice or motion is bought.

Usage:
  check_script.py <run>/script.json [--brief brief.json] [--kit brand-kit.json]
                  [--transcript heard.txt] [--print-spoken]

Reads the words and the per-line direction (references/script-and-delivery.md).
Prints a JSON report; exit 1 on any FAIL. WARN never fails the run.

It checks text and structure. It cannot hear a take: human listening of the full
dry voice before lip-sync spend remains mandatory.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROLES = ("hook", "stakes", "substance", "proof", "reservation", "action", "bridge")
EMOTIONS = ("calm", "warm", "curious", "wry", "surprised", "reassuring", "matter_of_fact",
            "concerned", "pleased", "deadpan")
GAZES = ("lens", "product", "work", "away_then_back")
GESTURES = ("none", "hold_product", "turn_product", "glance_to_screen", "nod", "hands_rest",
            "small_laugh", "push_hair")
SYNTHETIC = ("disclosed_demonstrator", "disclosed_ai_presenter")
IDENTITIES = SYNTHETIC + ("real_creator", "real_customer")
DURATION_MODES = ("exact", "maximum", "range")
DEFAULT_WPS = 2.4
FACE_BEAT_WARN_SECONDS = 10.0
EXACT_TOLERANCE_SECONDS = 1.5

GREETING_OPENERS = re.compile(
    r"^\s*(hi|hey|hello|yo|what'?s up|good (morning|afternoon|evening))\b"
    r"|^\s*(hey|hi)\s+(guys|everyone|there|all)\b"
    r"|\b(today|in this video|in today'?s video)\b.{0,40}\b(i'?m going to|i want to|we'?re going to|let'?s)\b"
    r"|^\s*(i'?m|my name is)\s+[A-Z][a-z]+\s+(from|and)\b",
    re.IGNORECASE,
)
EXPERIENCE_CLAIMS = re.compile(
    r"\bi('ve| have)\s+(been\s+)?(using|used|taking|taken|tried|wearing|worn)\b"
    r"|\bi\s+(bought|ordered|purchased|got)\s+(this|it|one|mine)\b"
    r"|\b(it|this)\s+worked\s+for\s+me\b"
    r"|\bmy\s+\w+\s+(has|have)\s+(completely\s+)?(changed|cleared|improved|transformed)\b"
    r"|\b(three|two|four|five|six|a few|several)\s+(weeks|months|years|days)\s+(in|later|on)\b"
    r"|\bsince\s+i\s+started\b"
    r"|\bchanged\s+my\s+(life|skin|sleep|routine)\b",
    re.IGNORECASE,
)
MARKETING_WORDS = re.compile(
    r"\b(innovative|premium|utili[sz]e|in order to|additionally|limited time|life[- ]changing|"
    r"game[- ]changer|revolutionary|cutting[- ]edge|seamless(ly)?|elevate|unlock|"
    r"community[- ]first|for everyone)\b",
    re.IGNORECASE,
)
STOCK_HOOKS = re.compile(r"^\s*(pov\s*:|stop scrolling|wait for it|you need this)", re.IGNORECASE)
# Direction belongs in the map and the provider's direction field, never in the spoken text.
DIRECTION_MARKERS = re.compile(r"\[[^\]]*\]|<[^>]*>|\*[^*\n]+\*")
PARENTHETICAL = re.compile(r"\([^)]*\)")
# Manufactured imperfection: a sound or filler inserted to simulate a human.
STAGE_NOISE = re.compile(r"\b(um+|uh+|er+|ahem|sigh(s|ing)?|inhales?|exhales?|gasps?|sniffs?|clears? (my |her |his )?throat)\b", re.IGNORECASE)
CONTRACTION = re.compile(r"\b\w+'(s|t|re|ve|ll|d|m)\b", re.IGNORECASE)
DIGITS_OR_CURRENCY = re.compile(r"[0-9]|[$£€%]")
WORD = re.compile(r"[A-Za-z0-9']+")


def words(text: str) -> int:
    return len(WORD.findall(text or ""))


def norm(text: str) -> str:
    text = (text or "").lower().replace("’", "'").replace("‘", "'")
    text = re.sub(r"[^a-z0-9' ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def apply_map(text: str, mapping) -> str:
    """Turn a written form into its spoken form, longest key first."""
    for written, spoken in sorted((mapping or {}).items(), key=lambda kv: -len(str(kv[0]))):
        text = text.replace(str(written), str(spoken))
    return text


def load(path: str | None):
    if not path:
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def flat(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [x for v in value for x in flat(v)]
    if isinstance(value, dict):
        return [x for v in value.values() for x in flat(v)]
    return [str(value)]


def resolve(dotted: str, root):
    cur = root
    for part in dotted.split("."):
        if cur is None:
            return []
        cur = cur.get(part) if isinstance(cur, dict) else None
    return flat(cur)


class Report:
    def __init__(self):
        self.results = []

    def add(self, rule: str, verdict: str, detail: str):
        self.results.append({"rule": rule, "verdict": verdict, "detail": detail})

    def finish(self, extra=None) -> dict:
        fails = sum(1 for r in self.results if r["verdict"] == "FAIL")
        warns = sum(1 for r in self.results if r["verdict"] == "WARN")
        out = {"verdict": "FAIL" if fails else "PASS", "fails": fails, "warns": warns, "results": self.results}
        if extra:
            out.update(extra)
        return out


def kit_forbidden(kit) -> list[str]:
    banned: list[str] = []

    def walk(obj):
        if not isinstance(obj, dict):
            return
        for key, value in obj.items():
            if re.search(r"forbidden|banned", key, re.IGNORECASE):
                banned.extend(x for x in flat(value) if len(x) > 3)
            else:
                walk(value)

    walk(kit)
    return banned


def check(script: dict, brief: dict | None, kit: dict | None, transcript: str | None) -> dict:
    rep = Report()
    lines = script.get("lines")
    if not isinstance(lines, list) or not lines:
        rep.add("lines", "FAIL", "script.json has no lines")
        return rep.finish()

    pron = script.get("pronunciation_map") or {}
    presenter = script.get("presenter") or {}
    identity = presenter.get("identity")
    if identity not in IDENTITIES:
        rep.add("presenter.identity", "FAIL", f"identity must be one of {', '.join(IDENTITIES)}; got {identity!r}")
    synthetic = identity in SYNTHETIC or identity not in IDENTITIES
    if not str(presenter.get("register", "")).strip():
        rep.add("presenter.register", "WARN", "no speech register for the presenter; the script will drift to brand voice")

    wps = float(script.get("words_per_second") or DEFAULT_WPS)
    if not 1.8 <= wps <= 3.0:
        rep.add("words_per_second", "FAIL", f"{wps} is outside the 1.8 to 3.0 range a person speaks at")

    # Structure
    first, last = lines[0], lines[-1]
    if first.get("role") != "hook":
        rep.add("shape.hook", "FAIL", f"first line role is {first.get('role')!r}, not 'hook'")
    if last.get("role") != "action":
        rep.add("shape.action", "FAIL", f"last line role is {last.get('role')!r}, not 'action'")
    if not any(ln.get("role") == "reservation" for ln in lines):
        rep.add("shape.reservation", "WARN", "no reservation line; a script with no downside reads as an advert")

    # Key messages: exactly two things the audience must understand
    key_messages = script.get("key_messages")
    all_text = norm(" ".join(str(ln.get("text", "")) for ln in lines))
    if key_messages is not None:
        if not (isinstance(key_messages, list) and len(key_messages) == 2 and all(str(k).strip() for k in key_messages)):
            rep.add("key_messages", "FAIL", "key_messages must be exactly two things the audience must understand")
        else:
            for i, msg in enumerate(key_messages, 1):
                core = norm(msg)
                size = SequenceMatcher(None, core, all_text, autojunk=False).find_longest_match(0, len(core), 0, len(all_text)).size
                hit = core in all_text or size >= max(12, int(0.6 * len(core)))
                rep.add(f"key_messages.{i}", "PASS" if hit else "WARN",
                        "carried by the script" if hit else f"not clearly carried by any line: {msg!r}")

    # Brief locks
    locked_opening = None
    if brief:
        copy = brief.get("copy_architecture") or {}
        locked_opening = copy.get("spoken_opening_locked")
        spoken = copy.get("spoken_script")
        if spoken:
            ratio = SequenceMatcher(None, norm(apply_map(spoken, pron)), all_text, autojunk=False).ratio()
            rep.add("brief.spoken_script", "PASS" if ratio >= 0.9 else "WARN",
                    f"script text matches the brief's spoken_script at {ratio:.2f}")

    total_words = 0
    total_pause = 0.0
    intensities = []
    gazes = []
    friction = 0
    brand = (brief or {}).get("brand_name") or script.get("brand_name")
    banned = kit_forbidden(kit) if kit else []
    seen_ids = set()

    for idx, ln in enumerate(lines):
        lid = str(ln.get("id") or f"line{idx + 1}")
        if lid in seen_ids:
            rep.add(f"{lid}.id", "FAIL", "duplicate line id")
        seen_ids.add(lid)
        text = str(ln.get("text") or "")
        if not text.strip():
            rep.add(f"{lid}.text", "FAIL", "empty line")
            continue
        n = words(text)
        total_words += n
        role = ln.get("role")
        if role not in ROLES:
            rep.add(f"{lid}.role", "FAIL", f"role {role!r} is not one of {', '.join(ROLES)}")
        if not str(ln.get("intent", "")).strip():
            rep.add(f"{lid}.intent", "FAIL", "no intent; direct the thought behind the line")
        emotion = ln.get("emotion")
        if emotion not in EMOTIONS:
            rep.add(f"{lid}.emotion", "FAIL", f"emotion {emotion!r} is not in the vocabulary")
        intensity = ln.get("intensity", 1)
        if intensity not in (1, 2, 3):
            rep.add(f"{lid}.intensity", "FAIL", f"intensity {intensity!r} must be 1, 2 or 3")
        else:
            intensities.append(intensity)
        energy = ln.get("energy", 1)
        if not isinstance(energy, int) or isinstance(energy, bool) or not 0 <= energy <= 4:
            rep.add(f"{lid}.energy", "FAIL", f"energy {energy!r} must be an integer 0 to 4")
        gaze = ln.get("gaze", "lens")
        if gaze not in GAZES:
            rep.add(f"{lid}.gaze", "FAIL", f"gaze {gaze!r} is not one of {', '.join(GAZES)}")
        gazes.append(gaze)
        gesture = ln.get("gesture", "none")
        if gesture not in GESTURES:
            rep.add(f"{lid}.gesture", "FAIL", f"gesture {gesture!r} is not in the vocabulary")
        elif gesture in ("small_laugh", "push_hair"):
            friction += 1
        emphasis = ln.get("emphasis")
        if emphasis:
            if norm(str(emphasis)) not in norm(text):
                rep.add(f"{lid}.emphasis", "FAIL", f"emphasis {emphasis!r} is not in the line")
            elif words(str(emphasis)) > 3:
                rep.add(f"{lid}.emphasis", "WARN", "emphasis longer than three words stops being emphasis")
        pause = ln.get("pause_after", 0) or 0
        if not isinstance(pause, (int, float)) or pause < 0 or pause > 3:
            rep.add(f"{lid}.pause_after", "FAIL", f"pause_after {pause!r} must be 0 to 3 seconds")
        else:
            total_pause += float(pause)

        # The words themselves
        if DIRECTION_MARKERS.search(text):
            rep.add(f"{lid}.direction_in_text", "FAIL",
                    "bracketed, angled or starred direction inside the spoken text; direction lives in the map "
                    "and the provider's documented direction field, and a model may read it aloud")
        if PARENTHETICAL.search(text):
            rep.add(f"{lid}.parenthetical", "WARN", "parenthetical in spoken text; is it direction or something to say?")
        if STAGE_NOISE.search(text):
            rep.add(f"{lid}.stage_noise", "WARN", "filler or stage-noise word; a manufactured imperfection reads fake")
        if idx == 0 and GREETING_OPENERS.search(text):
            rep.add(f"{lid}.opener", "FAIL", "greeting, introduction or meta-narration opener; start on the point")
        if idx == 0 and STOCK_HOOKS.search(text):
            rep.add(f"{lid}.stock_hook", "FAIL", "stock hook phrase; write the specific problem or claim")
        if DIGITS_OR_CURRENCY.search(text):
            rep.add(f"{lid}.numbers", "FAIL",
                    "digits or currency symbols; write the spoken form here and map the written form in pronunciation_map")
        if synthetic and EXPERIENCE_CLAIMS.search(text):
            rep.add(f"{lid}.experience", "FAIL",
                    "first-person experience claim from a synthetic presenter; write a demonstration, not a testimony")
        m = MARKETING_WORDS.search(text)
        if m:
            rep.add(f"{lid}.marketing", "WARN", f"marketing word {m.group(0)!r}; say it the way a person would")
        seconds = n / wps
        if ln.get("on_camera", True) and seconds > FACE_BEAT_WARN_SECONDS:
            rep.add(f"{lid}.face_beat", "WARN", f"about {seconds:.1f}s of talking face; split the line or plan a cutaway")
        if n > 22:
            rep.add(f"{lid}.length", "WARN", f"{n} words in one line; long sentences lose the listener and the sync")
        for claim in banned:
            if norm(claim) and norm(claim) in norm(text):
                rep.add(f"{lid}.forbidden", "FAIL", f"line carries the kit's forbidden claim {claim!r}")

        # Exact-copy locks: verbatim against the brief after the pronunciation map
        if ln.get("locked"):
            source = ln.get("lock_source")
            if source and brief:
                candidates = [norm(apply_map(v, pron)) for v in resolve(str(source), brief)]
                if not candidates:
                    rep.add(f"{lid}.locked", "FAIL", f"lock_source {source!r} is empty or missing in the brief")
                elif not any(norm(text) in c for c in candidates):
                    rep.add(f"{lid}.locked", "FAIL", f"locked line is not verbatim in {source}")
            elif source:
                rep.add(f"{lid}.locked", "WARN", f"no --brief given, cannot verify the lock on {source}")
            elif idx == 0 and locked_opening:
                if norm(text) != norm(apply_map(locked_opening, pron)):
                    rep.add(f"{lid}.locked", "FAIL", f"locked opening drifted: brief says {locked_opening!r}")
            elif brief:
                rep.add(f"{lid}.locked", "WARN", "locked line has no lock_source, so nothing was compared with the brief")

    if locked_opening and not lines[0].get("locked"):
        if norm(str(lines[0].get("text", ""))) != norm(apply_map(locked_opening, pron)):
            rep.add("hook.locked", "FAIL", f"brief locks the opening to {locked_opening!r}; the hook line differs")

    # Register and delivery across the script
    if total_words >= 15 and not CONTRACTION.search(" ".join(str(ln.get("text", "")) for ln in lines)):
        rep.add("register.contractions", "WARN", "no contractions anywhere; it will read like a press release")
    if intensities and all(i >= 3 for i in intensities):
        rep.add("delivery.energy", "FAIL", "every line at intensity 3; sustained high energy reads as an ad")
    elif intensities and max(intensities) == 1 and len(intensities) > 2:
        rep.add("delivery.energy", "WARN", "flat throughout; fine if deadpan is intended, otherwise give one line a genuine lift")
    if len(gazes) > 3 and all(g == "lens" for g in gazes):
        rep.add("delivery.gaze", "WARN", "every line stares at the lens; let attention land on the product or the work")
    if friction > 1:
        rep.add("delivery.friction", "WARN", f"{friction} human-friction beats; one at most")
    if brand:
        mentions = norm(all_text).count(norm(str(brand)))
        if mentions > 2:
            rep.add("register.brand", "WARN", f"brand named {mentions} times; once is usually enough")

    # Duration, by the declared mode
    estimate = total_words / wps + total_pause
    target = script.get("target_duration_seconds")
    mode = script.get("duration_mode")
    lo = hi = None
    if isinstance(target, dict):
        lo, hi = target.get("min"), target.get("max")
        mode = mode or "range"
    elif isinstance(target, (int, float)) and not isinstance(target, bool):
        hi = float(target)
        mode = mode or "maximum"
    if mode is not None and mode not in DURATION_MODES:
        rep.add("duration_mode", "FAIL", f"duration_mode {mode!r} must be one of {', '.join(DURATION_MODES)}")
        mode = None
    detail = f"{total_words} words at {wps} wps plus {total_pause:.1f}s of pauses = about {estimate:.1f}s"
    if hi is None:
        rep.add("duration", "WARN", detail + "; no target_duration_seconds declared")
    elif mode == "exact":
        if abs(estimate - hi) > EXACT_TOLERANCE_SECONDS:
            rep.add("duration", "FAIL", detail + f"; exact target is {hi}s within {EXACT_TOLERANCE_SECONDS}s. Adjust words or pauses, never the speed")
        else:
            rep.add("duration", "PASS", detail)
    elif estimate > float(hi) + 0.5:
        rep.add("duration", "FAIL", detail + f"; ceiling is {hi}s. Cut words, never speed the speech")
    elif mode == "range" and lo is not None and estimate < float(lo) - 2.0:
        rep.add("duration", "WARN", detail + f"; range floor is {lo}s. Add a pause or a useful beat, not padding")
    else:
        rep.add("duration", "PASS", detail)

    # Dialogue fidelity after a render: compare an ASR transcript with the script
    if transcript is not None:
        heard = norm(transcript)
        ratio = SequenceMatcher(None, all_text, heard, autojunk=False).ratio()
        rep.add("transcript.similarity", "PASS" if ratio >= 0.9 else "WARN", f"transcript matches the script at {ratio:.2f}")
        for ln in lines:
            if ln.get("locked") or ln.get("role") in ("hook", "action"):
                core = norm(str(ln.get("text", "")))
                if core and core not in heard:
                    rep.add(f"transcript.{ln.get('id')}", "FAIL", f"{ln.get('role')} line not heard verbatim in the transcript")

    return rep.finish({"estimate_seconds": round(estimate, 2), "words": total_words})


def spoken_text(script: dict) -> str:
    """Plain spoken text for a read-through. An ellipsis marks a pause of half a second or more."""
    parts = []
    for ln in script.get("lines", []):
        text = str(ln.get("text", "")).strip()
        pause = ln.get("pause_after", 0) or 0
        parts.append(text + (" ..." if pause >= 0.5 else ""))
    return "\n".join(parts)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("script", help="script.json with the delivery map")
    parser.add_argument("--brief", help="brief.json for locked lines and the spoken script")
    parser.add_argument("--kit", help="brand-kit.json for forbidden claims")
    parser.add_argument("--transcript", help="a plain-text ASR transcript of the rendered take")
    parser.add_argument("--print-spoken", action="store_true", help="print the spoken text with pause marks and exit")
    args = parser.parse_args(argv)
    script = load(args.script)
    if args.print_spoken:
        print(spoken_text(script))
        return 0
    transcript = Path(args.transcript).read_text(encoding="utf-8") if args.transcript else None
    report = check(script, load(args.brief), load(args.kit), transcript)
    print(json.dumps(report, indent=2))
    return 1 if report["verdict"] == "FAIL" else 0


if __name__ == "__main__":
    sys.exit(main())
