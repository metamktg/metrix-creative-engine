#!/usr/bin/env python3
"""Write the handoff receipt (mce.receipt/2) for a reviewed candidate; never approve work.

Usage: write_receipt.py production-review.json --root RUN [--out receipt.json]

The receipt is the last stage's output: the review record is validated again
against the current files (validate_review_gates.py), and only a READY record
gets a receipt. A receipt names the review record by sha256 and lists every
bound artifact by role, path and sha256, so what was handed off can be traced
back to the exact master, QA report and review that cleared it. A FAIL or
NOT_CHECKED record writes nothing and exits with the validator's code.
Existing output is preserved. Paths stay inside RUN, without links.
mce.receipt/2 carries the record's variable mode and codes under "variables".
"""
from pathlib import Path, PurePosixPath, PureWindowsPath
import argparse, datetime as dt, json, sys
from validate_review_gates import ARTIFACT_ROLES, Validator, file_hash, variables_key

SCHEMA = "mce.receipt/2"


def contained_output(v, out):
    rel = out.replace("\\", "/")
    if (PurePosixPath(rel).is_absolute() or PureWindowsPath(out).drive or
            any(part in ("", ".", "..") for part in rel.split("/")) or ":" in rel or "\x00" in rel):
        return None, "Output must be a contained relative path."
    output = v.root
    for part in PurePosixPath(rel).parts:
        output = output / part
        if v._link(output):
            return None, "Output may not traverse a link."
    try:
        output.resolve().relative_to(v.root.resolve())
    except (ValueError, OSError, RuntimeError):
        return None, "Output escapes the run root."
    if output.exists():
        return None, "Output exists; preserve it and choose a new name."
    return output, None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("record", type=Path)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--out", default="receipt.json", help="New relative output file inside root.")
    args = parser.parse_args(argv)
    v = Validator(args.root.absolute())
    try:
        relative = args.record.resolve().relative_to(v.root)
    except (ValueError, OSError, RuntimeError):
        print(json.dumps({"status": "FAIL", "reason": "Review record must be inside root."}))
        return 1
    record_path = v.path(relative.as_posix(), "record")
    record = v.json_file(record_path, "record")
    if record is None:
        print(json.dumps(v.result(), indent=2))
        return v.result()["exit_code"] or 2
    result = v.validate(record)
    if result["status"] != "READY":
        print(json.dumps({"status": result["status"], "receipt": None,
                          "reason": "Only a READY review record gets a handoff receipt.",
                          "review": result}, indent=2))
        return result["exit_code"]
    output, problem = contained_output(v, args.out)
    if problem:
        print(json.dumps({"status": "FAIL", "reason": problem}))
        return 1
    artifacts = record["artifacts"]
    receipt = {
        "schema": SCHEMA,
        "asset_id": record.get("asset_id"),
        "issued_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "review": {"path": relative.as_posix(), "sha256": file_hash(record_path),
                   "schema_version": record["schema_version"], "status": "READY"},
        "master": artifacts["master"],
        "qa_report": artifacts["qa_report"],
        "deliverables": [{"role": role, "path": artifacts[role]["path"], "sha256": artifacts[role]["sha256"].lower()}
                         for role in ARTIFACT_ROLES],
        "variables": {"mode": record[variables_key(record)].get("mode"), "codes": record[variables_key(record)].get("codes")},
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(receipt, stream, indent=2, ensure_ascii=True, allow_nan=False)
        stream.write("\n")
    print(json.dumps({"status": "READY", "receipt": output.relative_to(v.root).as_posix(),
                      "sha256": file_hash(output)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
