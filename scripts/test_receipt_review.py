"""The handoff receipt is written only for a READY review record, and binds what it hands off."""
import io
import json
import shutil
import unittest
import uuid
from contextlib import redirect_stdout
from pathlib import Path

import validate_review_gates as gate
import write_receipt
from test_validate_review_gates import make_valid_record, write_artifact, rebind


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).parent / ("review-test-" + uuid.uuid4().hex)
        self.root.mkdir(mode=0o777)
        self.addCleanup(lambda: shutil.rmtree(self.root))
        self.record = make_valid_record(self.root)

    def run_receipt(self, *extra):
        path = self.root / "production-review.json"
        path.write_text(json.dumps(self.record), encoding="utf-8")
        out = io.StringIO()
        with redirect_stdout(out):
            code = write_receipt.main([str(path), "--root", str(self.root), *extra])
        return code, json.loads(out.getvalue())

    def test_ready_record_gets_a_receipt_binding_review_master_and_qa(self):
        code, result = self.run_receipt()
        self.assertEqual(code, 0, result)
        receipt = json.loads((self.root / "receipt.json").read_text(encoding="utf-8"))
        self.assertEqual(receipt["schema"], "mce.receipt/1")
        self.assertEqual(receipt["review"]["sha256"], gate.file_hash(self.root / "production-review.json"))
        self.assertEqual(receipt["master"], self.record["artifacts"]["master"])
        self.assertEqual(receipt["qa_report"], self.record["artifacts"]["qa_report"])
        self.assertEqual([d["role"] for d in receipt["deliverables"]], list(gate.ARTIFACT_ROLES))
        self.assertEqual(result["sha256"], gate.file_hash(self.root / "receipt.json"))

    def test_failed_qa_writes_no_receipt(self):
        report = {"schema": "mce.qa/1", "sha256": self.record["artifacts"]["master"]["sha256"], "verdict": "FAIL",
                  "results": [{"check": "loudness", "verdict": "FAIL"}]}
        self.record["artifacts"]["qa_report"] = write_artifact(self.root, "artifacts/qa_report.bin", report)
        rebind(self.record)
        code, result = self.run_receipt()
        self.assertEqual(code, 1)
        self.assertEqual(result["status"], "FAIL")
        self.assertFalse((self.root / "receipt.json").exists())

    def test_pending_gate_writes_no_receipt(self):
        self.record["gates"]["blind_review"]["status"] = "PENDING"
        code, result = self.run_receipt()
        self.assertNotEqual(code, 0)
        self.assertFalse((self.root / "receipt.json").exists())

    def test_existing_receipt_is_preserved(self):
        (self.root / "receipt.json").write_text("kept", encoding="utf-8")
        code, result = self.run_receipt()
        self.assertEqual(code, 1)
        self.assertEqual((self.root / "receipt.json").read_text(encoding="utf-8"), "kept")

    def test_output_cannot_escape_the_run(self):
        code, result = self.run_receipt("--out", "../receipt.json")
        self.assertEqual(code, 1)
        self.assertIn("contained relative path", result["reason"])


if __name__ == "__main__":
    unittest.main()
