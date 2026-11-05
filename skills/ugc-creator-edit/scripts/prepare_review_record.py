#!/usr/bin/env python3
"""Hash a local candidate and create five PENDING review records; never approve work.

Usage: prepare_review_record.py manifest.json --root RUN --out production-review.json
The manifest contains artifacts:{required role:relative path}, contributors, iap,
production, and optional neutral asset_id. All context must be deliberately
specified. Input/output paths and source files must stay within RUN without links.
Existing output is preserved. Change a candidate by preparing a new version.
"""
from pathlib import Path, PurePosixPath, PureWindowsPath
import argparse, json, sys, uuid
from validate_review_gates import ARTIFACT_ROLES, GATE_CHECKS, Validator, bundle_hash, file_hash

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("manifest",type=Path)
    parser.add_argument("--root",type=Path,required=True)
    parser.add_argument("--out",default="production-review.json",help="New relative output file inside root.")
    args=parser.parse_args(argv)
    v=Validator(args.root.absolute())
    try: relative=args.manifest.resolve().relative_to(v.root)
    except (ValueError,OSError,RuntimeError):
        print(json.dumps({"status":"FAIL","reason":"Manifest must be inside root."}));return 1
    manifest_path=v.path(relative.as_posix(),"manifest")
    try: manifest=json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path else None
    except (OSError,UnicodeError,json.JSONDecodeError):
        print(json.dumps({"status":"NOT_CHECKED","reason":"Manifest is unavailable or invalid JSON."}));return 2
    if not isinstance(manifest,dict) or not isinstance(manifest.get("artifacts"),dict):
        print(json.dumps({"status":"FAIL","reason":"Manifest needs an artifacts mapping."}));return 1
    for key in ("contributors","iap","production"):
        if not isinstance(manifest.get(key),dict):
            print(json.dumps({"status":"FAIL","reason":"Manifest must explicitly specify "+key+"."}));return 1
    artifacts={}
    for role in ARTIFACT_ROLES:
        path=v.path(manifest["artifacts"].get(role),"artifacts."+role)
        if path and path.is_file():
            try: artifacts[role]={"path":path.relative_to(v.root).as_posix(),"sha256":file_hash(path)}
            except OSError:v.issue("NOT_CHECKED","artifacts."+role,"Cannot read source artifact.")
        else:v.issue("NOT_CHECKED","artifacts."+role,"Required source artifact is unavailable.")
    if v.issues:
        print(json.dumps(v.result(),indent=2));return v.result()["exit_code"]
    relative_output=args.out.replace("\\","/")
    if (PurePosixPath(relative_output).is_absolute() or PureWindowsPath(args.out).drive or
        any(part in ("", ".", "..") for part in relative_output.split("/")) or
        ":" in relative_output or "\x00" in relative_output):
        print(json.dumps({"status":"FAIL","reason":"Output must be a contained relative path."}));return 1
    output=v.root
    for part in PurePosixPath(relative_output).parts:
        output=output/part
        if v._link(output):
            print(json.dumps({"status":"FAIL","reason":"Output may not traverse a link."}));return 1
    try: output.resolve().relative_to(v.root.resolve())
    except (ValueError,OSError,RuntimeError):
        print(json.dumps({"status":"FAIL","reason":"Output escapes the review root."}));return 1
    if output.exists():
        print(json.dumps({"status":"FAIL","reason":"Output exists; preserve it and choose a new version."}));return 1
    record={"schema_version":1,"asset_id":manifest.get("asset_id") or "candidate-"+uuid.uuid4().hex[:12],
            "artifacts":artifacts,"contributors":manifest["contributors"],"iap":manifest["iap"],
            "production":manifest["production"],"gates":{}}
    try: digest=bundle_hash(record)
    except (TypeError,ValueError,KeyError):
        print(json.dumps({"status":"FAIL","reason":"Context cannot be canonically bound."}));return 1
    for gate,checks in GATE_CHECKS.items():
        record["gates"][gate]={"status":"PENDING","reviewer":None,
            "master_sha256":artifacts["master"]["sha256"],"bundle_sha256":digest,
            "completed_at":None,"evidence":[],"checks":{check:None for check in checks},
            "blocking_defects":[]}
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("x",encoding="utf-8",newline="\n") as stream:
        json.dump(record,stream,indent=2,ensure_ascii=True,allow_nan=False);stream.write("\n")
    print(json.dumps({"status":"PENDING","approved_for_presentation":False,
          "record":output.relative_to(v.root).as_posix(),"bundle_sha256":digest,
          "gates":list(GATE_CHECKS),"note":"Source hashes prepared. No review or approval was created."},indent=2))
    return 0
if __name__=="__main__":sys.exit(main())
