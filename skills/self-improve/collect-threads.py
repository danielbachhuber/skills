#!/usr/bin/env python3
"""Dump every bb thread touched in the last N days, for the reviewers.

Usage: python3 collect-threads.py [--days 7] [--out DIR]

Writes into DIR, and prints DIR on the last line:
  <thread-id>.txt        the minimal transcript
  <thread-id>.tools.txt  its token usage and tool calls (see tool_stats.py)
  index.tsv              batch, id, project, origin plugin, user turns, bytes,
                         title, tool calls, tokens
  tool-summary.md        tool and token patterns across every thread

Threads are packed into batches of about BATCH_BYTES so each reviewer
subagent gets a similar amount of transcript to read.
Skips the current thread (BB_THREAD_ID) and hidden threads.
"""

import argparse
import datetime
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tool_stats import digest, summary, thread_stats  # noqa: E402

BATCH_BYTES = 250_000


def bb(*args):
    return subprocess.run(
        ["bb", *args], check=True, capture_output=True, text=True
    ).stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--out")
    opts = parser.parse_args()

    today = datetime.date.today().isoformat()
    out = opts.out or f"/tmp/self-improve-{today}"
    os.makedirs(out, exist_ok=True)

    cutoff_ms = (
        datetime.datetime.now() - datetime.timedelta(days=opts.days)
    ).timestamp() * 1000

    projects = {p["id"]: p["name"] for p in json.loads(bb("project", "list", "--json"))}
    projects.setdefault("proj_personal", "personal")
    threads = json.loads(bb("thread", "list", "--json"))

    # `bb thread list` returns a bounded window. If even its oldest thread is
    # inside the cutoff, older threads in the range may be missing.
    if threads and min(t["createdAt"] for t in threads) > cutoff_ms:
        print("warning: thread list may not reach back to the cutoff", file=sys.stderr)

    current = os.environ.get("BB_THREAD_ID")
    selected = [
        t
        for t in threads
        if t["updatedAt"] >= cutoff_ms
        and t["id"] != current
        and t.get("visibility") != "hidden"
    ]

    rows = []
    per_thread = []
    for t in selected:
        log = bb("thread", "log", t["id"], "--format", "minimal", "--all")
        with open(os.path.join(out, f"{t['id']}.txt"), "w") as f:
            f.write(log)
        title = (t.get("title") or t.get("titleFallback") or "-").replace("\t", " ")
        stats = thread_stats(json.loads(bb("thread", "log", t["id"], "--json", "--all")))
        with open(os.path.join(out, f"{t['id']}.tools.txt"), "w") as f:
            f.write(digest(stats))
        per_thread.append((t["id"], title, stats))
        counts = stats["counts"]
        rows.append(
            [
                t["id"],
                projects.get(t["projectId"], t["projectId"]),
                t.get("originPluginId") or "-",
                str(log.count("── User ")),
                str(len(log)),
                title,
                str(counts["commands"] + counts["reads"] + counts["edits"] + counts["tools"]),
                str(stats["tokens"]["total"]),
            ]
        )

    # Keep a project's threads together so a reviewer can spot repeats.
    rows.sort(key=lambda r: (r[1], r[0]))
    batch, batch_bytes = 1, 0
    for row in rows:
        if batch_bytes and batch_bytes + int(row[4]) > BATCH_BYTES:
            batch, batch_bytes = batch + 1, 0
        batch_bytes += int(row[4])
        row.insert(0, str(batch))

    with open(os.path.join(out, "index.tsv"), "w") as f:
        f.write("batch\tid\tproject\torigin\tuser_turns\tbytes\ttitle\ttool_calls\ttokens\n")
        for row in rows:
            f.write("\t".join(row) + "\n")

    with open(os.path.join(out, "tool-summary.md"), "w") as f:
        f.write(summary(per_thread))

    print(f"{len(rows)} threads in {batch} batches")
    print(out)


if __name__ == "__main__":
    main()
