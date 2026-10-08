#!/usr/bin/env python3
"""Pick the bb threads from the last N days worth reviewing, for the reviewers.

Usage: python3 collect-threads.py [--days 7] [--top 30] [--out DIR]

Scores every thread `bb tokenomics threads` reports, reads the event logs of
the best-scoring ones to add their failed commands, and selects the top N.
Writes into DIR, and prints DIR on the last line:
  index.tsv              every scored thread: selected, batch, id, project,
                         origin plugin, turns, user turns, bytes, title,
                         tool calls, failed commands, tokens, score
  <thread-id>.txt        a selected thread's trimmed transcript
                         (see selection.trim)
  <thread-id>.tools.txt  its tokenomics numbers, token usage, and tool calls
                         (see tool_stats.py)
  tool-summary.md        tool and token patterns across the threads whose
                         logs were read
  slow-commands.json     `bb tokenomics commands` for the same days
  batch-<n>.md           each selected thread in batch n with its numbers,
                         pasted into that batch's reviewer prompt

Selected threads are packed into batches of about BATCH_BYTES of trimmed
transcript so each reviewer subagent gets a similar amount to read.
Skips the current thread (BB_THREAD_ID) and hidden threads.
"""

import argparse
import datetime
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from selection import estimate, flagged_commands, pack, score, select, signals, trim  # noqa: E402
from tool_stats import digest, duration, human, summary, thread_stats  # noqa: E402

BATCH_BYTES = 100_000
# Event logs are read for this many times --top threads, so failed commands
# can reorder the top of the ranking without reading every thread's log.
POOL_FACTOR = 2


def bb(*args):
    return subprocess.run(
        ["bb", *args], check=True, capture_output=True, text=True
    ).stdout


def tokenomics_line(entry):
    """One line of the thread's tokenomics numbers, for the top of .tools.txt."""
    s = signals(entry)
    parts = [
        f"{human(s['tokens'])} tokens",
        f"{s['turns']} turns",
        f"{(entry.get('subagents') or {}).get('count') or 0} subagents ({human(s['subagent_tokens'])} tokens)",
    ]
    if s["context_peak"]:
        parts.append(f"peak context {human(s['context_peak'])}")
    if s["turn_p90"]:
        parts.append(f"turn p90 {duration(s['turn_p90'])}, longest {duration(s['turn_longest'])}")
    if s["waiting"]:
        parts.append(f"waited on the user {duration(s['waiting'])}")
    return "Tokenomics: " + ", ".join(parts) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--top", type=int, default=30)
    parser.add_argument("--out")
    opts = parser.parse_args()

    today = datetime.date.today().isoformat()
    out = opts.out or f"/tmp/self-improve-{today}"
    os.makedirs(out, exist_ok=True)

    entries = json.loads(
        bb("tokenomics", "threads", "--days", str(opts.days), "--limit", "200", "--json")
    )
    if len(entries) >= 200:
        print("warning: tokenomics returned 200 threads, the most it lists; some were left out", file=sys.stderr)
    with open(os.path.join(out, "slow-commands.json"), "w") as f:
        f.write(bb("tokenomics", "commands", "--days", str(opts.days), "--json"))

    # Tokenomics does not report which plugin started a thread or whether it
    # is hidden, so look those up in the thread list.
    listed = {t["id"]: t for t in json.loads(bb("thread", "list", "--json"))}
    current = os.environ.get("BB_THREAD_ID")
    entries = [
        e
        for e in entries
        if e["threadId"] != current
        and (listed.get(e["threadId"]) or {}).get("visibility") != "hidden"
    ]
    unlisted = sum(1 for e in entries if e["threadId"] not in listed)
    if unlisted:
        print(f"warning: {unlisted} threads are not in `bb thread list`; their origin plugin is unknown", file=sys.stderr)

    def origin(e):
        return (listed.get(e["threadId"]) or {}).get("originPluginId")

    def title(e):
        t = listed.get(e["threadId"]) or {}
        return (e.get("title") or t.get("title") or t.get("titleFallback") or "-").replace("\t", " ")

    def ranked(scores):
        return sorted(entries, key=lambda e: scores[e["threadId"]], reverse=True)

    # First pass on tokenomics numbers alone, to pick whose logs to read.
    first = dict(zip((e["threadId"] for e in entries), score([signals(e) for e in entries])))
    pool = select([(e["threadId"], origin(e)) for e in ranked(first)], opts.top * POOL_FACTOR)

    stats = {}
    for e in entries:
        if e["threadId"] in pool:
            stats[e["threadId"]] = thread_stats(json.loads(bb("thread", "log", e["threadId"], "--json", "--all")))

    # Second pass adds failed commands for the threads whose logs were read.
    final = dict(
        zip(
            (e["threadId"] for e in entries),
            score([signals(e, stats.get(e["threadId"], {}).get("counts", {}).get("failed")) for e in entries]),
        )
    )
    order = ranked(final)
    chosen = select([(e["threadId"], origin(e)) for e in order], opts.top)

    rows = []
    for e in order:
        thread_id = e["threadId"]
        s = stats.get(thread_id)
        row = {
            "selected": "yes" if thread_id in chosen else "no",
            "batch": "-",
            "id": thread_id,
            "project": e.get("project") or "-",
            "origin": origin(e) or "-",
            "turns": str(e.get("turns") or 0),
            "user_turns": "-",
            "bytes": "-",
            "title": title(e),
            "tool_calls": "-",
            "failed": "-",
            "tokens": str(signals(e)["tokens"]),
            "score": str(final[thread_id]),
        }
        if s:
            n = s["counts"]
            row["tool_calls"] = str(n["commands"] + n["reads"] + n["edits"] + n["tools"])
            row["failed"] = str(n["failed"])
        if thread_id in chosen:
            log = bb("thread", "log", thread_id, "--format", "minimal", "--all")
            text = trim(log, flagged_commands(s))
            with open(os.path.join(out, f"{thread_id}.txt"), "w") as f:
                f.write(text)
            with open(os.path.join(out, f"{thread_id}.tools.txt"), "w") as f:
                f.write(tokenomics_line(e) + digest(s))
            row["numbers"] = tokenomics_line(e).removeprefix("Tokenomics: ").strip()
            row["user_turns"] = str(log.count("── User "))
            row["bytes"] = str(len(text))
        rows.append(row)

    # Keep a project's threads together so a reviewer can spot repeats.
    picked = sorted((r for r in rows if r["selected"] == "yes"), key=lambda r: (r["project"], r["id"]))
    batches = pack([(r["id"], int(r["bytes"])) for r in picked], BATCH_BYTES)
    for row in picked:
        row["batch"] = str(batches[row["id"]])
    picked.sort(key=lambda r: (int(r["batch"]), r["project"], r["id"]))
    batch = max(batches.values(), default=0)

    for n in range(1, batch + 1):
        with open(os.path.join(out, f"batch-{n}.md"), "w") as f:
            for r in picked:
                if r["batch"] == str(n):
                    f.write(
                        f"- {r['id']} ({r['project']}, started by {r['origin'] if r['origin'] != '-' else 'the user'}): "
                        f"{r['title']}\n  {r['numbers']}; {r['user_turns']} user messages, {r['tool_calls']} tool calls, "
                        f"{r['failed']} failed commands; transcript {human(int(r['bytes']))}B\n"
                    )

    columns = [c for c in rows[0] if c != "numbers"] if rows else ["selected", "batch", "id"]
    with open(os.path.join(out, "index.tsv"), "w") as f:
        f.write("\t".join(columns) + "\n")
        for row in picked + [r for r in rows if r["selected"] == "no"]:
            f.write("\t".join(row[c] for c in columns) + "\n")

    with open(os.path.join(out, "tool-summary.md"), "w") as f:
        f.write(summary([(e["threadId"], title(e), stats[e["threadId"]]) for e in order if e["threadId"] in stats]))

    print(f"{len(rows)} threads scored, {len(picked)} selected, in {batch} batches")
    print(f"estimate: {batch} batch reviewers + 1 tool reviewer, about {human(estimate(batch))} tokens")
    print(out)


if __name__ == "__main__":
    main()
