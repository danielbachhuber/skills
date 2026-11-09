"""Price a finding: what its problem cost, and what its fix would save.

Every model call re-reads the whole context, so a turn's tokens are close to
its context size times its model calls. A fix that removes calls saves about
(calls removed) x (tokens per call in that turn), and the same share of the
turn's time.

Reviewers name the calls in their findings by turn number, from the `Turns`
table in each thread's `.tools.txt`. `build_turns` makes that table, `price`
adds up a finding's named calls, and `describe` writes the numbers for a
card. `load_turns` reads the Tokenomics database and the Claude Code
transcript; everything else is pure.
"""

import glob
import json
import os
import sqlite3

DB = os.path.expanduser("~/.bb/plugins/tokenomics/data.db")
TRANSCRIPTS = os.path.expanduser("~/.claude/projects")
SAID_CHARS = 60


def build_turns(turn_rows, usage_rows, context_rows, call_times=None, requests=None):
    """One dict per turn, numbered from 1 in the order the turns started.

    turn_rows:    (started_at, completed_at) per turn; completed_at may be None
    usage_rows:   (created_at, tokens), one per turn as Tokenomics records it
    context_rows: (created_at, used_tokens), sampled during each call
    call_times:   created_at of each model call, from the transcript; without
                  it, calls are counted as distinct context sizes in the turn
    requests:     (created_at, text) of each message that started a turn
    """
    starts = sorted((s, e) for s, e in turn_rows if s is not None)
    turns = []
    for i, (start, end) in enumerate(starts):
        following = starts[i + 1][0] if i + 1 < len(starts) else None
        stop = end if end is not None else following

        def inside(t):
            # A turn's usage row lands at its end; the next turn's first
            # call can share the previous turn's last millisecond.
            return t >= start and (stop is None or t <= stop) and (following is None or t < following)

        tokens = sum(n for t, n in usage_rows if inside(t))
        sizes = [n for t, n in context_rows if inside(t)]
        if call_times is not None:
            calls = sum(1 for t in call_times if inside(t))
        else:
            calls = len(set(sizes))
        said = ""
        for t, text in requests or []:
            if t <= start:
                said = text
        turns.append(
            {
                "n": i + 1,
                "startedAt": start,
                "ms": (stop - start) if stop is not None else 0,
                "tokens": tokens,
                "calls": max(calls, 1) if tokens else calls,
                "context": max(sizes, default=0),
                "said": " ".join(said.split())[:SAID_CHARS],
            }
        )
    return turns


def tokens_text(n):
    for unit, size in (("M", 1_000_000), ("K", 1_000)):
        if n >= size:
            value = f"{n / size:.1f}".removesuffix(".0")
            return f"{value}{unit}"
    return str(n)


def time_text(ms):
    seconds = round(ms / 1000)
    if seconds < 60:
        return f"{seconds}s"
    minutes = round(seconds / 60)
    if minutes < 60:
        return f"{minutes} min"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}m" if minutes else f"{hours}h"


def turn_lines(turns):
    """The `Turns` table a reviewer cites calls from."""
    if not turns:
        return []
    lines = ["Turns (cite as `<thread> turn <n>: <calls> calls, removes <k>`):"]
    for t in turns:
        said = f'  "{t["said"]}"' if t["said"] else ""
        lines.append(
            f"  turn {t['n']}: {t['calls']} calls, {tokens_text(t['tokens'])} tokens, "
            f"{time_text(t['ms'])}, context up to {tokens_text(t['context'])}{said}"
        )
    return lines


def _share(turns, calls):
    """Tokens and time of `calls` calls spread evenly over `turns`."""
    total_calls = sum(t["calls"] for t in turns)
    if not total_calls:
        return 0, 0
    calls = min(calls, total_calls)
    tokens = sum(t["tokens"] for t in turns) * calls / total_calls
    ms = sum(t["ms"] for t in turns) * calls / total_calls
    return round(tokens), round(ms)


def price(removes, turns_by_thread):
    """Add up what a finding's named calls cost and what the fix removes.

    removes: [{"threadId", "turn"?, "calls"?, "removed"?}]
      turn     the turn number; left out, the whole thread
      calls    the calls the problem took there; left out, all of them
      removed  the calls the fix would remove; left out, the same as calls
    Returns (cost, savings, problems). problems names each entry that could
    not be priced, such as a thread with no turn data.
    """
    cost = {"tokens": 0, "ms": 0, "threads": 0}
    savings = {"tokens": 0, "ms": 0}
    threads, problems = set(), []
    for r in removes:
        turns = turns_by_thread.get(r["threadId"]) or []
        if r.get("turn") is not None:
            turns = [t for t in turns if t["n"] == r["turn"]]
        if not turns:
            where = f"turn {r['turn']}" if r.get("turn") is not None else "any turn"
            problems.append(f"{r['threadId']}: no data for {where}")
            continue
        available = sum(t["calls"] for t in turns)
        calls = min(r.get("calls") or available, available)
        removed = min(r.get("removed", calls), calls)
        tokens, ms = _share(turns, calls)
        cost["tokens"] += tokens
        cost["ms"] += ms
        tokens, ms = _share(turns, removed)
        savings["tokens"] += tokens
        savings["ms"] += ms
        threads.add(r["threadId"])
    cost["threads"] = len(threads)
    return cost, savings, problems


def describe_cost(cost):
    """'18.4M tokens, 42 min across 6 threads'"""
    n = cost["threads"]
    return f"{tokens_text(cost['tokens'])} tokens, {time_text(cost['ms'])} across {n} thread{'' if n == 1 else 's'}"


def describe_savings(savings):
    """'about 12M tokens, 30 min'"""
    return f"about {tokens_text(savings['tokens'])} tokens, {time_text(savings['ms'])}"


def requests_from_events(events):
    """(created_at, text) of each message sent to start a turn, from
    `bb thread log <id> --json --all`."""
    out = []
    for e in events:
        if e.get("type") != "client/turn/requested":
            continue
        parts = ((e.get("data") or {}).get("input")) or []
        text = " ".join(p.get("text", "") for p in parts if isinstance(p, dict))
        out.append((e.get("createdAt") or 0, text))
    return out


def _call_times(session_id):
    """created_at of each main-thread model call in a Claude Code transcript."""
    if not session_id:
        return None
    paths = glob.glob(os.path.join(TRANSCRIPTS, "*", f"{session_id}.jsonl"))
    if not paths:
        return None
    import datetime

    first = {}
    for path in paths:
        with open(path) as f:
            for line in f:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                if d.get("type") != "assistant" or d.get("isSidechain"):
                    continue
                message_id = (d.get("message") or {}).get("id")
                stamp = d.get("timestamp")
                if not message_id or not stamp or message_id in first:
                    continue
                when = datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                first[message_id] = when.timestamp() * 1000
    return list(first.values())


def load_turns(thread_id, requests=None, db=DB):
    """The thread's turns from the Tokenomics database, read-only, with model
    calls counted from its Claude Code transcript when there is one."""
    if not os.path.exists(db):
        return []
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        q = lambda sql: conn.execute(sql, (thread_id,)).fetchall()  # noqa: E731
        turn_rows = q("select started_at, completed_at from turn_times where thread_id = ?")
        usage_rows = q("select created_at, input + cache_read + output from usage where thread_id = ?")
        context_rows = q("select created_at, used_tokens from context where thread_id = ?")
        session = q("select session_id from threads where thread_id = ?")
    finally:
        conn.close()
    session_id = session[0][0] if session else None
    return build_turns(turn_rows, usage_rows, context_rows, _call_times(session_id), requests)
