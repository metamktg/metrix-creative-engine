"""Synthetic local contract tests; no test fixture represents actual approval."""
from __future__ import annotations

import copy
import contextlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest import mock
import uuid

import validate_review_gates as gate


def write_artifact(root: Path, relative: str, content) -> dict:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    if not isinstance(content, bytes):
        content = json.dumps(content, sort_keys=True).encode("utf-8")
    path.write_bytes(content)
    return {"path": relative, "sha256": gate.file_hash(path)}


def rebind(record: dict):
    digest = gate.bundle_hash(record)
    for review in record["gates"].values():
        review["master_sha256"] = record["artifacts"]["master"]["sha256"]
        review["bundle_sha256"] = digest


def make_valid_record(root: Path) -> dict:
    """Genuine hashed files plus synthetic attestations, never real media review."""
    artifacts = {}
    for role in gate.ARTIFACT_ROLES:
        content = ("synthetic unit-test artifact: " + role).encode()
        if role == "profile":
            content = {"fps": 30, "sound_check_required_facts": {
                "message": ["The generic offer is understood."],
                "benefit": ["The useful outcome is understood."],
                "action": ["The stated next step is understood."],
                "conditions": ["The stated condition is understood."],
            }}
        elif role == "registry":
            content = {"approved_codes": ["CODE_A", "CODE_B"]}
        artifacts[role] = write_artifact(root, "artifacts/" + role + ".bin", content)
    record = {
        "schema_version": 1,
        "artifacts": artifacts,
        "contributors": {"producer_ids": ["producer-01"], "editor_ids": ["editor-01"]},
        "iap": {
            "mode": "standard", "codes": ["CODE_A"],
            "applicability": {"decision": "applicable", "reason": "Use the pinned generic test stack.",
                              "reviewer_id": "technical-reviewer"},
            "matrix_locks_verified": None,
        },
        "production": {
            "music": {"decision": "intentional_none",
                      "rationale": "Deliberate silence preserves the clear spoken explanation in this synthetic fixture.",
                      "reviewer_id": "editorial-reviewer"},
            "broll": {"output_reviewed": True, "source_quality_reviewed": True,
                      "source_ranges_verified": True,
                      "acceptance_criteria": ["Action is coherent.", "Evidence stays readable."]},
            "speed": {"playback_speed": 1, "speech_retimed": False,
                      "visible_speech_synchronized": True, "map_reviewed": True, "map": []},
        },
        "gates": {},
    }
    identities = {
        "iap_variables": ("technical-reviewer", "automated"),
        "communications": ("copy-reviewer", "human"),
        "sound_check": ("lay-reviewer", "human"),
        "editorial_peer": ("editorial-reviewer", "human"),
        "blind_review": ("blind-reviewer", "human"),
    }
    for i, (name, checks) in enumerate(gate.GATE_CHECKS.items()):
        ref = write_artifact(root, "evidence/" + name + ".json",
                             {"fixture": "Synthetic attestation only, not real approval.", "gate": name})
        methods = ["artifact_check"]
        if name == "communications":
            methods = ["text_review"]
        elif name == "sound_check":
            methods = ["full_audio_1x", "muted_phone"]
        elif name in ("editorial_peer", "blind_review"):
            methods = ["full_av_1x", "muted_phone"]
        reviewer_id, kind = identities[name]
        record["gates"][name] = {
            "status": "PASS", "reviewer": {"id": reviewer_id, "kind": kind},
            "completed_at": "2026-01-01T12:0" + str(i) + ":00+00:00",
            "evidence": [{**ref, "method": method} for method in methods],
            "checks": {item: True for item in checks}, "blocking_defects": [],
        }
    record["gates"]["sound_check"]["sound_check"] = {
        "full_listen": True, "playback_speed": 1, "script_primed": False,
        "first_exposure": True, "phone_muted": True,
        "answers": {key: "Synthetic unprompted answer for " + key for key in gate.FACTS},
        "comparison": {key: True for key in gate.FACTS},
    }
    packet = write_artifact(root, "blind/packet.json",
                            {"neutral_id": "candidate-001", "fixture": "Synthetic blind protocol test."})
    review_copy = write_artifact(root, "blind/copy.bin", (root / artifacts["master"]["path"]).read_bytes())
    artifacts["blind_packet"] = packet
    artifacts["blind_copy"] = review_copy
    record["gates"]["blind_review"]["blind"] = {
        "scope": "process_blind", "fresh_reviewer": True, "prior_history_seen": False,
        "prior_feedback_seen": False, "residual_cues_reviewed": True,
        "residual_identity_cues": ["Some identity cues remain visible in the actual media."],
        "packet": packet, "review_copy": review_copy,
        "verdict_locked_at": "2026-01-01T12:04:00+00:00",
        "unblinded_at": "2026-01-01T12:05:00+00:00",
        "excluded_information": sorted(gate.BLIND_EXCLUSIONS),
    }
    rebind(record)
    return record


class ReviewGateTests(unittest.TestCase):
    def setUp(self):
        # Python3.14's Windows0700 tempfile ACL excludes restricted test tokens.
        # Normal inherited permissions are appropriate for synthetic local data.
        self.root = Path(__file__).parent / ("review-test-" + uuid.uuid4().hex)
        self.root.mkdir(mode=0o777)
        self.addCleanup(self.cleanup_fixture)
        self.record = make_valid_record(self.root)

    def cleanup_fixture(self):
        expected = Path(__file__).parent.resolve()
        actual = self.root.resolve()
        self.assertEqual(actual.parent, expected)
        self.assertTrue(actual.name.startswith("review-test-"))
        shutil.rmtree(actual)

    def verdict(self, expected, record=None):
        result = gate.validate_record(self.record if record is None else record, self.root)
        self.assertEqual(result["status"], expected, json.dumps(result, indent=2))
        self.assertEqual(result["exit_code"], {"READY": 0, "FAIL": 1, "NOT_CHECKED": 2}[expected])
        self.assertEqual(result["approved_for_presentation"], expected == "READY")
        return result

    def test_complete_hashed_synthetic_fixture(self):
        self.verdict("READY")

    def test_pending_reviews_are_not_quality_passes_or_failures(self):
        self.record["gates"] = {name: {"status": "PENDING"} for name in gate.GATE_CHECKS}
        self.verdict("NOT_CHECKED")

    def test_missing_gate_is_not_checked(self):
        del self.record["gates"]["sound_check"]
        self.verdict("NOT_CHECKED")

    def test_unavailable_review_is_not_checked(self):
        self.record["gates"]["blind_review"] = {"status": "UNAVAILABLE"}
        self.verdict("NOT_CHECKED")

    def test_explicit_rejection_is_failure(self):
        self.record["gates"]["communications"]["status"] = "FAIL"
        self.verdict("FAIL")

    def test_failed_required_check_blocks_release(self):
        self.record["gates"]["communications"]["checks"]["offer_conditions_clear"] = False
        self.verdict("FAIL")

    def test_missing_check_is_not_checked(self):
        del self.record["gates"]["communications"]["checks"]["offer_conditions_clear"]
        self.verdict("NOT_CHECKED")

    def test_missing_evidence_file_is_not_checked(self):
        evidence = self.record["gates"]["editorial_peer"]["evidence"][0]
        (self.root / evidence["path"]).unlink()
        self.verdict("NOT_CHECKED")

    def test_missing_context_file_is_not_checked(self):
        (self.root / self.record["artifacts"]["registry"]["path"]).unlink()
        self.verdict("NOT_CHECKED")

    def test_missing_context_descriptor_is_not_checked(self):
        del self.record["artifacts"]["script"]
        self.verdict("NOT_CHECKED")

    def test_tampered_master_fails(self):
        (self.root / self.record["artifacts"]["master"]["path"]).write_bytes(b"changed")
        self.verdict("FAIL")

    def test_tampered_evidence_fails(self):
        evidence = self.record["gates"]["sound_check"]["evidence"][0]
        (self.root / evidence["path"]).write_bytes(b"changed")
        self.verdict("FAIL")

    def test_changed_script_with_new_declared_hash_stales_reviews(self):
        self.record["artifacts"]["script"] = write_artifact(self.root, "artifacts/script.bin", b"new words")
        self.verdict("FAIL")

    def test_changed_voice_or_captions_stales_reviews(self):
        for role in ("voice", "captions"):
            with self.subTest(role=role):
                changed = copy.deepcopy(self.record)
                changed["artifacts"][role] = write_artifact(self.root, "artifacts/" + role + ".bin", b"new bytes")
                self.verdict("FAIL", changed)

    def test_context_edits_stale_reviews_even_when_media_unchanged(self):
        mutations = [
            lambda r: r["production"]["music"].update(
                rationale="A different intentional-silence rationale changes the approved edit plan."),
            lambda r: r["production"]["speed"]["map"].append(
                {"kind": "broll", "source_in": 0, "source_out": 2,
                 "output_in": 0, "output_out": 1, "speed": 2}),
            lambda r: r["iap"].update(codes=["CODE_B"]),
            lambda r: r["contributors"]["editor_ids"].append("editor-02"),
        ]
        for mutate in mutations:
            changed = copy.deepcopy(self.record)
            mutate(changed)
            self.verdict("FAIL", changed)

    def test_registry_membership_is_exact_not_prefix_matching(self):
        self.record["iap"]["codes"] = ["CODE_A_unknown"]
        rebind(self.record)
        self.verdict("FAIL")

    def test_empty_standard_codes_need_explicit_applicability(self):
        self.record["iap"]["codes"] = []
        self.record["iap"]["applicability"]["decision"] = "not_applicable"
        rebind(self.record)
        self.verdict("READY")
        self.record["iap"]["applicability"]["reason"] = ""
        rebind(self.record)
        self.verdict("FAIL")

    def test_matrix_cannot_bypass_variable_or_lock_check(self):
        self.record["iap"]["mode"] = "matrix"
        self.record["iap"]["matrix_locks_verified"] = False
        rebind(self.record)
        self.verdict("FAIL")

    def test_contributor_cannot_be_editorial_peer(self):
        self.record["gates"]["editorial_peer"]["reviewer"]["id"] = "editor-01"
        self.verdict("FAIL")

    def test_sound_reviewer_cannot_be_copy_reviewer(self):
        self.record["gates"]["sound_check"]["reviewer"]["id"] = "copy-reviewer"
        self.verdict("FAIL")

    def test_sound_reviewer_cannot_be_technical_reviewer(self):
        self.record["gates"]["sound_check"]["reviewer"]["id"] = "technical-reviewer"
        self.verdict("FAIL")

    def test_sound_reviewer_cannot_already_be_editorial_reviewer(self):
        self.record["gates"]["sound_check"]["reviewer"]["id"] = "editorial-reviewer"
        self.record["gates"]["editorial_peer"]["completed_at"] = "2026-01-01T12:02:00+00:00"
        self.record["gates"]["sound_check"]["completed_at"] = "2026-01-01T12:03:00+00:00"
        self.verdict("FAIL")

    def test_sound_reviewer_cannot_be_an_applicability_reviewer(self):
        self.record["iap"]["applicability"]["reviewer_id"] = "lay-reviewer"
        rebind(self.record)
        self.verdict("FAIL")

    def test_blind_reviewer_cannot_be_an_applicability_reviewer(self):
        self.record["iap"]["applicability"]["reviewer_id"] = "blind-reviewer"
        rebind(self.record)
        self.verdict("FAIL")

    def test_contextual_music_reviewer_cannot_be_sound_or_blind_reviewer(self):
        music = {
            "decision": "selected", "reviewer_id": "lay-reviewer",
            "asset": write_artifact(self.root, "music/asset.bin", b"synthetic audio"),
            "stem": write_artifact(self.root, "music/stem.bin", b"synthetic stem"),
            "license": write_artifact(self.root, "music/rights.json", {"fixture": "Not real rights."}),
            "paid_ad_use_verified": True, "ducking_reviewed": True, "fades_reviewed": True,
        }
        self.record["production"]["music"] = music
        for reviewer in ("lay-reviewer", "blind-reviewer"):
            with self.subTest(reviewer=reviewer):
                music["reviewer_id"] = reviewer
                rebind(self.record)
                self.verdict("FAIL")

    def test_case_and_whitespace_cannot_alias_contributors(self):
        self.record["gates"]["editorial_peer"]["reviewer"]["id"] = "  Editor-01 "
        self.record["production"]["music"]["reviewer_id"] = "EDITOR-01"
        rebind(self.record)
        self.verdict("FAIL")

    def test_case_and_whitespace_cannot_alias_sound_gate_reviewers(self):
        self.record["gates"]["sound_check"]["reviewer"]["id"] = " Copy-Reviewer "
        self.verdict("FAIL")

    def test_case_and_whitespace_cannot_alias_context_reviewers(self):
        self.record["iap"]["applicability"]["reviewer_id"] = " BLIND-REVIEWER "
        rebind(self.record)
        self.verdict("FAIL")

    def test_case_and_whitespace_cannot_alias_blind_to_producer(self):
        self.record["gates"]["blind_review"]["reviewer"]["id"] = " Producer-01 "
        self.verdict("FAIL")

    def test_music_exception_reference_compares_normalized_identity(self):
        self.record["production"]["music"]["reviewer_id"] = " Editorial-Reviewer "
        rebind(self.record)
        self.verdict("READY")

    def test_blind_reviewer_cannot_be_any_prior_reviewer(self):
        self.record["gates"]["blind_review"]["reviewer"]["id"] = "lay-reviewer"
        self.verdict("FAIL")

    def test_frame_only_evidence_does_not_prove_listening(self):
        self.record["gates"]["sound_check"]["evidence"][0]["method"] = "frame_inspection"
        self.verdict("NOT_CHECKED")

    def test_text_agent_cannot_claim_audio_review(self):
        self.record["gates"]["sound_check"]["reviewer"]["kind"] = "agent"
        self.verdict("NOT_CHECKED")

    def test_audio_capable_agent_requires_explicit_capability(self):
        reviewer = self.record["gates"]["sound_check"]["reviewer"]
        reviewer["kind"] = "audio_capable_agent"
        self.verdict("NOT_CHECKED")
        reviewer["capability"] = "Full-file audio perception available; synthetic test declaration only."
        self.verdict("READY")

    def test_script_priming_or_fast_playback_rejects_sound_check(self):
        data = self.record["gates"]["sound_check"]["sound_check"]
        data["script_primed"] = True
        self.verdict("FAIL")
        data["script_primed"] = False
        data["playback_speed"] = 1.5
        self.verdict("FAIL")

    def test_unprompted_answers_and_comparison_are_required(self):
        data = self.record["gates"]["sound_check"]["sound_check"]
        data["answers"]["action"] = ""
        self.verdict("NOT_CHECKED")
        data["answers"]["action"] = "Synthetic next step."
        data["comparison"]["conditions"] = False
        self.verdict("FAIL")

    def test_blind_packet_and_derivative_are_hash_verified(self):
        descriptor = self.record["gates"]["blind_review"]["blind"]["review_copy"]
        (self.root / descriptor["path"]).write_bytes(b"different derivative")
        self.verdict("FAIL")

    def test_unrelated_newly_hashed_blind_copy_cannot_replace_bound_copy(self):
        self.record["gates"]["blind_review"]["blind"]["review_copy"] = write_artifact(
            self.root, "blind/unrelated.bin", b"unrelated freshly hashed bytes")
        self.verdict("FAIL")

    def test_newly_hashed_blind_packet_cannot_replace_bound_packet(self):
        self.record["gates"]["blind_review"]["blind"]["packet"] = write_artifact(
            self.root, "blind/replacement.json", {"fixture": "Different review instructions."})
        self.verdict("FAIL")

    def test_changing_bound_blind_copy_stales_all_prior_gates(self):
        self.record["artifacts"]["blind_copy"] = write_artifact(
            self.root, "blind/replacement.bin", b"new candidate review copy")
        result = self.verdict("FAIL")
        stale = [issue for issue in result["issues"] if issue["field"].endswith(".bundle_sha256")]
        self.assertEqual(len(stale), 5)

    def test_early_blind_verdict_lock_cannot_be_hidden_by_later_completion(self):
        self.record["gates"]["blind_review"]["blind"]["verdict_locked_at"] = "2026-01-01T11:00:00+00:00"
        self.verdict("FAIL")

    def test_blind_history_and_early_unblinding_fail(self):
        blind = self.record["gates"]["blind_review"]["blind"]
        blind["prior_history_seen"] = True
        self.verdict("FAIL")
        blind["prior_history_seen"] = False
        blind["unblinded_at"] = "2026-01-01T12:03:00+00:00"
        self.verdict("FAIL")

    def test_blind_is_final_and_cannot_overclaim_anonymity(self):
        blind = self.record["gates"]["blind_review"]
        blind["completed_at"] = "2026-01-01T12:02:00+00:00"
        blind["blind"]["verdict_locked_at"] = blind["completed_at"]
        self.verdict("FAIL")
        blind["completed_at"] = "2026-01-01T12:04:00+00:00"
        blind["blind"]["verdict_locked_at"] = blind["completed_at"]
        blind["blind"]["scope"] = "fully_anonymous"
        self.verdict("FAIL")

    def test_missing_residual_cue_declaration_fails(self):
        del self.record["gates"]["blind_review"]["blind"]["residual_identity_cues"]
        self.verdict("FAIL")

    def test_selected_music_requires_hashed_rights_stem_and_mix_review(self):
        music = {
            "decision": "selected", "reviewer_id": "editorial-reviewer",
            "asset": write_artifact(self.root, "music/asset.bin", b"synthetic audio"),
            "stem": write_artifact(self.root, "music/stem.bin", b"synthetic stem"),
            "license": write_artifact(self.root, "music/rights.json", {"fixture": "Not real music rights."}),
            "paid_ad_use_verified": True, "ducking_reviewed": True, "fades_reviewed": True,
        }
        self.record["production"]["music"] = music
        rebind(self.record)
        self.verdict("READY")
        music["paid_ad_use_verified"] = False
        rebind(self.record)
        self.verdict("FAIL")

    def test_valid_music_decision_change_invalidates_all_prior_gates(self):
        self.record["production"]["music"] = {
            "decision": "selected", "reviewer_id": "editorial-reviewer",
            "asset": write_artifact(self.root, "music/asset.bin", b"synthetic audio"),
            "stem": write_artifact(self.root, "music/stem.bin", b"synthetic stem"),
            "license": write_artifact(self.root, "music/rights.json", {"fixture": "Not real rights."}),
            "paid_ad_use_verified": True, "ducking_reviewed": True, "fades_reviewed": True,
        }
        result = self.verdict("FAIL")
        stale = [item for item in result["issues"] if item["field"].endswith(".bundle_sha256")]
        self.assertEqual(len(stale), 5)

    def test_intentional_silence_needs_reason_and_reviewer(self):
        self.record["production"]["music"]["rationale"] = "None"
        rebind(self.record)
        self.verdict("FAIL")

    def test_producer_cannot_approve_intentional_silence(self):
        self.record["production"]["music"]["reviewer_id"] = "producer-01"
        rebind(self.record)
        self.verdict("FAIL")

    def test_speed_tolerance_uses_bound_profile_frame_rate(self):
        speed = self.record["production"]["speed"]
        speed["map"] = [{"kind": "broll", "source_in": 0, "source_out": 1.04,
                         "output_in": 0, "output_out": 1, "speed": 1}]
        profile_path = self.root / self.record["artifacts"]["profile"]["path"]
        profile = json.loads(profile_path.read_text())
        for fps, status in ((24, "READY"), (60, "FAIL")):
            profile["fps"] = fps
            self.record["artifacts"]["profile"] = write_artifact(
                self.root, "artifacts/profile.bin", profile)
            rebind(self.record)
            self.verdict(status)

    def test_speed_map_with_missing_frame_rate_is_not_checked(self):
        self.record["production"]["speed"]["map"] = [
            {"kind": "broll", "source_in": 0, "source_out": 1,
             "output_in": 0, "output_out": 1, "speed": 1}]
        profile_path = self.root / self.record["artifacts"]["profile"]["path"]
        profile = json.loads(profile_path.read_text())
        del profile["fps"]
        self.record["artifacts"]["profile"] = write_artifact(self.root, "artifacts/profile.bin", profile)
        rebind(self.record)
        self.verdict("NOT_CHECKED")

    def test_unreviewed_broll_is_not_ready(self):
        self.record["production"]["broll"]["output_reviewed"] = False
        rebind(self.record)
        self.verdict("FAIL")

    def test_unsynced_speech_retiming_fails(self):
        speed = self.record["production"]["speed"]
        speed.update(speech_retimed=True, visible_speech_synchronized=False,
                     speech_audio_video_together=True, pitch_preserved=True, retime_approved=True,
                     map=[{"kind": "speech", "source_in": 0, "source_out": 2,
                           "output_in": 0, "output_out": 1, "speed": 2}])
        rebind(self.record)
        self.verdict("FAIL")

    def test_false_speed_duration_or_nan_fails(self):
        speed = self.record["production"]["speed"]
        speed["map"] = [{"kind": "broll", "source_in": 0, "source_out": 2,
                         "output_in": 0, "output_out": 2, "speed": 2}]
        rebind(self.record)
        self.verdict("FAIL")
        speed["map"][0]["speed"] = float("nan")
        self.verdict("FAIL")

    def test_unsafe_paths_urls_drives_and_traversal_fail(self):
        for value in ("../outside.bin", "/absolute.bin", "https://example.invalid/file",
                      "C:\\outside.bin", "\\\\host\\share\\file", "a/../b.bin"):
            with self.subTest(value=value):
                changed = copy.deepcopy(self.record)
                changed["artifacts"]["master"]["path"] = value
                self.verdict("FAIL", changed)

    def test_real_symlink_is_not_followed(self):
        target = self.root / "artifacts/master.bin"
        link = self.root / "linked-master.bin"
        try:
            link.symlink_to(target)
        except (OSError, NotImplementedError):
            self.skipTest("This host does not permit creating symlinks.")
        self.record["artifacts"]["master"]["path"] = "linked-master.bin"
        self.verdict("FAIL")

    def test_root_addressed_through_a_junction_is_resolved(self):
        # A checkout can be reached through a junction onto another drive. The run
        # is real; only the address crosses a link.
        if sys.platform != "win32":
            self.skipTest("Junctions are a Windows construct.")
        import _winapi
        link = Path(__file__).parent / ("review-junction-" + uuid.uuid4().hex)
        try:
            _winapi.CreateJunction(str(self.root), str(link))
        except OSError:
            self.skipTest("This host does not permit creating junctions.")
        self.addCleanup(link.rmdir)
        result = gate.validate_record(self.record, link)
        self.assertEqual(result["status"], "READY", json.dumps(result, indent=2))
        self.assertEqual(Path(result["root"]), self.root.resolve())
        self.assertEqual(Path(result["root_given"]), link.absolute())

    def test_unsafe_root_never_reads_artifact_bytes(self):
        with mock.patch.object(gate.Validator, "_link", return_value=True):
            with mock.patch.object(gate, "file_hash", side_effect=AssertionError("Unsafe read")):
                self.verdict("FAIL")

    def test_unknown_gate_or_schema_fails(self):
        self.record["gates"]["extra"] = {"status": "PASS"}
        self.verdict("FAIL")
        del self.record["gates"]["extra"]
        self.record["schema_version"] = 999
        self.verdict("FAIL")

    def test_unknown_check_cannot_hide_in_versioned_gate(self):
        self.record["gates"]["communications"]["checks"]["unrecognized_check"] = True
        self.verdict("FAIL")

    def test_wrong_nested_types_are_failures_not_crashes(self):
        for change in (
            lambda r: r["gates"]["sound_check"].update(reviewer=[]),
            lambda r: r["gates"]["sound_check"]["reviewer"].update(kind=[]),
            lambda r: r["gates"]["sound_check"]["evidence"][0].update(method=[]),
            lambda r: r["artifacts"].update(master="wrong-type"),
        ):
            changed = copy.deepcopy(self.record)
            change(changed)
            self.verdict("FAIL", changed)

    def test_complete_run_root_can_move_without_changing_reviews(self):
        relocated = self.root / "portable"
        relocated.mkdir()
        for child in list(self.root.iterdir()):
            if child != relocated:
                if child.is_dir():
                    shutil.copytree(child, relocated / child.name)
                else:
                    shutil.copy2(child, relocated / child.name)
        result = gate.validate_record(self.record, relocated)
        self.assertEqual(result["status"], "READY", result)

    def test_cli_exit_codes_and_json_output(self):
        record_path = self.root / "review.json"
        script = Path(gate.__file__).resolve()
        for expected in (0, 2, 1):
            if expected == 2:
                self.record["gates"]["sound_check"] = {"status": "PENDING"}
            elif expected == 1:
                self.record["gates"]["communications"]["status"] = "FAIL"
            record_path.write_text(json.dumps(self.record), encoding="utf-8")
            process = subprocess.run(
                [sys.executable, "-B", str(script), str(record_path), "--root", str(self.root)],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(process.returncode, expected, process.stdout + process.stderr)
            self.assertEqual(json.loads(process.stdout)["exit_code"], expected)

    def test_malformed_json_cli_is_failure(self):
        path = self.root / "review.json"
        path.write_text("{broken", encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main([str(path), "--root", str(self.root)]), 1)

    def test_duplicate_keys_and_nonstandard_numeric_json_fail(self):
        path = self.root / "review.json"
        for text in ('{"schema_version":1,"schema_version":1}', '{"schema_version":NaN}'):
            path.write_text(text, encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(gate.main([str(path), "--root", str(self.root)]), 1)

    def test_boolean_schema_version_is_not_version_one(self):
        self.record["schema_version"] = True
        self.verdict("FAIL")


if __name__ == "__main__":
    unittest.main()
