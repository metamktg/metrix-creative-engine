#!/usr/bin/env python3
"""Per-frame eye state for a video clip, from MediaPipe Face Landmarker blendshapes.

    python eye_state.py CLIP --out scores.json [--model face_landmarker.task] [--width 540]

Every DECODED frame of the clip's first video stream is scored, at the source's own rate (no fps
filter; -fps_mode passthrough), so frame n here is frame n in eye-sheet.mjs and in the timeline's
floor((t - out_in + src_in) * src_fps) mapping. Frame times come from ffprobe frame pts_time, the
same command probe.mjs framePts runs, and the decoded frame count must equal it or the run fails.

The landmarker runs in VIDEO mode (tracking between frames, timestamps in integer ms, strictly
increasing) with output_face_blendshapes on, one face. Each frame records
    {n, t, eyeBlinkLeft, eyeBlinkRight, face_found}
with the two blink scores null when no face was found. Nothing here judges the scores: the gate
lives in eye-state.mjs, which reads this file.

Runs in the 3.12 venv (X:/Metrix/venv312) that holds mediapipe; it is not needed on CI, where
the tests read a committed scores fixture instead. ffmpeg and ffprobe come from PATH, or from
MCE_FFMPEG and MCE_FFPROBE, as in probe.mjs.

Exit codes: 0 written, 2 error (message on stderr, prefixed with a code).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

SCHEMA = "mce.eyestate/1"
FIELDS = ("eyeBlinkLeft", "eyeBlinkRight")


class EyeStateError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def run(args):
    try:
        return subprocess.run(args, capture_output=True, check=False)
    except FileNotFoundError as e:
        raise EyeStateError("NOBIN", f"{args[0]} not found: {e}")


def probe_video(ffprobe, clip):
    r = run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height,r_frame_rate", "-of", "json", clip])
    if r.returncode != 0:
        raise EyeStateError("UNREADABLE", r.stderr.decode("utf8", "replace").strip()[-300:])
    streams = json.loads(r.stdout).get("streams") or []
    if not streams:
        raise EyeStateError("UNREADABLE", f"{clip} has no video stream")
    s = streams[0]
    num, _, den = str(s.get("r_frame_rate", "0/1")).partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else None
    return int(s["width"]), int(s["height"]), fps


def frame_pts(ffprobe, clip):
    # Same command as probe.mjs framePts, so both sides agree on frame n and its time.
    r = run([ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", clip])
    if r.returncode != 0:
        raise EyeStateError("UNREADABLE", r.stderr.decode("utf8", "replace").strip()[-300:])
    out = []
    for line in r.stdout.decode("utf8").splitlines():
        v = line.strip().strip(",")
        if v and v != "N/A":
            out.append(float(v))
    return out


def decode(ffmpeg, clip, width, height, scale):
    """Yield RGB frames (width x height) as bytes, every decoded frame at the source rate."""
    args = [ffmpeg, "-hide_banner", "-nostats", "-v", "error", "-i", clip, "-map", "0:v:0", "-fps_mode", "passthrough"]
    if scale:
        args += ["-vf", f"scale={width}:{height}:flags=area"]
    args += ["-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    try:
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except FileNotFoundError as e:
        raise EyeStateError("NOBIN", f"{ffmpeg} not found: {e}")
    size = width * height * 3
    try:
        while True:
            buf = p.stdout.read(size)
            if not buf:
                break
            if len(buf) != size:
                raise EyeStateError("FFMPEG", "short frame read from ffmpeg")
            yield buf
    finally:
        p.stdout.close()
        err = p.stderr.read().decode("utf8", "replace")
        p.stderr.close()
        if p.wait() != 0:
            raise EyeStateError("FFMPEG", err.strip()[-300:])


def score_clip(clip, model, width=None, ffmpeg="ffmpeg", ffprobe="ffprobe"):
    import mediapipe as mp
    import numpy as np
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    if not os.path.isfile(clip):
        raise EyeStateError("UNREADABLE", f"no such clip: {clip}")
    if not os.path.isfile(model):
        raise EyeStateError("NOMODEL", f"no Face Landmarker model at {model}")
    src_w, src_h, fps = probe_video(ffprobe, clip)
    if width:
        w = int(width) - int(width) % 2
        h = int(round(src_h * w / src_w / 2)) * 2
    else:
        w, h = src_w, src_h
    pts = frame_pts(ffprobe, clip)

    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=1,
        output_face_blendshapes=True,
    )
    frames = []
    started = time.time()
    last_ms = -1
    with vision.FaceLandmarker.create_from_options(options) as lm:
        for n, buf in enumerate(decode(ffmpeg, clip, w, h, (w, h) != (src_w, src_h))):
            if n >= len(pts):
                raise EyeStateError("FRAME_MISMATCH", f"decoded more frames than ffprobe listed ({len(pts)})")
            t = pts[n]
            ms = int(round(t * 1000))
            if ms <= last_ms:
                ms = last_ms + 1  # VIDEO mode needs strictly increasing integer ms
            last_ms = ms
            img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.frombuffer(buf, dtype=np.uint8).reshape(h, w, 3))
            res = lm.detect_for_video(img, ms)
            rec = {"n": n, "t": round(t, 6), "eyeBlinkLeft": None, "eyeBlinkRight": None, "face_found": False}
            if res.face_blendshapes:
                cats = {c.category_name: c.score for c in res.face_blendshapes[0]}
                if all(k in cats for k in FIELDS):
                    rec.update({k: round(float(cats[k]), 6) for k in FIELDS})
                    rec["face_found"] = True
            frames.append(rec)
    if len(frames) != len(pts):
        raise EyeStateError("FRAME_MISMATCH", f"decoded {len(frames)} frames but ffprobe listed {len(pts)}")
    return {
        "schema": SCHEMA,
        "clip": os.path.abspath(clip),
        "clip_sha256": sha256(clip),
        "model": os.path.abspath(model),
        "model_sha256": sha256(model),
        "mediapipe": getattr(mp, "__version__", None),
        "running_mode": "VIDEO",
        "fps": fps,
        "source_size": [src_w, src_h],
        "scored_size": [w, h],
        "frame_count": len(frames),
        "faces_found": sum(1 for f in frames if f["face_found"]),
        "seconds": round(time.time() - started, 2),
        "frames": frames,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("clip")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default=os.environ.get("MCE_FACE_MODEL", "X:/Metrix/models/face_landmarker.task"))
    ap.add_argument("--width", type=int, default=None, help="score a downscaled copy this wide (default: source size)")
    a = ap.parse_args(argv)
    try:
        rec = score_clip(a.clip, a.model, a.width, os.environ.get("MCE_FFMPEG", "ffmpeg"), os.environ.get("MCE_FFPROBE", "ffprobe"))
    except EyeStateError as e:
        print(f"eye_state: {e.code} {e}", file=sys.stderr)
        return 2
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf8", newline="\n") as f:
        f.write(json.dumps(rec, indent=1) + "\n")
    print(f"{a.out}\n{rec['frame_count']} frames, {rec['faces_found']} with a face, {rec['seconds']} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
