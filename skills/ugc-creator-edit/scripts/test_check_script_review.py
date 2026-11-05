"""Synthetic script fixtures; none represents a client, a brand or a real presenter."""
from __future__ import annotations

import copy
import json
import unittest

import check_script as cs


def line(i, role, text, **kw):
    base = {"id": f"L{i}", "role": role, "text": text, "intent": "say the useful thing plainly",
            "emotion": "calm", "intensity": 1, "energy": 1, "gaze": "product", "gesture": "none",
            "pause_after": 0.3, "on_camera": True}
    base.update(kw)
    return base


def good_script():
    return {
        "schema_version": 1,
        "presenter": {"identity": "disclosed_demonstrator", "register": "plain, practical, short sentences"},
        "duration_mode": "range",
        "target_duration_seconds": {"min": 12, "max": 30},
        "words_per_second": 2.4,
        "key_messages": ["pick the step you need and follow it", "less back and forth"],
        "lines": [
            line(1, "hook", "Here's the quickest way to get this done on the first try.",
                 gaze="lens", intensity=2, energy=2, emphasis="quickest way", pause_after=0.6, locked=True),
            line(2, "substance", "Open the app, pick the step you need, follow it, then check your work.",
                 gaze="work", gesture="glance_to_screen", on_camera=False, breath_opportunity=True),
            line(3, "reservation", "It won't do the thinking for you, and it doesn't try to."),
            line(4, "proof", "Less back and forth, more time actually getting it done.", emphasis="actually"),
            line(5, "action", "Next time you sit down to do it, have a look.", gaze="lens", pause_after=0.8),
        ],
    }


def run(script, brief=None, kit=None, transcript=None):
    return cs.check(script, brief, kit, transcript)


def rules(report, verdict):
    return {r["rule"] for r in report["results"] if r["verdict"] == verdict}


class CheckScriptTests(unittest.TestCase):
    def test_good_script_passes_with_no_warnings(self):
        s = good_script()
        report = run(s)
        self.assertEqual(report["verdict"], "PASS", json.dumps(report, indent=2))
        expected_words = sum(cs.words(ln["text"]) for ln in s["lines"])
        pauses = sum(ln["pause_after"] for ln in s["lines"])
        self.assertEqual(report["words"], expected_words)
        self.assertAlmostEqual(report["estimate_seconds"], expected_words / 2.4 + pauses, places=1)
        self.assertEqual(rules(report, "WARN"), set(), json.dumps(report, indent=2))
        self.assertEqual(report["scope"], "text_and_structure_only")
        self.assertEqual(report["timing_basis"], "word_count_estimate")
        self.assertIsNone(report["measured_duration_seconds"])
        self.assertEqual(report["listening_acceptance"], "not_assessed")

    def test_greeting_opener_warns_without_rewriting_copy(self):
        s = good_script()
        s["lines"][0]["text"] = "Hey guys, today I'm going to show you the quickest way."
        s["lines"][0].pop("locked")
        self.assertIn("L1.opener", rules(run(s), "WARN"))
        self.assertNotIn("L1.opener", rules(run(s), "FAIL"))

    def test_digits_and_currency_warn_and_point_to_explicit_aliases(self):
        s = good_script()
        s["lines"][3]["text"] = "It's $40 and takes 10 minutes."
        report = run(s)
        self.assertIn("L4.numbers", rules(report, "WARN"))
        detail = next(r["detail"] for r in report["results"] if r["rule"] == "L4.numbers")
        self.assertIn("pronunciation aliases", detail)

    def test_direction_inside_spoken_text_fails(self):
        for marked in ("[softly] Open the app.", "Open the app. <short pause> Then pick one.", "Open *the* app."):
            with self.subTest(marked=marked):
                s = good_script()
                s["lines"][1]["text"] = marked
                self.assertIn("L2.direction_in_text", rules(run(s), "FAIL"))

    def test_stage_noise_and_parentheticals_warn(self):
        s = good_script()
        s["lines"][1]["text"] = "Um, open the app, and then pick the step you need (it's quick)."
        warned = rules(run(s), "WARN")
        self.assertIn("L2.stage_noise", warned)
        self.assertIn("L2.parenthetical", warned)

    def test_synthetic_presenter_cannot_claim_experience(self):
        s = good_script()
        s["lines"][3]["text"] = "I've been using it for three months and it worked for me."
        self.assertIn("L4.experience", rules(run(s), "FAIL"))
        for identity in ("real_customer", "real_creator"):
            with self.subTest(identity=identity):
                s["presenter"]["identity"] = identity
                self.assertNotIn("L4.experience", rules(run(s), "FAIL"))

    def test_curly_apostrophe_does_not_bypass_synthetic_experience_check(self):
        s = good_script()
        s["lines"][3]["text"] = "I’ve been using this at home."
        self.assertIn("L4.experience", rules(run(s), "FAIL"))
        self.assertEqual(s["lines"][3]["text"], "I’ve been using this at home.")

    def test_unknown_identity_is_a_failure_and_treated_as_synthetic(self):
        s = good_script()
        s["presenter"]["identity"] = "friend"
        s["lines"][3]["text"] = "I bought this last week."
        failed = rules(run(s), "FAIL")
        self.assertIn("presenter.identity", failed)
        self.assertIn("L4.experience", failed)

    def test_locked_opening_must_match_brief(self):
        brief = {"copy_architecture": {"spoken_opening_locked": "Here's the quickest way to get this done on the first try."}}
        self.assertEqual(run(good_script(), brief)["verdict"], "PASS")
        s = good_script()
        s["lines"][0]["text"] = "Here's the little quickest way to get this done on the first try."
        self.assertIn("L1.locked", rules(run(s, brief), "FAIL"))

    def test_lock_source_is_compared_verbatim_after_the_pronunciation_map(self):
        brief = {"copy_architecture": {"cta": "Get it for $40 today."}}
        s = good_script()
        s["pronunciation_map"] = {"$40": "forty dollars"}
        s["lines"][4].update(text="Get it for forty dollars today.", locked=True, lock_source="copy_architecture.cta")
        self.assertNotIn("L5.locked", rules(run(s, brief), "FAIL"))
        s["lines"][4]["text"] = "Get it for forty bucks today."
        self.assertIn("L5.locked", rules(run(s, brief), "FAIL"))
        s["lines"][4]["lock_source"] = "copy_architecture.missing"
        self.assertIn("L5.locked", rules(run(s, brief), "FAIL"))

    def test_locked_source_rejects_truncation_punctuation_and_case_drift(self):
        brief = {"copy_architecture": {"cta": "Get it for forty dollars today."}}
        for changed in ("Get it for forty dollars", "Get it for forty dollars today!", "get it for forty dollars today."):
            with self.subTest(changed=changed):
                s = good_script()
                s["lines"][0]["locked"] = False
                s["lines"][-1].update(text=changed, locked=True, lock_source="copy_architecture.cta")
                self.assertIn("L5.locked", rules(run(s, brief), "FAIL"))

    def test_full_approved_script_needs_exact_reassembly_not_similarity(self):
        s = good_script()
        s["lines"][0]["locked"] = False
        approved = " ".join(ln["text"] for ln in s["lines"])
        brief = {"copy_architecture": {"spoken_script": approved}}
        self.assertNotIn("brief.spoken_script", rules(run(s, brief), "FAIL"))
        # A lost short word used to clear the 90% similarity threshold.
        s["lines"][1]["text"] = s["lines"][1]["text"].replace(" then ", " ")
        self.assertIn("brief.spoken_script", rules(run(s, brief), "FAIL"))
        s = good_script()
        s["lines"][0]["locked"] = False
        s["lines"][1]["text"] = s["lines"][1]["text"].replace(".", "!")
        self.assertIn("brief.spoken_script", rules(run(s, brief), "FAIL"))

    def test_exact_copy_allows_line_whitespace_and_declared_pronunciation_alias(self):
        s = good_script()
        s["lines"][0]["locked"] = False
        s["lines"][-1]["text"] = "Get it for forty dollars today."
        approved = "\n".join(ln["text"] for ln in s["lines"]).replace("forty dollars", "$40")
        s["pronunciation_map"] = {"$40": "forty dollars"}
        self.assertNotIn("brief.spoken_script", rules(run(s, {"copy_architecture": {"spoken_script": approved}}), "FAIL"))

    def test_exact_complete_script_covers_locked_lines_without_duplicate_sources(self):
        s = good_script()
        for ln in s["lines"]:
            ln["locked"] = True
        brief = {"copy_architecture": {"spoken_script": " ".join(ln["text"] for ln in s["lines"])}}
        self.assertEqual(run(s, brief)["verdict"], "PASS")
        s["lines"][2]["text"] = s["lines"][2]["text"].replace("won't", "will")
        self.assertIn("brief.spoken_script", rules(run(s, brief), "FAIL"))

    def test_authorized_locked_greeting_digit_and_stock_hook_get_style_warnings_only(self):
        for opening, style_rule in (("Hello, here's the 3-step approach.", "L1.opener"),
                                    ("Stop scrolling: here's the 3-step approach.", "L1.stock_hook")):
            with self.subTest(opening=opening):
                s = good_script()
                s["lines"][0]["text"] = opening
                s["lines"][0].pop("emphasis")
                brief = {"copy_architecture": {"spoken_opening_locked": opening}}
                report = run(s, brief)
                self.assertEqual(report["verdict"], "PASS", json.dumps(report, indent=2))
                self.assertIn(style_rule, rules(report, "WARN"))
                self.assertIn("L1.numbers", rules(report, "WARN"))
                self.assertEqual(s["lines"][0]["text"], opening)

    def test_locked_opening_punctuation_and_case_changes_fail(self):
        original = good_script()["lines"][0]["text"]
        brief = {"copy_architecture": {"spoken_opening_locked": original}}
        for changed in (original.replace(".", "!"), original.lower()):
            with self.subTest(changed=changed):
                s = good_script()
                s["lines"][0]["text"] = changed
                self.assertIn("L1.locked", rules(run(s, brief), "FAIL"))

    def test_emphasis_must_be_in_the_line(self):
        s = good_script()
        s["lines"][0]["emphasis"] = "secret"
        self.assertIn("L1.emphasis", rules(run(s), "FAIL"))

    def test_sustained_high_intensity_and_flat_are_editorial_warnings(self):
        s = good_script()
        for ln in s["lines"]:
            ln["intensity"] = 3
        self.assertIn("delivery.energy", rules(run(s), "WARN"))
        s = good_script()
        for ln in s["lines"]:
            ln["intensity"] = 1
        self.assertIn("delivery.energy", rules(run(s), "WARN"))

    def test_estimated_range_duration_ceiling_and_floor_warn(self):
        s = good_script()
        s["target_duration_seconds"] = {"min": 5, "max": 10}
        self.assertIn("duration", rules(run(s), "WARN"))
        s["target_duration_seconds"] = {"min": 60, "max": 90}
        self.assertIn("duration", rules(run(s), "WARN"))

    def test_maximum_mode_has_no_floor_and_exact_mode_has_a_tolerance(self):
        s = good_script()
        estimate = run(s)["estimate_seconds"]
        s["duration_mode"], s["target_duration_seconds"] = "maximum", 90
        self.assertEqual(rules(run(s), "WARN") & {"duration"}, set())
        s["target_duration_seconds"] = estimate - 4
        self.assertIn("duration", rules(run(s), "WARN"))
        s["duration_mode"], s["target_duration_seconds"] = "exact", estimate + 1.0
        self.assertNotIn("duration", rules(run(s), "FAIL"))
        s["target_duration_seconds"] = estimate + 4
        self.assertIn("duration", rules(run(s), "WARN"))
        s["duration_mode"] = "approximately"
        self.assertIn("duration_mode", rules(run(s), "FAIL"))

    def test_shape_requires_hook_first_and_action_last(self):
        s = good_script()
        s["lines"][0]["role"] = "substance"
        s["lines"][-1]["role"] = "proof"
        failed = rules(run(s), "FAIL")
        self.assertIn("shape.hook", failed)
        self.assertIn("shape.action", failed)

    def test_key_message_count_is_guidance_but_shape_is_required(self):
        s = good_script()
        s["key_messages"] = ["only one"]
        self.assertIn("key_messages", rules(run(s), "WARN"))
        self.assertNotIn("key_messages", rules(run(s), "FAIL"))
        s["key_messages"] = "not a list"
        self.assertIn("key_messages", rules(run(s), "FAIL"))

    def test_rate_is_an_estimate_but_malformed_rates_fail(self):
        s = good_script()
        s["words_per_second"] = 1.5
        self.assertIn("words_per_second", rules(run(s), "WARN"))
        for invalid in (0, -1, True, "quick", float("nan"), float("inf"), 10 ** 1000):
            with self.subTest(invalid=invalid):
                s["words_per_second"] = invalid
                self.assertIn("words_per_second", rules(run(s), "FAIL"))

    def test_malformed_records_and_duration_values_fail_without_throwing(self):
        for script in ([], {"lines": [None]}, {"lines": ["words"]}):
            self.assertEqual(run(script)["verdict"], "FAIL")
        for invalid in ("soon", {"min": 10, "max": "soon"}, {"min": 40, "max": 30}, float("nan")):
            with self.subTest(invalid=invalid):
                s = good_script()
                s["target_duration_seconds"] = invalid
                self.assertIn("target_duration_seconds", rules(run(s), "FAIL"))
        s = good_script()
        s["pronunciation_map"] = []
        self.assertIn("pronunciation_map", rules(run(s), "FAIL"))
        self.assertIn("brief", rules(run(good_script(), []), "FAIL"))
        self.assertIn("brief.copy_architecture", rules(run(good_script(), {"copy_architecture": []}), "FAIL"))

    def test_unknown_emotion_or_gaze_fails(self):
        s = good_script()
        s["lines"][1]["emotion"] = "ecstatic"
        s["lines"][2]["gaze"] = "camera"
        failed = rules(run(s), "FAIL")
        self.assertIn("L2.emotion", failed)
        self.assertIn("L3.gaze", failed)

    def test_kit_forbidden_claim_fails(self):
        kit = {"claims": {"forbidden_claims": ["on the first try"]}}
        self.assertIn("L1.forbidden", rules(run(good_script(), None, kit), "FAIL"))

    def test_lens_stare_and_friction_warn(self):
        s = good_script()
        for ln in s["lines"]:
            ln["gaze"] = "lens"
        s["lines"][1]["gesture"] = "small_laugh"
        s["lines"][2]["gesture"] = "push_hair"
        warned = rules(run(s), "WARN")
        self.assertIn("delivery.gaze", warned)
        self.assertIn("delivery.friction", warned)

    def test_transcript_fidelity(self):
        s = good_script()
        heard = " ".join(ln["text"] for ln in s["lines"])
        self.assertEqual(run(s, transcript=heard)["verdict"], "PASS")
        heard_wrong = heard.replace("quickest way", "easy trick")
        self.assertIn("transcript.L1", rules(run(s, transcript=heard_wrong), "FAIL"))

    def test_print_spoken_marks_pauses_with_punctuation_only(self):
        text = cs.spoken_text(good_script())
        self.assertTrue(text.splitlines()[0].endswith("..."))
        self.assertFalse(text.splitlines()[1].endswith("..."))
        self.assertNotRegex(text, r"[\[\]<>*]")

    def test_cli_exit_codes(self):
        import io
        import contextlib
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "script.json"
            path.write_text(json.dumps(good_script()), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cs.main([str(path)]), 0)
            bad = copy.deepcopy(good_script())
            bad["lines"][0]["role"] = "unknown_role"
            path.write_text(json.dumps(bad), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cs.main([str(path)]), 1)


if __name__ == "__main__":
    unittest.main()
