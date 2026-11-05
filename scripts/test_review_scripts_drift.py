"""The review scripts live twice: here, and in the repository's root scripts/ folder
that `npm run verify` executes. A fix applied to one copy and not the other is the
kind of drift that passes a gate while the production run uses the broken file."""
from pathlib import Path
import unittest

FILES = (
    "validate_review_gates.py",
    "prepare_review_record.py",
    "test_validate_review_gates.py",
    "test_prepare_review_record.py",
    "check_script.py",
    "test_check_script_review.py",
)


def repo_root(start: Path):
    for parent in (start, *start.parents):
        if (parent / "package.json").is_file() and (parent / "skills").is_dir():
            return parent
    return None


class ReviewScriptDriftTests(unittest.TestCase):
    def test_root_and_skill_copies_are_byte_identical(self):
        here = Path(__file__).resolve().parent
        root = repo_root(here)
        if root is None:
            self.skipTest("Not inside the engine repository; nothing to compare.")
        skill_scripts = root / "skills" / "ugc-creator-edit" / "scripts"
        root_scripts = root / "scripts"
        if not (skill_scripts.is_dir() and root_scripts.is_dir()):
            self.skipTest("Only one copy of the review scripts exists here.")
        for name in FILES:
            a, b = skill_scripts / name, root_scripts / name
            if not (a.is_file() and b.is_file()):
                continue
            with self.subTest(file=name):
                self.assertEqual(a.read_bytes(), b.read_bytes(),
                                 f"{name} differs between skills/ugc-creator-edit/scripts and scripts/")


if __name__ == "__main__":
    unittest.main()
