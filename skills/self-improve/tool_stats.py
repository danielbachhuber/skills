"""Tool-call and token statistics from a bb thread's event log.

Pure functions over the list `bb thread log <id> --json --all` prints, so they
can be tested without bb. `thread_stats` reduces one thread to numbers and
short lists; `digest` renders them as the text a reviewer reads beside the
transcript; `summary` looks across every thread for the patterns no single
thread shows.
"""

import collections
import re

LIST_LIMIT = 8
COMMAND_CHARS = 160
SLOW_MS = 60_000
# Tools whose time is the user answering, not the tool working.
WAITS_ON_USER = {"AskUserQuestion", "ExitPlanMode"}
# A thread past this many tokens with no subagent is worth a look.
UNDELEGATED_TOKENS = 5_000_000


def _items(events):
    """Completed items, each with its duration when the start was logged."""
    started = {}
    for event in events:
        if event.get("type") == "item/started":
            item = (event.get("data") or {}).get("item") or {}
            started.setdefault(item.get("id"), event.get("createdAt"))
    items = []
    for event in events:
        if event.get("type") != "item/completed":
            continue
        item = dict((event.get("data") or {}).get("item") or {})
        begin = started.get(item.get("id"))
        end = event.get("createdAt")
        item["_ms"] = end - begin if begin is not None and end is not None else None
        items.append(item)
    return items


def _latest(events, kind, key):
    for event in reversed(events):
        if event.get("type") == kind:
            return ((event.get("data") or {}).get(key)) or None
    return None


def command_prefix(command):
    """The part of a command that says what kind it is: `gh pr`, `git status`."""
    text = command.strip()
    # A leading `cd somewhere &&` says where, not what.
    text = re.sub(r"^cd\s+\S+\s*(&&|;)\s*", "", text)
    words = [w for w in re.split(r"\s+", text) if w and not re.match(r"^[A-Z_]+=", w)]
    if not words:
        return ""
    head = words[0].rsplit("/", 1)[-1]
    second = words[1] if len(words) > 1 and re.match(r"^[a-z][a-z-]*$", words[1]) else None
    return f"{head} {second}" if second else head


def _short(command):
    one_line = " ".join(command.split())
    return one_line if len(one_line) <= COMMAND_CHARS else one_line[: COMMAND_CHARS - 1] + "…"


def thread_stats(events):
    items = _items(events)
    commands = [i for i in items if i.get("type") == "commandExecution"]
    tools = [i for i in items if i.get("type") == "toolCall"]
    reads = [i for i in items if i.get("type") == "fileRead"]
    edits = [i for i in items if i.get("type") == "fileChange"]
    # Subagent launches. A long thread with none is the costliest pattern:
    # every turn re-reads everything the main thread has gathered.
    delegations = [i for i in items if i.get("type") == "delegation"]

    usage = (_latest(events, "thread/tokenUsage/updated", "tokenUsage") or {}).get("total") or {}
    context = _latest(events, "thread/contextWindowUsage/updated", "contextWindowUsage") or {}
    stamps = [e["createdAt"] for e in events if isinstance(e.get("createdAt"), (int, float))]

    failed = [c for c in commands if c.get("exitCode") not in (0, None)]
    command_text = collections.Counter(_short(c.get("command", "")) for c in commands)
    read_paths = collections.Counter(r.get("path", "") for r in reads)

    def output_size(item):
        return len(item.get("aggregatedOutput") or item.get("result") or "")

    timed = [
        i
        for i in items
        if i.get("_ms") is not None
        and i.get("type") in ("commandExecution", "toolCall")
        and i.get("tool") not in WAITS_ON_USER
    ]

    return {
        "turns": sum(1 for e in events if e.get("type") == "turn/completed"),
        "wall_ms": (max(stamps) - min(stamps)) if stamps else 0,
        "tokens": {
            "total": usage.get("totalTokens", 0),
            "input": usage.get("inputTokens", 0),
            "cached": usage.get("cachedInputTokens", 0),
            "output": usage.get("outputTokens", 0),
        },
        "context": {"peak": context.get("usedTokens", 0), "window": context.get("modelContextWindow", 0)},
        "counts": {
            "commands": len(commands),
            "failed": len(failed),
            "reads": len(reads),
            "edits": len(edits),
            "tools": len(tools),
            "delegations": len(delegations),
        },
        "tool_names": collections.Counter(t.get("tool", "?") for t in tools),
        "prefixes": collections.Counter(command_prefix(c.get("command", "")) for c in commands),
        "failed_prefixes": collections.Counter(command_prefix(c.get("command", "")) for c in failed),
        "failed": [(c.get("exitCode"), _short(c.get("command", ""))) for c in failed],
        "repeated": [(n, text) for text, n in command_text.most_common() if n >= 3],
        "largest": sorted(
            ((output_size(i), _short(i.get("command") or i.get("tool") or "")) for i in commands + tools),
            reverse=True,
        )[:LIST_LIMIT],
        "slowest": sorted(
            ((i["_ms"], _short(i.get("command") or i.get("tool") or "")) for i in timed if i["_ms"] >= SLOW_MS),
            reverse=True,
        )[:LIST_LIMIT],
        "reread": [(n, path) for path, n in read_paths.most_common() if n >= 3],
    }


def human(n):
    for unit, size in (("M", 1_000_000), ("k", 1_000)):
        if n >= size:
            return f"{n / size:.1f}{unit}"
    return str(n)


def duration(ms):
    seconds = round(ms / 1000)
    if seconds < 60:
        return f"{seconds}s"
    minutes, seconds = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {seconds}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}m"


def digest(stats):
    t, c, n = stats["tokens"], stats["context"], stats["counts"]
    lines = [
        f"Tokens: {human(t['total'])} total (input {human(t['input'])}, cached {human(t['cached'])}, output {human(t['output'])})"
        + (f"; peak context {human(c['peak'])} of {human(c['window'])}" if c["window"] else ""),
        f"Turns: {stats['turns']}, wall time {duration(stats['wall_ms'])}",
        f"Tool calls: {n['commands']} commands ({n['failed']} failed), {n['reads']} file reads, "
        f"{n['edits']} file edits, {n['delegations']} subagents, {n['tools']} other tools"
        + (
            " (" + ", ".join(f"{name} {count}" for name, count in stats["tool_names"].most_common()) + ")"
            if stats["tool_names"]
            else ""
        ),
    ]

    def section(title, rows):
        if rows:
            lines.append(f"{title}:")
            lines.extend(f"  {row}" for row in rows[:LIST_LIMIT])

    section("Failed commands", [f"exit {code}  {text}" for code, text in stats["failed"]])
    section("Repeated commands", [f"{count}x  {text}" for count, text in stats["repeated"]])
    section("Largest outputs", [f"{human(size)}B  {text}" for size, text in stats["largest"] if size >= 10_000])
    section("Slowest calls", [f"{duration(ms)}  {text}" for ms, text in stats["slowest"]])
    section("Files read 3+ times", [f"{count}x  {path}" for count, path in stats["reread"]])
    return "\n".join(lines) + "\n"


def summary(per_thread):
    """per_thread: list of (thread_id, title, stats). Markdown for one reviewer."""
    total = sum(s["tokens"]["total"] for _, _, s in per_thread)
    lines = [
        "# Tool and token summary",
        "",
        f"{len(per_thread)} threads, {human(total)} tokens in all.",
        "",
        "## Most tokens",
        "",
    ]
    by_tokens = sorted(per_thread, key=lambda row: row[2]["tokens"]["total"], reverse=True)
    for thread_id, title, s in by_tokens[:10]:
        alone = s["tokens"]["total"] >= UNDELEGATED_TOKENS and s["counts"]["delegations"] == 0
        lines.append(
            f"- {thread_id} {human(s['tokens']['total'])} tokens, {s['turns']} turns, "
            f"{s['counts']['commands']} commands, {s['counts']['delegations']} subagents, "
            f"peak context {human(s['context']['peak'])}{', no subagents' if alone else ''}: {title}"
        )
    undelegated = [row for row in per_thread if row[2]["tokens"]["total"] >= UNDELEGATED_TOKENS]
    if undelegated:
        none = [row for row in undelegated if row[2]["counts"]["delegations"] == 0]
        lines.extend(
            [
                "",
                f"{len(none)} of the {len(undelegated)} threads over {human(UNDELEGATED_TOKENS)} tokens "
                f"started no subagent; together they used {human(sum(r[2]['tokens']['total'] for r in none))} tokens.",
            ]
        )

    def across(key, heading):
        threads_with = collections.Counter()
        calls = collections.Counter()
        for _, _, s in per_thread:
            for prefix, count in s[key].items():
                if prefix:
                    threads_with[prefix] += 1
                    calls[prefix] += count
        lines.extend(["", f"## {heading}", ""])
        for prefix, n in threads_with.most_common(12):
            lines.append(f"- `{prefix}`: {calls[prefix]} calls in {n} threads")

    across("failed_prefixes", "Commands that fail, by how many threads they fail in")
    across("prefixes", "Most used commands")

    tool_threads = collections.Counter()
    tool_calls = collections.Counter()
    for _, _, s in per_thread:
        for name, count in s["tool_names"].items():
            tool_threads[name] += 1
            tool_calls[name] += count
    lines.extend(["", "## Other tools", ""])
    for name, n in tool_threads.most_common(12):
        lines.append(f"- {name}: {tool_calls[name]} calls in {n} threads")

    lines.extend(["", "## Most failed commands in one thread", ""])
    for thread_id, title, s in sorted(per_thread, key=lambda row: row[2]["counts"]["failed"], reverse=True)[:8]:
        if s["counts"]["failed"]:
            lines.append(f"- {thread_id} {s['counts']['failed']} of {s['counts']['commands']} failed: {title}")
    return "\n".join(lines) + "\n"
