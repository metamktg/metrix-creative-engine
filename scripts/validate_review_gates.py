#!/usr/bin/env python3
"""Validate evidence for the five mandatory evergreen production review gates.

This is a local, stdlib-only evidence/attestation validator. It does not listen,
watch, recruit reviewers, run commands, contact providers, or certify perception.

Record contract (schema_version=1):
  artifacts: master, brief, script, voice, captions, edl, sources, profile,
             registry, blind_packet, blind_copy ->
             {path: relative local file, sha256: lowercase hex}
  contributors: {producer_ids: [id], editor_ids: [id]}
  iap: {mode: standard|matrix, codes: [exact approved code],
        applicability: {decision: applicable|not_applicable, reason, reviewer_id},
        matrix_locks_verified: bool|null}
  production: see PRODUCTION_CONTRACT below.
  gates: exactly iap_variables, communications, sound_check, editorial_peer,
         blind_review. PASS records need reviewer {id, kind, capability?},
         master_sha256, bundle_sha256, completed_at (timezone-aware ISO8601),
         evidence [{path, sha256, method}], checks {required_name: true},
         blocking_defects: []. Other states are FAIL, PENDING, UNAVAILABLE,
         NOT_CHECKED. Missing evidence is NOT_CHECKED, never a silent pass.

The profile artifact is JSON with sound_check_required_facts containing nonempty
string arrays for message, benefit, action, conditions. The registry artifact is
JSON with approved_codes, an array of exact nonempty strings. Nothing invents or
normalizes IAP codes by regular expression.

Gate sound_check additionally contains sound_check:
 {full_listen:true, playback_speed:1, script_primed:false, first_exposure:true,
  phone_muted:true, answers:{message,benefit,action,conditions:nonempty string},
  comparison:{message,benefit,action,conditions:true}}.
This is an adult plain-language exercise, not a requirement to recruit minors.

Gate blind_review additionally contains blind:
 {scope:"process_blind", fresh_reviewer:true, prior_history_seen:false,
  prior_feedback_seen:false, residual_cues_reviewed:true,
  residual_identity_cues:[strings], packet:{path,sha256},
  review_copy:{path,sha256}, verdict_locked_at:ISO8601,
  unblinded_at:ISO8601|null,
  excluded_information:["authors","provider","cost","versions","prior_verdicts"]}.
The exact blind derivative and packet must be prepared before review, included
as blind_copy/blind_packet artifact roles in every gate bundle, and referenced
by matching hashes in the final gate. The verdict lock must follow all four
earlier completed reviews. Process-blind is not a claim
that remaining brand, domain, voice, product or category cues disappeared.
The packet and copy are private local evidence. This validator cannot prove that
a reviewer was truly fresh or that the packet/content was anonymous. Reviewer
IDs enforce known record consistency; this local tool does not authenticate
identities. Sound-check reviewers have an exclusive independent review role and
may not be another gate reviewer or an earlier applicability/music reviewer.
Known identity comparisons use strip().casefold(); raw values stay bound in the
context and are not rewritten.

Exit 0 READY; exit 1 FAIL (rejection, unsafe path, stale/tampered/schema conflict);
exit 2 NOT_CHECKED (missing/pending/unavailable evidence). FAIL takes precedence
when failures and missing checks coexist. Any nonzero result blocks presenting
the candidate as approved. A clearly marked working review cut is not approval.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import sys

ARTIFACT_ROLES = (
    "master", "brief", "script", "voice", "captions", "edl", "sources",
    "profile", "registry", "blind_packet", "blind_copy",
)
GATE_CHECKS = {
    "iap_variables": (
        "variables_validated", "technical_verified", "music_reviewed",
        "broll_reviewed", "speed_verified",
    ),
    "communications": (
        "supported_claims", "clear_hook_payoff", "mechanism_clear",
        "single_action", "offer_conditions_clear", "spoken_visual_consistent",
    ),
    "sound_check": (
        "core_message_recalled", "benefit_recalled", "action_recalled",
        "conditions_recalled", "caption_phone_check",
    ),
    "editorial_peer": (
        "full_av_normal_speed", "phone_size_muted", "cuts_and_transitions",
        "broll_quality", "music_and_voice_balance", "cta_and_word_tails",
        "defects_closed",
    ),
    "blind_review": (
        "message_clear", "delivery_natural", "proof_credible",
        "cta_clear", "no_blocking_defects",
    ),
}
METHODS = {
    "artifact_check", "text_review", "frame_inspection", "full_audio_1x",
    "full_av_1x", "muted_phone",
}
KINDS = {"human", "audio_capable_agent", "agent", "automated"}
FACTS = ("message", "benefit", "action", "conditions")
BLIND_EXCLUSIONS = {"authors", "provider", "cost", "versions", "prior_verdicts"}
PRODUCTION_CONTRACT = """production:
 music:
  selected -> {decision, asset:{path,sha256}, stem:{path,sha256},
   license:{path,sha256}, paid_ad_use_verified:true, ducking_reviewed:true,
   fades_reviewed:true, reviewer_id: nonempty}
  intentional_none -> {decision, rationale: specific nonempty explanation,
   reviewer_id: nonempty}
 broll: {output_reviewed:true, source_quality_reviewed:true,
  source_ranges_verified:true, acceptance_criteria:[nonempty strings]}
 speed: {playback_speed:1, speech_retimed:bool,
  visible_speech_synchronized:true, map_reviewed:true, map:[entries]}
 Each map entry: {kind:broll|screen|speech, source_in, source_out,
  output_in, output_out, speed:finite positive}.
 Non-unit speech additionally requires speech_retimed:true,
 speech_audio_video_together:true, pitch_preserved:true, retime_approved:true.
 Non-unit screen playback requires process_truth_preserved:true.
 An empty map means no retimed clips and requires speech_retimed:false.
 All ranges use seconds, preserve duration within one frame at the positive
 finite fps in the pinned profile (required when a speed map exists), and are data,
 never executable commands."""


def bundle_hash(record: dict) -> str:
    """Hash the candidate artifact digests AND its production/review context.

    Payload = {artifacts:{required role:sha256.lower()}, contributors, iap,
    production}; JSON is sort_keys=True, separators=(',', ':'), ensure_ascii=True,
    allow_nan=False, UTF8 encoded. Gates are excluded to avoid recursion.
    Moving the complete run to another root does not change the binding. Relative
    path changes within production decisions do require reaffirmed reviews.
    """
    artifacts = record["artifacts"]
    data = {
        "artifacts": {role: artifacts[role]["sha256"].lower() for role in ARTIFACT_ROLES},
        "contributors": record["contributors"],
        "iap": record["iap"],
        "production": record["production"],
    }
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True,
                   allow_nan=False).encode("utf-8")
    ).hexdigest()


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _text(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _reviewer_id(value):
    return value.strip().casefold() if _text(value) else None


def _strings(value, allow_empty=False) -> bool:
    return isinstance(value, list) and (allow_empty or bool(value)) and all(
        _text(item) for item in value
    )


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _stamp(value):
    if not _text(value):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.utcoffset() is not None else None
    except (ValueError, OverflowError):
        return None


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _reject_constant(value):
    raise ValueError("Non-standard JSON numeric constant")


class Validator:
    def __init__(self, root: Path):
        self.issues = []
        self.paths = {}
        self.audio_reviewers = set()
        self.unsafe_root = False
        given = Path(root).absolute()
        # A junction or symlink in the ancestry of the path the caller typed
        # (for example a C:\ junction onto an X:\ checkout) describes how the
        # run was addressed, not the run. Resolve it to the real directory
        # first, then require that the real location itself sits behind no
        # link, so every evidence hash binds to one real directory.
        try:
            self.root = given.resolve()
        except (OSError, RuntimeError):
            self.root = given
        self.root_given = given
        for path in (self.root, *self.root.parents):
            if self._link(path):
                self.issue("FAIL", "root", "Root ancestry may not traverse a symlink or junction.")
                self.unsafe_root = True
                break
        if not self.unsafe_root and not self.root.is_dir():
            self.issue("NOT_CHECKED", "root", "Review root directory is unavailable.")

    @staticmethod
    def _link(path: Path) -> bool:
        return path.is_symlink() or bool(getattr(path, "is_junction", lambda: False)())

    def issue(self, status, field, reason):
        self.issues.append({"status": status, "field": field, "reason": reason})

    def require(self, value, field, reason, status="FAIL"):
        if not value:
            self.issue(status, field, reason)
        return bool(value)

    def path(self, value, field):
        if self.unsafe_root:
            self.issue("FAIL", field, "Evidence is not read through an unsafe review root.")
            return None
        if not _text(value):
            self.issue("NOT_CHECKED", field, "A relative local evidence path is missing.")
            return None
        normalized = value.replace("\\", "/")
        p = PurePosixPath(normalized)
        if (p.is_absolute() or PureWindowsPath(value).drive or
                any(part in ("", ".", "..") for part in normalized.split("/")) or
                ":" in normalized or "\x00" in normalized):
            self.issue("FAIL", field, "Only contained relative local files are allowed.")
            return None
        target = self.root
        for part in p.parts:
            target = target / part
            if self._link(target):
                self.issue("FAIL", field, "Evidence may not traverse symlinks or junctions.")
                return None
        try:
            target.resolve().relative_to(self.root.resolve())
        except (ValueError, OSError, RuntimeError):
            self.issue("FAIL", field, "Evidence path escapes or cannot resolve inside the review root.")
            return None
        if not target.is_file():
            self.issue("NOT_CHECKED", field, "The local evidence file is unavailable.")
            return None
        return target

    def artifact(self, descriptor, field):
        if not isinstance(descriptor, dict):
            self.issue("NOT_CHECKED" if descriptor is None else "FAIL", field,
                       "A file/hash evidence descriptor is missing or has the wrong type.")
            return None
        digest = descriptor.get("sha256")
        if not _text(digest) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            self.issue("FAIL", field, "A valid SHA256 declaration is required.")
            return None
        path = self.path(descriptor.get("path"), field)
        if path is None:
            return None
        try:
            actual = file_hash(path)
        except OSError:
            self.issue("NOT_CHECKED", field, "Evidence could not be read.")
            return None
        if actual != digest.lower():
            self.issue("FAIL", field, "The declared hash is stale or does not match the actual file.")
            return None
        return path

    def json_file(self, path, field):
        if path is None:
            return None
        try:
            if path.stat().st_size > 4 * 1024 * 1024:
                raise ValueError("Oversize JSON")
            return json.loads(path.read_text(encoding="utf-8-sig"),
                              object_pairs_hook=_unique_object, parse_constant=_reject_constant)
        except (OSError, UnicodeError, ValueError):
            self.issue("FAIL", field, "Required local JSON evidence is malformed or oversized.")
            return None

    def truth_checks(self, data, names, field):
        if not isinstance(data, dict):
            self.issue("NOT_CHECKED", field, "Required checklist evidence is missing.")
            return
        for name in names:
            if name not in data or data[name] is None:
                self.issue("NOT_CHECKED", field + "." + name, "This required check has not been recorded.")
            elif data[name] is not True:
                self.issue("FAIL", field + "." + name, "This required check did not pass.")

    def production(self, data, profile):
        if not isinstance(data, dict):
            self.issue("NOT_CHECKED", "production", "Production decisions have not been recorded.")
            return
        # Existing artifact roles stay unchanged. The packet binding itself is
        # in the production context digest and is rehashed locally here.
        if "preproduction" in data or (isinstance(profile, dict) and profile.get("creator_preproduction_required") is True):
            bindings = data.get("preproduction")
            if isinstance(bindings, list):
                if not bindings:
                    self.issue("NOT_CHECKED", "production.preproduction", "Required creator packet bindings are missing.")
                for index, binding in enumerate(bindings):
                    self.artifact(binding, "production.preproduction[" + str(index) + "]")
            else:
                self.artifact(bindings, "production.preproduction")
        music = data.get("music")
        if not isinstance(music, dict):
            self.issue("NOT_CHECKED", "production.music", "A reviewed music decision is missing.")
        elif music.get("decision") == "intentional_none":
            self.require(_text(music.get("rationale")) and len(music["rationale"].strip()) >= 20,
                         "production.music.rationale", "Intentional silence needs a specific reviewed rationale; length alone is not quality proof.")
            self.require(_text(music.get("reviewer_id")), "production.music.reviewer_id",
                         "The music decision needs an accountable reviewer.")
        elif music.get("decision") == "selected":
            for role in ("asset", "stem", "license"):
                self.artifact(music.get(role), "production.music." + role)
            self.truth_checks(music, ("paid_ad_use_verified", "ducking_reviewed", "fades_reviewed"),
                              "production.music")
            self.require(_text(music.get("reviewer_id")), "production.music.reviewer_id",
                         "The music decision needs an accountable reviewer.")
        else:
            self.issue("FAIL", "production.music", "Music decision must be selected or intentional_none.")
        broll = data.get("broll")
        self.truth_checks(broll, ("output_reviewed", "source_quality_reviewed", "source_ranges_verified"),
                          "production.broll")
        if isinstance(broll, dict):
            self.require(_strings(broll.get("acceptance_criteria")), "production.broll.acceptance_criteria",
                         "B-roll needs declared quality and action/fidelity criteria.", "NOT_CHECKED")
        speed = data.get("speed")
        if not isinstance(speed, dict):
            self.issue("NOT_CHECKED", "production.speed", "The playback/retiming record is missing.")
            return
        self.require(_number(speed.get("playback_speed")) and speed["playback_speed"] == 1,
                     "production.speed.playback_speed", "Reviews and delivery playback must be assessed at 1x.")
        self.truth_checks(speed, ("visible_speech_synchronized", "map_reviewed"), "production.speed")
        self.require(isinstance(speed.get("speech_retimed"), bool), "production.speed.speech_retimed",
                     "Speech retiming must be explicitly declared.")
        entries = speed.get("map")
        if not isinstance(entries, list):
            self.issue("NOT_CHECKED", "production.speed.map", "The speed map is missing; use [] for no retiming.")
            return
        fps = profile.get("fps") if isinstance(profile, dict) else None
        tolerance = None
        if entries:
            if fps is None:
                self.issue("NOT_CHECKED", "profile.fps", "A mapped edit needs its actual profile frame rate.")
            elif not _number(fps) or fps <= 0:
                self.issue("FAIL", "profile.fps", "Frame rate must be positive and finite.")
            else:
                tolerance = 1 / fps
        changed_speech = False
        for index, entry in enumerate(entries):
            field = "production.speed.map[" + str(index) + "]"
            if not isinstance(entry, dict):
                self.issue("FAIL", field, "Speed entries must be data objects.")
                continue
            kind = entry.get("kind")
            self.require(kind in ("broll", "screen", "speech"), field, "Unknown source kind.")
            names = ("source_in", "source_out", "output_in", "output_out", "speed")
            if not all(_number(entry.get(k)) for k in names):
                self.issue("FAIL", field, "Finite numeric source/output ranges and speed are required.")
                continue
            si, so, oi, oo, rate = (entry[k] for k in names)
            if not self.require(si >= 0 and oi >= 0 and so > si and oo > oi and rate > 0,
                                field, "Speed ranges must have positive durations and speed."):
                continue
            if tolerance is not None:
                self.require(abs((so - si) / rate - (oo - oi)) <= tolerance + 1e-9,
                             field, "Source/output duration does not match the declared speed at the actual profile frame rate.")
            if kind == "speech" and rate != 1:
                changed_speech = True
                self.truth_checks(speed, ("speech_audio_video_together", "pitch_preserved", "retime_approved"),
                                  "production.speed")
            if kind == "screen" and rate != 1:
                self.truth_checks(speed, ("process_truth_preserved",), "production.speed")
        self.require(changed_speech == speed.get("speech_retimed"), "production.speed.speech_retimed",
                     "Declared speech retiming contradicts the actual speed map.")

    def validate(self, record):
        if not isinstance(record, dict):
            self.issue("FAIL", "record", "A JSON object is required.")
            return self.result()
        self.require(type(record.get("schema_version")) is int and record["schema_version"] == 1,
                     "schema_version", "Unsupported review schema.")
        artifacts = record.get("artifacts")
        if not isinstance(artifacts, dict):
            self.issue("NOT_CHECKED", "artifacts", "Current candidate artifact bindings are missing.")
            artifacts = {}
        self.require(not (set(artifacts) - set(ARTIFACT_ROLES)), "artifacts",
                     "Unknown artifact roles are not part of this versioned review bundle.")
        for role in ARTIFACT_ROLES:
            self.paths[role] = self.artifact(artifacts.get(role), "artifacts." + role)
        expected_bundle = None
        try:
            expected_bundle = bundle_hash(record)
        except (KeyError, AttributeError, TypeError, ValueError):
            pass
        registry = self.json_file(self.paths.get("registry"), "artifacts.registry")
        profile = self.json_file(self.paths.get("profile"), "artifacts.profile")
        self.iap(record.get("iap"), registry)
        self.production(record.get("production"), profile)
        contributors = record.get("contributors")
        contributor_ids = set()
        if not isinstance(contributors, dict):
            self.issue("NOT_CHECKED" if contributors is None else "FAIL", "contributors",
                       "Producer/editor identities must be recorded.")
        else:
            for role in ("producer_ids", "editor_ids"):
                ids = contributors.get(role)
                missing = ids is None or ids == []
                if self.require(_strings(ids), "contributors." + role, "Nonempty contributor IDs are required.",
                                "NOT_CHECKED" if missing else "FAIL"):
                    contributor_ids.update(_reviewer_id(value) for value in ids)
        gates = record.get("gates")
        if not isinstance(gates, dict):
            self.issue("NOT_CHECKED", "gates", "Mandatory review gate records are missing.")
            gates = {}
        unknown = set(gates) - set(GATE_CHECKS)
        self.require(not unknown, "gates", "Unknown gate names are not allowed.")
        ids = {}
        completed = {}
        for name in GATE_CHECKS:
            gate = gates.get(name)
            if gate is None:
                self.issue("NOT_CHECKED", "gates." + name, "This mandatory gate has not been performed.")
                continue
            result = self.gate(name, gate, artifacts, expected_bundle)
            if result:
                ids[name], completed[name] = result
        editorial = ids.get("editorial_peer")
        if editorial:
            self.require(editorial not in contributor_ids, "gates.editorial_peer.reviewer",
                         "Editorial peer must not be the producer or editor.")
        production = record.get("production")
        music = production.get("music") if isinstance(production, dict) else None
        iap = record.get("iap")
        applicability = iap.get("applicability") if isinstance(iap, dict) else None
        context_reviewers = set()
        for decision in (applicability, music):
            if isinstance(decision, dict) and _text(decision.get("reviewer_id")):
                context_reviewers.add(_reviewer_id(decision["reviewer_id"]))
        known_gate_reviewers = {}
        for name, review in gates.items():
            reviewer = review.get("reviewer") if isinstance(review, dict) else None
            if isinstance(reviewer, dict) and _text(reviewer.get("id")):
                known_gate_reviewers[name] = _reviewer_id(reviewer["id"])
        if isinstance(music, dict) and music.get("decision") == "intentional_none":
            if editorial is None:
                self.issue("NOT_CHECKED", "production.music.reviewer_id",
                           "The intentional-silence exception awaits the independent editorial reviewer.")
            else:
                self.require(_reviewer_id(music.get("reviewer_id")) == editorial, "production.music.reviewer_id",
                             "The independent editorial reviewer must approve intentional silence.")
        sound = ids.get("sound_check")
        if sound:
            self.require(sound not in contributor_ids and sound not in context_reviewers and
                         sound not in {value for key, value in known_gate_reviewers.items()
                                       if key != "sound_check"},
                         "gates.sound_check.reviewer",
                         "Sound-check reviewer must be exclusive, with no contributor, other gate or prior context-review role.")
        blind = ids.get("blind_review")
        if blind:
            self.require(blind not in contributor_ids and blind not in context_reviewers and blind not in {
                value for key, value in known_gate_reviewers.items() if key != "blind_review"
            }, "gates.blind_review.reviewer", "Blind reviewer must be fresh and distinct from contributors and prior reviewers.")
        for name in ("sound_check", "editorial_peer", "blind_review"):
            gate = gates.get(name)
            if isinstance(gate, dict) and gate.get("status") == "PASS":
                reviewer = gate.get("reviewer", {})
                if not isinstance(reviewer, dict):
                    reviewer = {}
                capable = reviewer.get("kind") in ("human", "audio_capable_agent")
                if reviewer.get("kind") == "audio_capable_agent":
                    capable = capable and _text(reviewer.get("capability"))
                self.require(capable, "gates." + name + ".reviewer",
                             "This gate needs a human or explicitly audio-capable reviewer; text/frame-only evidence is insufficient.",
                             "NOT_CHECKED")
        if isinstance(gates.get("sound_check"), dict) and gates["sound_check"].get("status") == "PASS":
            self.sound(gates["sound_check"], profile)
        if isinstance(gates.get("blind_review"), dict) and gates["blind_review"].get("status") == "PASS":
            self.blind(gates["blind_review"], completed, artifacts)
        return self.result()

    def iap(self, data, registry):
        if not isinstance(data, dict):
            self.issue("NOT_CHECKED", "iap", "Variable applicability and registry decisions are missing.")
            return
        approved = registry.get("approved_codes") if isinstance(registry, dict) else None
        if registry is None:
            self.issue("NOT_CHECKED", "registry.approved_codes", "The approved registry snapshot is unavailable.")
            return
        if not _strings(approved, allow_empty=True) or len(set(approved)) != len(approved):
            self.issue("FAIL", "registry.approved_codes", "An explicit unique approved_codes snapshot is required.")
            return
        codes = data.get("codes")
        if not _strings(codes, allow_empty=True) or len(set(codes)) != len(codes):
            self.issue("FAIL", "iap.codes", "IAP codes must be an explicit unique string list.")
            return
        self.require(set(codes).issubset(set(approved)), "iap.codes",
                     "One or more codes are not members of the pinned approved registry.")
        mode = data.get("mode")
        self.require(mode in ("standard", "matrix"), "iap.mode", "Mode must be standard or matrix.")
        decision = data.get("applicability", {})
        if not isinstance(decision, dict):
            decision = {}
        self.require(_text(decision.get("reason")) and _text(decision.get("reviewer_id")),
                     "iap.applicability", "Variable applicability needs an explicit reason and reviewer.")
        expected = "applicable" if codes else "not_applicable"
        self.require(decision.get("decision") == expected, "iap.applicability.decision",
                     "Variable applicability contradicts the declared code list.")
        if mode == "matrix":
            self.require(bool(codes), "iap.codes", "Matrix work cannot omit the isolated IAP variable.")
            self.require(data.get("matrix_locks_verified") is True, "iap.matrix_locks_verified",
                         "Matrix isolation and locked variables must be verified.")

    def gate(self, name, gate, artifacts, bundle):
        field = "gates." + name
        if not isinstance(gate, dict):
            self.issue("FAIL", field, "A review gate must be an object.")
            return None
        status = gate.get("status")
        if status in (None, "PENDING", "UNAVAILABLE", "NOT_CHECKED"):
            self.issue("NOT_CHECKED", field, "This mandatory gate is missing, pending or unavailable.")
            return None
        if status != "PASS":
            self.issue("FAIL", field, "The review rejected this candidate or has an invalid status.")
            return None
        reviewer = gate.get("reviewer")
        if not isinstance(reviewer, dict):
            reviewer = {}
        self.require(_text(reviewer.get("id")) and _text(reviewer.get("kind")) and reviewer.get("kind") in KINDS,
                     field + ".reviewer", "A named reviewer identity and supported kind are required.")
        stamp = _stamp(gate.get("completed_at"))
        self.require(stamp is not None, field + ".completed_at", "A completed gate needs a timezone-aware timestamp.")
        master_object = artifacts.get("master")
        current_master = master_object.get("sha256") if isinstance(master_object, dict) else None
        if _text(current_master):
            self.require(gate.get("master_sha256") == current_master,
                         field + ".master_sha256", "Review is not bound to the current master.")
        else:
            self.issue("NOT_CHECKED", field + ".master_sha256", "Current master binding is unavailable.")
        if bundle is not None:
            self.require(gate.get("bundle_sha256") == bundle,
                         field + ".bundle_sha256", "Review is stale for the current complete artifact/context bundle.")
        else:
            self.issue("NOT_CHECKED", field + ".bundle_sha256", "Current complete artifact/context binding is unavailable.")
        checks = gate.get("checks")
        if isinstance(checks, dict):
            self.require(not (set(checks) - set(GATE_CHECKS[name])), field + ".checks",
                         "Unknown checklist names do not belong to this versioned gate.")
        self.truth_checks(checks, GATE_CHECKS[name], field + ".checks")
        defects = gate.get("blocking_defects")
        self.require(isinstance(defects, list) and not defects, field + ".blocking_defects",
                     "A passing gate must explicitly have no open blocking defects.")
        evidence = gate.get("evidence")
        methods = set()
        if not isinstance(evidence, list) or not evidence:
            self.issue("NOT_CHECKED", field + ".evidence", "The claimed review has no actual evidence file.")
        else:
            for index, item in enumerate(evidence):
                if not isinstance(item, dict):
                    self.issue("FAIL", field + ".evidence", "Evidence entries must be objects.")
                    continue
                self.artifact(item, field + ".evidence[" + str(index) + "]")
                method = item.get("method")
                if self.require(_text(method) and method in METHODS, field + ".evidence.method", "Unknown review evidence method."):
                    methods.add(method)
        if name == "sound_check":
            self.require("full_audio_1x" in methods and "muted_phone" in methods, field + ".evidence",
                         "Sound check needs actual full 1x audio and muted phone-size evidence.", "NOT_CHECKED")
        if name in ("editorial_peer", "blind_review"):
            self.require("full_av_1x" in methods and "muted_phone" in methods, field + ".evidence",
                         "This review needs actual full 1x A/V and muted phone-size evidence.", "NOT_CHECKED")
        return (_reviewer_id(reviewer.get("id")), stamp) if _text(reviewer.get("id")) and stamp else None

    def sound(self, gate, profile):
        data = gate.get("sound_check")
        field = "gates.sound_check.sound_check"
        if not isinstance(data, dict):
            self.issue("NOT_CHECKED", field, "Actual first-exposure listening and answer records are missing.")
            return
        self.truth_checks(data, ("full_listen", "first_exposure", "phone_muted"), field)
        self.require(data.get("script_primed") is False, field + ".script_primed",
                     "The sound-check reviewer must answer before seeing the script.")
        self.require(_number(data.get("playback_speed")) and data["playback_speed"] == 1,
                     field + ".playback_speed", "The complete sound check must be heard at normal speed.")
        required = profile.get("sound_check_required_facts") if isinstance(profile, dict) else None
        if not isinstance(required, dict) or not all(_strings(required.get(k)) for k in FACTS):
            self.issue("NOT_CHECKED", "profile.sound_check_required_facts",
                       "Predeclared pinned required message, benefit, action and conditions facts are missing.")
        answers = data.get("answers")
        self.require(isinstance(answers, dict) and all(_text(answers.get(k)) for k in FACTS),
                     field + ".answers", "Four unprompted recall answers must be recorded.", "NOT_CHECKED")
        self.truth_checks(data.get("comparison"), FACTS, field + ".comparison")

    def blind(self, gate, completed, artifacts):
        field = "gates.blind_review.blind"
        data = gate.get("blind")
        if not isinstance(data, dict):
            self.issue("NOT_CHECKED", field, "The blind packet, scope and locked verdict record are missing.")
            return
        self.require(data.get("scope") == "process_blind", field + ".scope",
                     "Declare process_blind honestly; this contract does not certify identity-blind perception.")
        self.truth_checks(data, ("fresh_reviewer", "residual_cues_reviewed"), field)
        for item in ("prior_history_seen", "prior_feedback_seen"):
            self.require(data.get(item) is False, field + "." + item,
                         "A blind reviewer cannot have prior project history or verdicts.")
        self.require(_strings(data.get("residual_identity_cues"), allow_empty=True),
                     field + ".residual_identity_cues",
                     "Residual identity/category cues must be explicitly reported, including [] when none were found.")
        excluded = data.get("excluded_information")
        self.require(_strings(excluded) and BLIND_EXCLUSIONS.issubset(set(excluded)),
                     field + ".excluded_information", "Authors, provider, cost, versions and prior verdicts must be withheld.")
        for role, bound_role in (("packet", "blind_packet"), ("review_copy", "blind_copy")):
            descriptor = data.get(role)
            self.artifact(descriptor, field + "." + role)
            bound = artifacts.get(bound_role)
            if (isinstance(bound, dict) and _text(bound.get("sha256")) and
                    isinstance(descriptor, dict) and _text(descriptor.get("sha256"))):
                self.require(descriptor["sha256"].lower() == bound["sha256"].lower(),
                             field + "." + role,
                             "Blind evidence is not the packet/copy bound before the review sequence.")
            else:
                self.issue("NOT_CHECKED", field + "." + role,
                           "The pre-review blind packet/copy artifact binding is unavailable.")
        locked = _stamp(data.get("verdict_locked_at"))
        finished = completed.get("blind_review")
        unblind_raw = data.get("unblinded_at")
        unblind = _stamp(unblind_raw) if unblind_raw is not None else None
        self.require(locked is not None and finished is not None and locked <= finished,
                     field + ".verdict_locked_at", "The verdict must be locked by completion.")
        self.require(unblind_raw is None or (unblind is not None and finished is not None and unblind >= finished),
                     field + ".unblinded_at", "Unblinding must occur only after the completed locked verdict.")
        others = [value for key, value in completed.items() if key != "blind_review"]
        if len(others) < 4:
            self.issue("NOT_CHECKED", field,
                       "Blind final-order verification awaits the other four completed review records.")
        else:
            self.require(finished is not None and all(finished >= value for value in others),
                         field, "Blind review is the final gate after the other four completed checks.")
            self.require(locked is not None and all(locked >= value for value in others),
                         field + ".verdict_locked_at",
                         "The blind verdict may be locked only after all four earlier gates completed.")

    def result(self):
        failed = any(item["status"] == "FAIL" for item in self.issues)
        missing = any(item["status"] == "NOT_CHECKED" for item in self.issues)
        return {
            "status": "FAIL" if failed else "NOT_CHECKED" if missing else "READY",
            "exit_code": 1 if failed else 2 if missing else 0,
            "approved_for_presentation": not (failed or missing),
            "root": str(self.root),
            "root_given": str(self.root_given),
            "issues": self.issues,
            "limits": "Checks local evidence, hashes and reviewer attestations only; does not certify actual listening, perceptual quality, anonymity or performance lift.",
        }


def validate_record(record, root) -> dict:
    return Validator(Path(root)).validate(record)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, epilog=PRODUCTION_CONTRACT,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("record", type=Path, help="Local JSON review record, inside --root.")
    parser.add_argument("--root", type=Path, help="Containing evidence root; defaults to record parent.")
    args = parser.parse_args(argv)
    root = (args.root or args.record.parent).absolute()
    validator = Validator(root)
    try:
        relative = args.record.resolve().relative_to(validator.root)
    except (ValueError, OSError, RuntimeError):
        validator.issue("FAIL", "record", "Record itself must be contained inside the evidence root.")
        result = validator.result()
    else:
        path = validator.path(relative.as_posix(), "record")
        record = validator.json_file(path, "record")
        result = validator.validate(record) if record is not None else validator.result()
    print(json.dumps(result, indent=2))
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
