"""Safety tests use synthetic temporary files; never real creative assets."""
import copy
import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import stat
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from retain_drafts import RetentionError, _canonical_key, _checked_path, _relative, apply_plan, build_plan, main


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.test_parent = Path(__file__).resolve().parent
        self.root = self.test_parent / ("retention-test-" + uuid.uuid4().hex)
        self.root.mkdir(mode=0o777)
        self.addCleanup(self.cleanup)
        self.index = {"schemaVersion": 1, "protectedPaths": [], "currentRevisionId": "r5",
                      "pinnedRevisionIds": [], "revisions": []}
        for number in range(1, 6):
            name = f"renders/r{number}.mp4"
            self.write(name, f"synthetic revision {number}")
            self.index["revisions"].append({"id": f"r{number}", "status": "successful",
                "completedAt": f"2026-01-0{number}T00:00:00Z", "references": [],
                "artifacts": [self.artifact(name)]})
        self.save()

    def cleanup(self):
        actual = self.root.resolve()
        self.assertEqual(actual.parent, self.test_parent)
        self.assertTrue(actual.name.startswith("retention-test-"))
        shutil.rmtree(actual)

    @staticmethod
    def artifact(path, kind="revision_render", disposable=True, references=None):
        return {"path": path, "kind": kind, "disposable": disposable, "references": references or []}

    def write(self, relative, text="synthetic asset"):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def save(self):
        self.write("retention-index.json", json.dumps(self.index))

    def plan(self):
        return build_plan(self.root, "retention-index.json")

    def paths(self):
        return [candidate["path"] for candidate in self.plan()["candidates"]]

    def apply(self, plan):
        return apply_plan(self.root, "retention-index.json", plan, self.root / ".retention/audit.jsonl")

    def test_dry_run_keeps_latest_three_and_never_changes_files(self):
        before = {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        plan = self.plan()
        self.assertEqual([c["path"] for c in plan["candidates"]], ["renders/r1.mp4", "renders/r2.mp4"])
        self.assertEqual(plan["retainedRevisionIds"], ["r3", "r4", "r5"])
        after = {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_apply_unlinks_exact_files_leaves_unindexed_media_and_evidence(self):
        self.write("renders/unindexed.mp4")
        self.write("source/raw.mp4")
        self.assertEqual(self.apply(self.plan()), ["renders/r1.mp4", "renders/r2.mp4"])
        for name in ["renders/r3.mp4", "renders/r4.mp4", "renders/r5.mp4", "renders/unindexed.mp4", "source/raw.mp4", "retention-index.json"]:
            self.assertTrue((self.root / name).exists(), name)
        events = [json.loads(line) for line in (self.root / ".retention/audit.jsonl").read_text().splitlines()]
        self.assertEqual([e["event"] for e in events], ["begin", "delete_intent", "deleted", "delete_intent", "deleted", "complete"])
        self.assertFalse((self.root / ".retention/cleanup.lock").exists())

    def test_current_and_pins_are_additional_to_three_latest(self):
        self.index["currentRevisionId"] = "r1"
        self.index["pinnedRevisionIds"] = ["r2"]
        self.save()
        self.assertEqual(self.paths(), [])
        self.assertEqual(self.plan()["retainedRevisionIds"], ["r1", "r2", "r3", "r4", "r5"])

    def test_failed_and_in_progress_sets_do_not_advance_retention(self):
        for status in ["failed", "in_progress"]:
            with self.subTest(status=status):
                self.index["revisions"][1]["status"] = status
                self.save()
                self.assertEqual(self.paths(), ["renders/r1.mp4"])

    def test_shared_alias_and_global_dependency_references_are_protected(self):
        self.index["revisions"][4]["references"] = ["RENDERS/R1.mp4" if os.name == "nt" else "renders/r1.mp4"]
        self.index["revisions"][4]["artifacts"][0]["references"] = ["renders/r2.mp4"]
        self.save()
        self.assertEqual(self.paths(), [])

    def test_canonical_alias_of_protected_file_is_not_deleted(self):
        self.write("renders/OLD~1.mp4")
        self.index["revisions"][4]["references"] = ["renders/OLD~1.mp4"]
        self.save()
        def canonical(root, relative):
            return "renders/r1.mp4" if relative == "renders/OLD~1.mp4" else _canonical_key(root, relative)
        with patch("retain_drafts._canonical_key", canonical):
            self.assertEqual(self.paths(), ["renders/r2.mp4"])

    def test_missing_rebuild_source_dependency_blocks_cleanup(self):
        self.index["revisions"][0]["artifacts"][0]["references"] = ["source/missing-generated.mp4"]
        self.save()
        with self.assertRaises(RetentionError):
            self.plan()
        self.assertTrue((self.root / "renders/r1.mp4").exists())

    @unittest.skipUnless(os.name == "nt", "Physical DOS aliases require Windows")
    def test_windows_short_alias_cannot_bypass_generated_folder_guard(self):
        import ctypes
        self.write("generated/old.mp4")
        buffer = ctypes.create_unicode_buffer(32768)
        get_short = ctypes.windll.kernel32.GetShortPathNameW
        get_short.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32]
        get_short.restype = ctypes.c_uint32
        length = get_short(str(self.root / "generated"), buffer, len(buffer))
        if not length or Path(buffer.value).name.casefold() == "generated":
            self.skipTest("DOS short names unavailable on this volume")
        alias = Path(buffer.value).name + "/old.mp4"
        self.index["revisions"][0]["artifacts"].append(self.artifact(alias))
        self.save()
        self.assertNotIn(alias, self.paths())
        self.assertIn(alias, self.plan()["protectedOutputs"])

    def test_source_roles_cannot_be_made_disposable(self):
        kinds = ["raw_source", "generated_source", "source_reference", "voice_stem", "music_stem", "recipe", "ledger", "evidence", "unknown"]
        for kind in kinds:
            with self.subTest(kind=kind):
                name = f"assets/{kind}.bin"
                self.write(name)
                self.index["revisions"][0]["artifacts"].append(self.artifact(name, kind=kind))
        self.save()
        self.assertEqual(self.paths(), ["renders/r1.mp4", "renders/r2.mp4"])

    def test_protected_folders_and_non_disposable_artifacts_are_preserved(self):
        for folder in ["source", "sources", "raw", "generated", "references", "voices", "music", "stems", "recipes", "ledgers", "evidence", ".retention"]:
            path = f"{folder}/mislabeled.mp4"
            self.write(path)
            self.index["revisions"][0]["artifacts"].append(self.artifact(path))
        self.index["revisions"][0]["artifacts"][0]["disposable"] = False
        self.index["protectedPaths"] = ["renders/r2.mp4"]
        self.save()
        self.assertEqual(self.paths(), [])

    def test_protected_directory_blocks_descendants(self):
        self.index["protectedPaths"] = ["renders"]
        self.save()
        self.assertEqual(self.paths(), [])

    def test_unsafe_portable_paths_are_rejected(self):
        for name in ["../outside.mp4", "/tmp/x", "C:/x", "C:x", "//server/share", "renders\\x", "a//b", "a/./b", "a/../b", "a/file:stream", "a/thing.", "a/thing ", "a/CON.txt", "a/*", "a/\x00"]:
            with self.subTest(path=name), self.assertRaises(RetentionError):
                _relative(name)

    def test_directory_candidate_rejected(self):
        (self.root / "renders/r1.mp4").unlink()
        (self.root / "renders/r1.mp4").mkdir()
        with self.assertRaises(RetentionError):
            self.plan()

    def test_hardlinked_candidate_rejected(self):
        try:
            os.link(self.root / "renders/r1.mp4", self.root / "raw-link.mp4")
        except OSError as error:
            self.skipTest(f"Hardlinks unavailable: {error}")
        with self.assertRaises(RetentionError):
            self.plan()

    def test_symlink_candidate_and_ancestor_rejected(self):
        target = self.write("outside.txt")
        for directory in [False, True]:
            with self.subTest(directory=directory):
                leaf = self.root / ("alias-dir" if directory else "alias.mp4")
                try:
                    leaf.symlink_to(self.root / "renders" if directory else target, target_is_directory=directory)
                except OSError as error:
                    self.skipTest(f"Symlink creation unavailable: {error}")
                try:
                    with self.assertRaises(RetentionError):
                        _checked_path(self.root, "alias-dir/r1.mp4" if directory else "alias.mp4")
                finally:
                    leaf.unlink()

    def test_windows_reparse_point_attribute_rejected(self):
        original = Path.lstat
        def lstat(path):
            if path == self.root / "junction":
                return SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0x400)
            return original(path)
        with patch.object(Path, "lstat", lstat), self.assertRaises(RetentionError):
            _checked_path(self.root, "junction/file.mp4")

    def test_changed_last_candidate_preflight_prevents_all_deletions(self):
        plan = self.plan()
        self.write("renders/r2.mp4", "changed")
        with self.assertRaises(RetentionError):
            self.apply(plan)
        self.assertTrue((self.root / "renders/r1.mp4").exists())
        self.assertFalse((self.root / ".retention/audit.jsonl").exists())

    def test_changed_index_or_modified_plan_prevents_deletion(self):
        plan = self.plan()
        modified = copy.deepcopy(plan)
        modified["candidates"][0]["path"] = "renders/r3.mp4"
        with self.assertRaises(RetentionError):
            self.apply(modified)
        self.index["protectedPaths"] = ["renders/r1.mp4"]
        self.save()
        with self.assertRaises(RetentionError):
            self.apply(plan)
        self.assertTrue((self.root / "renders/r1.mp4").exists())

    def test_incomplete_retained_success_blocks_cleanup(self):
        (self.root / "renders/r5.mp4").unlink()
        with self.assertRaises(RetentionError):
            self.plan()

    def test_malformed_identity_status_and_timestamp_block_cleanup(self):
        original = copy.deepcopy(self.index)
        for change in ["duplicate", "unknown_status", "naive_time", "tied_time", "unknown_pin", "empty_set"]:
            with self.subTest(change=change):
                self.index = copy.deepcopy(original)
                if change == "duplicate":
                    self.index["revisions"][1]["id"] = "r1"
                elif change == "unknown_status":
                    self.index["revisions"][1]["status"] = "done"
                elif change == "naive_time":
                    self.index["revisions"][1]["completedAt"] = "2026-01-02T00:00:00"
                elif change == "tied_time":
                    self.index["revisions"][1]["completedAt"] = self.index["revisions"][0]["completedAt"]
                elif change == "unknown_pin":
                    self.index["pinnedRevisionIds"] = ["absent"]
                else:
                    self.index["revisions"][0]["artifacts"] = []
                self.save()
                with self.assertRaises(RetentionError):
                    self.plan()

    def test_duplicate_json_key_rejected(self):
        path = self.root / "retention-index.json"
        path.write_text(path.read_text().replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'))
        with self.assertRaises(RetentionError):
            self.plan()

    def test_lock_and_existing_audit_prevent_deletion(self):
        plan = self.plan()
        self.write(".retention/cleanup.lock", "another process")
        with self.assertRaises(FileExistsError):
            self.apply(plan)
        self.assertEqual((self.root / ".retention/cleanup.lock").read_text(), "another process")
        (self.root / ".retention/cleanup.lock").unlink()
        self.write(".retention/audit.jsonl", "prior evidence")
        with self.assertRaises(FileExistsError):
            self.apply(plan)
        self.assertTrue((self.root / "renders/r1.mp4").exists())

    def test_cli_default_dry_run_and_exclusive_plan(self):
        args = ["--root", str(self.root), "--index", "retention-index.json", "--plan", str(self.root / ".retention/plan.json")]
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(args), 0)
            self.assertTrue((self.root / "renders/r1.mp4").exists())
            self.assertEqual(main(args), 2)


if __name__ == "__main__":
    unittest.main()
