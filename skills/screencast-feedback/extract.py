#!/usr/bin/env python3
"""Turn a screencast into a transcript, a set of screenshots, and one timeline.

    python3 extract.py <video> [--out DIR] [--language en] [--model turbo]
                       [--change 0.002] [--min-gap 2.0] [--max-frames 80]

Writes to DIR (default /tmp/screencast-feedback/<video-stem>/):

    timeline.md      screenshots and transcript interleaved in time order; read this first
    transcript.txt   the transcript alone, one timestamped line per segment
    transcript.json  Whisper's raw output
    frames/          JPEG screenshots, long edge at most 1568px
    manifest.json    video metadata plus every frame with its time and reason

Screenshots are taken once the screen settles after a change, and partway into each
spoken phrase, then dropped when they look the same as the screenshot before them. Only ffmpeg, ffprobe, and the `whisper` CLI are needed; Python is stdlib.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_EDGE = 1568  # Larger images are downscaled by Claude anyway.
SAMPLE_FPS = 4
THUMB_W = 192
PIXEL_DELTA = 12  # A thumbnail pixel counts as changed when it moves this much (0-255).


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def fmt(t):
    m, s = divmod(max(t, 0), 60)
    return f"{int(m):02d}:{s:04.1f}"


def probe(video):
    out = run(["ffprobe", "-v", "error", "-show_entries",
               "format=duration:stream=codec_type,width,height", "-of", "json", str(video)])
    info = json.loads(out.stdout)
    streams = info.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not v:
        sys.exit(f"No video stream in {video}")
    return {
        "duration": float(info["format"]["duration"]),
        "width": v["width"],
        "height": v["height"],
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def transcribe(video, out_dir, model, language):
    if not shutil.which("whisper"):
        print("whisper CLI not found; skipping transcript (brew install openai-whisper)", file=sys.stderr)
        return []
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "audio.wav"
        run(["ffmpeg", "-v", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000", str(wav)])
        cmd = ["whisper", str(wav), "--model", model, "--output_format", "json",
               "--output_dir", tmp, "--verbose", "False", "--fp16", "False",
               "--condition_on_previous_text", "False", "--word_timestamps", "True"]
        if language:
            cmd += ["--language", language]
        print(f"Transcribing with whisper {model}...", file=sys.stderr)
        run(cmd)
        raw = json.loads((Path(tmp) / "audio.json").read_text())
    (out_dir / "transcript.json").write_text(json.dumps(raw, indent=2))
    segments = phrases(raw.get("segments", []))
    (out_dir / "transcript.txt").write_text(
        "".join(f"[{fmt(s['start'])}] {s['text']}\n" for s in segments))
    return segments


def phrases(raw_segments, max_len=8.0, pause=0.8):
    """Split Whisper segments, which can run 15+ seconds, into short phrases.

    A phrase ends at sentence punctuation, at a pause, or after max_len seconds, so each
    remark gets its own timestamp and its own screenshot.
    """
    words = [dict(w) for seg in raw_segments for w in seg.get("words", [])]
    for w in words:
        # After a silence, Whisper often starts the next word where the last one ended,
        # stretching it across the pause. Its end time is accurate, so pull the start in.
        if w["end"] - w["start"] > 1.5:
            w["start"] = w["end"] - 0.5
    if not words:
        return [{"start": s["start"], "end": s["end"], "text": s["text"].strip()}
                for s in raw_segments if s["text"].strip()]
    out, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        nxt = words[i + 1] if i + 1 < len(words) else None
        text = w["word"].strip()
        if (nxt is None or text.endswith((".", "?", "!")) or nxt["start"] - w["end"] > pause
                or w["end"] - cur[0]["start"] > max_len):
            phrase = "".join(x["word"] for x in cur).strip()
            if phrase:
                out.append({"start": cur[0]["start"], "end": cur[-1]["end"], "text": phrase})
            cur = []
    return out


def sample_screen(video, width, height):
    """Decode small grayscale thumbnails at SAMPLE_FPS: [(time, bytes), ...]."""
    th = max(2, round(THUMB_W * height / width / 2) * 2)
    proc = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-an", "-vf",
                           f"fps={SAMPLE_FPS},scale={THUMB_W}:{th},format=gray",
                           "-f", "rawvideo", "-"], capture_output=True, check=True)
    size = THUMB_W * th
    data = proc.stdout
    return [(i / SAMPLE_FPS, data[o:o + size]) for i, o in enumerate(range(0, len(data) - size + 1, size))]


def changed(a, b):
    """Fraction of thumbnail pixels that differ noticeably between two samples."""
    return sum(abs(x - y) > PIXEL_DELTA for x, y in zip(a, b)) / len(a)


def settled_changes(samples, threshold):
    """Times at which the screen settles after changing by more than threshold.

    A change catches the middle of a transition or animation. Wait until two samples
    in a row (half a second) are still, so the screenshot shows where things landed.
    """
    times, moving, still = [], False, 0
    for (_, prev), (t, cur) in zip(samples, samples[1:]):
        if changed(prev, cur) > threshold:
            moving, still = True, 0
        elif moving:
            still += 1
            if still == 2:
                times.append(t)
                moving = False
    return times


def candidates(duration, settles, segments, min_gap):
    picks = [(0.5, "start")]
    picks += [(t, "screen changed") for t in settles]
    # Partway into a phrase is when "this" or "here" usually points at something.
    picks += [(s["start"] + min(1.5, (s["end"] - s["start"]) / 2), "speech") for s in segments]
    picks = sorted((min(t, duration - 0.1), why) for t, why in picks)
    kept = []
    for t, why in picks:
        if kept and t - kept[-1][0] < min_gap:
            continue
        kept.append((t, why))
    return kept


def grab(video, t, path):
    scale = f"scale='if(gt(iw,ih),min({MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min({MAX_EDGE},ih))'"
    run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1",
         "-vf", scale, "-q:v", "3", "-y", str(path)])


def extract_frames(video, frames_dir, picks, samples, threshold, max_frames):
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("*.jpg"):
        old.unlink()
    frames, last_thumb = [], None
    for t, why in picks:
        thumb = samples[min(round(t * SAMPLE_FPS), len(samples) - 1)][1] if samples else None
        if last_thumb is not None and thumb is not None and changed(thumb, last_thumb) <= threshold:
            continue
        last_thumb = thumb
        path = frames_dir / f"tmp-{t:09.3f}.jpg"
        grab(video, t, path)
        frames.append({"time": t, "reason": why, "path": path})
    if len(frames) > max_frames:
        # Keep an even spread, always including the first and last.
        step = (len(frames) - 1) / (max_frames - 1)
        keep = {round(i * step) for i in range(max_frames)}
        for i, f in enumerate(frames):
            if i not in keep:
                f["path"].unlink()
        frames = [f for i, f in enumerate(frames) if i in keep]
    for i, f in enumerate(frames, 1):
        m, s = divmod(int(f["time"]), 60)
        final = frames_dir / f"{i:03d}-{m:02d}m{s:02d}s.jpg"
        f["path"].rename(final)
        f["path"] = final
    return frames


def write_timeline(out_dir, video, meta, frames, segments, model):
    lines = [
        f"# Screencast: {video.name}",
        "",
        f"Source: `{video}`  ",
        f"Duration {fmt(meta['duration'])}, {meta['width']}x{meta['height']}, "
        f"{len(frames)} screenshots, {len(segments)} transcript segments"
        + (f" (whisper {model})" if segments else ""),
        "",
        "Each section starts with a screenshot and lists what was said until the next one. "
        "Times are mm:ss.s from the start of the video.",
        "",
    ]
    if not meta["has_audio"]:
        lines += ["**This recording has no audio track.**", ""]
    elif not segments:
        lines += ["**No speech was transcribed.**", ""]
    seg_i = 0
    for i, f in enumerate(frames):
        until = frames[i + 1]["time"] if i + 1 < len(frames) else float("inf")
        lines += [f"## {fmt(f['time'])} ({f['reason']})", "", f"![{fmt(f['time'])}]({f['path']})", ""]
        while seg_i < len(segments) and segments[seg_i]["start"] < until:
            s = segments[seg_i]
            lines.append(f"> [{fmt(s['start'])}–{fmt(s['end'])}] {s['text']}  ")
            seg_i += 1
        lines.append("")
    (out_dir / "timeline.md").write_text("\n".join(lines))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--language", help="Whisper language code, e.g. en. Auto-detected if omitted.")
    ap.add_argument("--model", default="turbo", help="Whisper model (default: turbo)")
    ap.add_argument("--change", type=float, default=0.002,
                    help="Fraction of the screen that must change to count, 0-1 (default: 0.002)")
    ap.add_argument("--min-gap", type=float, default=2.0, help="Minimum seconds between screenshots")
    ap.add_argument("--max-frames", type=int, default=80)
    ap.add_argument("--no-transcript", action="store_true")
    args = ap.parse_args()

    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not found (brew install ffmpeg)")
    video = args.video.expanduser().resolve()
    if not video.is_file():
        sys.exit(f"Not a file: {video}")
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", video.stem).strip("-")
    out_dir = (args.out or Path("/tmp/screencast-feedback") / stem).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    meta = probe(video)
    segments = []
    if meta["has_audio"] and not args.no_transcript:
        segments = transcribe(video, out_dir, args.model, args.language)
    print("Finding screen changes...", file=sys.stderr)
    samples = sample_screen(video, meta["width"], meta["height"])
    settles = settled_changes(samples, args.change)
    picks = candidates(meta["duration"], settles, segments, args.min_gap)
    print(f"Extracting up to {len(picks)} screenshots...", file=sys.stderr)
    frames = extract_frames(video, out_dir / "frames", picks, samples, args.change, args.max_frames)
    write_timeline(out_dir, video, meta, frames, segments, args.model)
    (out_dir / "manifest.json").write_text(json.dumps({
        "video": str(video),
        **meta,
        "screen_changes": len(settles),
        "frames": [{"time": round(f["time"], 2), "reason": f["reason"], "path": str(f["path"])} for f in frames],
        "segments": len(segments),
    }, indent=2))
    print(out_dir / "timeline.md")


if __name__ == "__main__":
    main()
