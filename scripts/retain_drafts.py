#!/usr/bin/env python3
"""Retain three successful render sets; unlink only reviewed, indexed derived files.

Python 3.10+, standard library only. Planning never changes media. See
docs/draft-retention.md for the index contract and the quiescent-apply requirement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
import stat
import sys
from datetime import datetime


KEEP_SUCCESSFUL = 3
DERIVED_KINDS = frozenset({"revision_render", "review_preview", "contact_sheet", "temporary_encode"})
# Defence in depth against a mislabeled index entry. These are path components,
# not directory searches or deletion globs.
PROTECTED_COMPONENTS = frozenset({
    ".retention", "source", "sources", "raw", "generated", "references",
    "voice", "voices", "music", "stems", "recipes", "ledgers", "evidence",
})


class RetentionError(ValueError):
    pass


def _object(value, required, optional=()):
    if not isinstance(value, dict) or not set(required) <= value.keys() or value.keys() - set(required) - set(optional):
        raise RetentionError(f"Expected object keys {sorted(required)} with optional {sorted(optional)}")
    return value


def _strings(value, label):
    if not isinstance(value, list) or any(not isinstance(v, str) or not v for v in value):
        raise RetentionError(f"{label} must be an array of nonempty strings")
    return value


def _relative(value):
    if not isinstance(value, str) or not value or "\\" in value:
        raise RetentionError("Paths must be nonempty root-relative paths using forward slashes")
    parts = value.split("/")
    if PureWindowsPath(value).drive or value.startswith("/") or any(
        p in ("", ".", "..") or p[-1:] in (".", " ") or ":" in p
        or any(ord(c) < 32 or c in '<>"|?*' for c in p)
        or p.split(".")[0].casefold() in {"con", "prn", "aux", "nul", *[f"com{i}" for i in range(1, 10)], *[f"lpt{i}" for i in range(1, 10)]}
        for p in parts
    ):
        raise RetentionError(f"Unsafe relative path: {value!r}")
    return value


def _key(value):
    # Conservative on every OS, so a manifest is safe when moved to Windows.
    return _relative(value).casefold()


def _linked(info):
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def _root(value):
    path = Path(os.path.abspath(value))
    for ancestor in [*reversed(path.parents), path]:
        if _linked(ancestor.lstat()):
            raise RetentionError(f"Root or ancestor is a symlink/reparse point: {ancestor}")
    if not path.is_dir():
        raise RetentionError("Root must be an existing directory")
    return path.resolve()


def _checked_path(root, relative):
    path = root
    parts = _relative(relative).split("/")
    for i, part in enumerate(parts):
        path = path / part
        try:
            info = path.lstat()
        except FileNotFoundError:
            return path.joinpath(*parts[i + 1:])
        if _linked(info):
            raise RetentionError(f"Symlink/reparse point in indexed path: {relative}")
        if i < len(parts) - 1 and not stat.S_ISDIR(info.st_mode):
            raise RetentionError(f"Non-directory ancestor in indexed path: {relative}")
    if os.path.commonpath((str(root), str(path.resolve()))) != str(root):
        raise RetentionError(f"Path escaped root: {relative}")
    return path


def _sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _canonical_key(root, relative):
    # Windows resolves DOS 8.3 aliases here; raw casefold keys alone cannot
    # recognize that an alias is a shared protected file or directory.
    return _key(_checked_path(root, relative).resolve().relative_to(root).as_posix())


def _fingerprint(root, relative):
    path = _checked_path(root, relative)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RetentionError(f"Candidate must be a regular file with one link: {relative}")
    result = {"path": relative, "size": info.st_size, "mtimeNs": info.st_mtime_ns,
              "device": info.st_dev, "inode": info.st_ino, "sha256": _sha(path)}
    after = _checked_path(root, relative).lstat()
    if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_nlink) != (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_nlink
    ):
        raise RetentionError(f"Candidate changed while hashing: {relative}")
    return result


def _load_json(path):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise RetentionError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_pairs)
    except (UnicodeError, json.JSONDecodeError) as error:
        raise RetentionError(f"Invalid JSON: {path}") from error


def build_plan(root_value, index_relative):
    root = _root(root_value)
    index_relative = _relative(index_relative)
    index = _checked_path(root, index_relative)
    if not index.is_file() or index.stat().st_nlink != 1:
        raise RetentionError("Index must be an existing regular file with one link")
    index_hash = _sha(index)
    document = _object(_load_json(index), {"schemaVersion", "protectedPaths", "currentRevisionId", "pinnedRevisionIds", "revisions"})
    if type(document["schemaVersion"]) is not int or document["schemaVersion"] != 1:
        raise RetentionError("Unsupported schemaVersion")
    protected = {_key(p) for p in _strings(document["protectedPaths"], "protectedPaths")}
    protected.add(_key(index_relative))
    pins = set(_strings(document["pinnedRevisionIds"], "pinnedRevisionIds"))
    current = document["currentRevisionId"]
    if current is not None and (not isinstance(current, str) or not current):
        raise RetentionError("currentRevisionId must be a nonempty string or null")
    if current:
        pins.add(current)
    revisions = document["revisions"]
    if not isinstance(revisions, list):
        raise RetentionError("revisions must be an array")
    ids, successes, records, dependencies = set(), [], [], set()
    all_paths = set(document["protectedPaths"]) | {index_relative}
    for revision in revisions:
        _object(revision, {"id", "status", "references", "artifacts"}, {"completedAt"})
        identifier, status = revision["id"], revision["status"]
        if not isinstance(identifier, str) or not identifier or identifier in ids:
            raise RetentionError("Revision IDs must be unique nonempty strings")
        ids.add(identifier)
        if not isinstance(status, str) or status not in {"successful", "failed", "in_progress"}:
            raise RetentionError(f"Unknown revision status: {status!r}")
        if status == "successful":
            try:
                completed = datetime.fromisoformat(revision["completedAt"].replace("Z", "+00:00"))
                if completed.utcoffset() is None:
                    raise ValueError("timezone required")
            except (KeyError, AttributeError, TypeError, ValueError) as error:
                raise RetentionError(f"Successful revision requires timezone-aware completedAt: {identifier}") from error
            successes.append((completed, identifier))
        refs = _strings(revision["references"], "revision references")
        protected.update(_key(p) for p in refs)
        all_paths.update(refs)
        dependencies.update(refs)
        if not isinstance(revision["artifacts"], list):
            raise RetentionError("artifacts must be an array")
        for artifact in revision["artifacts"]:
            _object(artifact, {"path", "kind", "disposable", "references"})
            path, kind, disposable = artifact["path"], artifact["kind"], artifact["disposable"]
            _relative(path)
            if not isinstance(kind, str) or not kind or type(disposable) is not bool:
                raise RetentionError("Artifact kind must be nonempty; disposable must be boolean")
            refs = _strings(artifact["references"], "artifact references")
            protected.update(_key(p) for p in refs)
            all_paths.update([path, *refs])
            dependencies.update(refs)
            if kind not in DERIVED_KINDS:
                dependencies.add(path)
            records.append((identifier, status, artifact))
    if not pins <= ids:
        raise RetentionError("Current/pinned revision does not exist in index")
    if len({completed for completed, _ in successes}) != len(successes):
        raise RetentionError("Successful completedAt timestamps must be distinct; do not guess revision order")
    newest = {identifier for _, identifier in sorted(successes, reverse=True)[:KEEP_SUCCESSFUL]}
    retained = newest | pins
    possible = {}
    for identifier, status, artifact in records:
        path = artifact["path"]
        if (status == "successful" and identifier not in retained
                and artifact["disposable"] and artifact["kind"] in DERIVED_KINDS
                and not (set(_key(path).split("/")) & PROTECTED_COMPONENTS)):
            previous = possible.setdefault(_key(path), path)
            if previous != path:
                raise RetentionError(f"Ambiguous path spelling: {previous!r}, {path!r}")
        else:
            protected.add(_key(path))
    # Check references and protected paths too. A stale alias/link makes the
    # complete index untrustworthy, even if that path is not a deletion candidate.
    for path in sorted(all_paths):
        _checked_path(root, path)
        if _key(path) in protected:
            protected.add(_canonical_key(root, path))
    for path in sorted(dependencies):
        if not _checked_path(root, path).exists():
            raise RetentionError(f"Rebuild dependency is missing; cleanup cannot prove recoverability: {path}")
    for identifier, status, artifact in records:
        if status == "successful" and identifier in retained and artifact["kind"] in DERIVED_KINDS:
            path = _checked_path(root, artifact["path"])
            if not path.is_file():
                raise RetentionError(f"Retained successful set is incomplete: {artifact['path']}")
    for _, identifier in successes:
        if not any(rid == identifier and artifact["kind"] == "revision_render" for rid, _, artifact in records):
            raise RetentionError(f"Successful set must declare at least one revision_render: {identifier}")
    candidates, missing, protected_outputs, canonical_candidates = [], [], [], set()
    for key, path in sorted(possible.items()):
        canonical = _canonical_key(root, path)
        if (set(canonical.split("/")) & PROTECTED_COMPONENTS
                or any(k == p or k.startswith(p + "/") or p.startswith(k + "/") for k in (key, canonical) for p in protected)):
            protected_outputs.append(path)
        elif not _checked_path(root, path).exists():
            missing.append(path)
        else:
            if canonical in canonical_candidates:
                raise RetentionError(f"Multiple aliases for one candidate: {path}")
            canonical_candidates.add(canonical)
            candidates.append(_fingerprint(root, path))
    if _sha(_checked_path(root, index_relative)) != index_hash:
        raise RetentionError("Index changed during planning")
    return {"planVersion": 1, "root": str(root), "index": index_relative, "indexSha256": index_hash,
            "keepSuccessful": KEEP_SUCCESSFUL, "retainedRevisionIds": sorted(retained),
            "candidates": candidates, "missing": missing, "protectedOutputs": protected_outputs,
            "bytesToDelete": sum(c["size"] for c in candidates)}


def apply_plan(root_value, index_relative, reviewed_plan, report_path):
    root = _root(root_value)
    if build_plan(root, index_relative) != reviewed_plan:
        raise RetentionError("Reviewed plan is stale or modified; create and review a new dry-run plan")
    # The audit must be outside the candidate paths and stay as permanent evidence.
    report = Path(os.path.abspath(report_path))
    try:
        report_relative = report.relative_to(root).as_posix()
    except ValueError as error:
        raise RetentionError("Apply report must be inside root/.retention/") from error
    if len(report_relative.split("/")) != 2 or report_relative.split("/")[0] != ".retention":
        raise RetentionError("Apply report must be a new file directly inside root/.retention/")
    _relative(report_relative)
    audit_dir = root / ".retention"
    _checked_path(root, ".retention")
    audit_dir.mkdir(exist_ok=True)
    lock = audit_dir / "cleanup.lock"
    lock_fd = None
    try:
        lock_fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        if build_plan(root, index_relative) != reviewed_plan:
            raise RetentionError("Plan changed before apply; nothing deleted")
        # Exclusive creation prevents replacing an existing evidence file.
        with report.open("x", encoding="utf-8") as audit:
            def record(event):
                audit.write(json.dumps(event, sort_keys=True) + "\n")
                audit.flush()
                os.fsync(audit.fileno())
            record({"event": "begin", "plan": reviewed_plan})
            deleted = []
            for candidate in reviewed_plan["candidates"]:
                if _sha(_checked_path(root, index_relative)) != reviewed_plan["indexSha256"]:
                    raise RetentionError("Index changed during apply; stopped")
                if _fingerprint(root, candidate["path"]) != candidate:
                    raise RetentionError(f"Candidate changed during apply: {candidate['path']}")
                record({"event": "delete_intent", "candidate": candidate})
                _checked_path(root, candidate["path"]).unlink()
                deleted.append(candidate["path"])
                record({"event": "deleted", "path": candidate["path"]})
            record({"event": "complete", "deletedCount": len(deleted)})
        return deleted
    finally:
        if lock_fd is not None:
            os.close(lock_fd)
            lock.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Existing project/run directory")
    parser.add_argument("--index", required=True, help="Root-relative explicit retention index")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--plan", help="Write a NEW dry-run JSON plan; default prints JSON")
    mode.add_argument("--apply", help="Apply this previously reviewed JSON plan")
    parser.add_argument("--report", help="Required for apply: NEW root/.retention/name.jsonl audit")
    args = parser.parse_args(argv)
    try:
        if args.apply:
            if not args.report:
                raise RetentionError("--apply requires --report")
            deleted = apply_plan(args.root, args.index, _load_json(Path(args.apply)), args.report)
            print(json.dumps({"deletedCount": len(deleted), "report": args.report}))
        else:
            if args.report:
                raise RetentionError("--report requires --apply")
            plan = build_plan(args.root, args.index)
            serialized = json.dumps(plan, indent=2, sort_keys=True) + "\n"
            if args.plan:
                root = _root(args.root)
                plan_path = Path(os.path.abspath(args.plan))
                try:
                    relative = plan_path.relative_to(root).as_posix()
                except ValueError:
                    relative = None
                if relative is not None:
                    if len(relative.split("/")) != 2 or relative.split("/")[0] != ".retention":
                        raise RetentionError("Plans within root must be directly inside .retention/")
                    _checked_path(root, relative)
                    (root / ".retention").mkdir(exist_ok=True)
                with plan_path.open("x", encoding="utf-8") as output:
                    output.write(serialized)
                print(json.dumps({"dryRun": True, "candidateCount": len(plan["candidates"]),
                                  "bytesToDelete": plan["bytesToDelete"], "plan": args.plan}))
            else:
                print(serialized, end="")
    except (RetentionError, OSError) as error:
        print(f"Retention stopped: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
