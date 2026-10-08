"""Pick which threads a self-improve run reviews, and trim their transcripts.

Pure functions over `bb tokenomics threads --json` entries and `bb thread log`
output, so they can be tested without bb. `score` ranks a thread by how much
it cost and how much the user had to step in; `select` takes the top of that
ranking without letting one plugin's routine threads crowd it; `trim` cuts a
minimal transcript down to the parts a reviewer reads.
"""

import re

# Weights for each signal's percentile rank among the threads in the run.
WEIGHTS = {
    "tokens": 3.0,
    "turns": 2.0,
    "failed": 2.0,
    "subagent_tokens": 1.0,
    "context_peak": 1.0,
    "turn_p90": 1.0,
    "turn_longest": 0.5,
    "waiting": 1.0,
}
PER_PLUGIN = 2
# Longest kept section, by speaker. A long assistant reply keeps its start and
# its end, where the question the user answered usually is.
SECTION_CHARS = {"User": 3000, "Assistant": 1200}
# What one reviewer subagent costs on about BATCH_BYTES of transcript.
TOKENS_PER_REVIEWER = 2_000_000


def signals(entry, failed=None):
    """The numbers `score` ranks, from one `bb tokenomics threads` entry.

    `failed` is the thread's failed-command count from its event log, when
    that log has been read. Recording started in October 2026, so older
    threads have nulls for context and turn times; those count as 0.
    """

    def get(*path):
        value = entry
        for key in path:
            value = (value or {}).get(key)
        return value or 0

    return {
        "tokens": get("tokens", "total"),
        "turns": get("turns"),
        "failed": failed or 0,
        "subagent_tokens": get("subagents", "tokens"),
        "context_peak": get("context", "peak"),
        "turn_p90": get("turnTime", "p90Ms"),
        "turn_longest": get("turnTime", "longestMs"),
        "waiting": get("waitingOnYou", "ms"),
    }


def _ranks(values):
    """Each value's percentile rank, 0 to 1, with ties sharing a rank. Zero ranks 0."""
    ordered = sorted(values)
    n = len(ordered)
    ranks = []
    for v in values:
        if not v or n < 2:
            ranks.append(0.0)
            continue
        below = sum(1 for o in ordered if o < v)
        ranks.append(below / (n - 1))
    return ranks


def score(rows):
    """rows: list of signal dicts. Returns one score per row, higher is worth more review."""
    totals = [0.0] * len(rows)
    for key, weight in WEIGHTS.items():
        for i, rank in enumerate(_ranks([r[key] for r in rows])):
            totals[i] += weight * rank
    return [round(t, 3) for t in totals]


def select(ranked, top, per_plugin=PER_PLUGIN):
    """ranked: (thread_id, origin_plugin_or_None) pairs, best first.

    Returns the set of up to `top` thread IDs, taking at most `per_plugin`
    threads started by any one plugin. Threads the user started have no cap.
    """
    chosen, per = [], {}
    for thread_id, plugin in ranked:
        if len(chosen) >= top:
            break
        if plugin:
            if per.get(plugin, 0) >= per_plugin:
                continue
            per[plugin] = per.get(plugin, 0) + 1
        chosen.append(thread_id)
    return set(chosen)


def pack(sizes, limit):
    """sizes: (key, size) pairs. Returns {key: batch number from 1}.

    First fit, in the order given, so callers can keep related threads
    together; a thread larger than `limit` gets a batch of its own.
    """
    batches, totals = {}, []
    for key, size in sizes:
        for i, total in enumerate(totals):
            if total + size <= limit:
                totals[i] += size
                batches[key] = i + 1
                break
        else:
            totals.append(size)
            batches[key] = len(totals)
    return batches


def estimate(batches):
    """Tokens a run costs: one reviewer per batch plus the tool reviewer."""
    return (batches + 1) * TOKENS_PER_REVIEWER


HEADER = re.compile(r"^── (.*?)\s*─*$")


def _sections(text):
    sections, current = [], None
    for line in text.splitlines(keepends=True):
        match = HEADER.match(line.rstrip("\n"))
        if match:
            current = {"name": match.group(1), "lines": [line]}
            sections.append(current)
        elif current is None:
            current = {"name": "", "lines": [line]}
            sections.append(current)
        else:
            current["lines"].append(line)
    return sections


def _clip(lines, limit):
    text = "".join(lines)
    if len(text) <= limit:
        return text
    head, tail = limit // 3, limit - limit // 3
    cut = len(text) - head - tail
    return f"{text[:head]}\n[… {cut} characters cut …]\n{text[-tail:]}"


def _flat(text):
    return " ".join(text.split())


def trim(text, flagged=()):
    """Cut a minimal transcript to what a reviewer needs.

    Keeps each user message, the assistant reply just before it (what the
    user was answering), the final assistant reply, interruptions, and any
    tool section naming a command in `flagged` (the failed, repeated, large,
    and slow commands `tool_stats.digest` lists). Long messages are clipped
    to SECTION_CHARS. Each run of dropped sections becomes one
    `[… n sections omitted …]` line.
    """
    flagged = [_flat(f).rstrip("…") for f in flagged if f]
    sections = _sections(text)
    keep = set()
    last_assistant = None
    for i, section in enumerate(sections):
        name = section["name"]
        if name == "Assistant":
            last_assistant = i
        elif name == "User":
            keep.add(i)
            if last_assistant is not None:
                keep.add(last_assistant)
            last_assistant = None
        elif "interrupted" in name or name.startswith("Stopped"):
            keep.add(i)
        elif flagged:
            # Only command lines, so a short flag like a tool name cannot
            # match prose.
            lines = [name] + [l.strip()[2:] for l in section["lines"] if l.strip().startswith("$ ")]
            if any(f in _flat(l) for l in lines for f in flagged):
                keep.add(i)
    if last_assistant is not None:
        keep.add(last_assistant)

    out, dropped = [], 0
    for i, section in enumerate(sections):
        if i in keep:
            if dropped:
                out.append(f"[… {dropped} sections omitted …]\n\n")
                dropped = 0
            limit = SECTION_CHARS.get(section["name"])
            out.append(_clip(section["lines"], limit) if limit else "".join(section["lines"]))
        else:
            dropped += 1
    if dropped:
        out.append(f"[… {dropped} sections omitted …]\n")
    return "".join(out)


def flagged_commands(stats):
    """The command lines `tool_stats.digest` calls out for one thread."""
    commands = [text for _, text in stats["failed"]]
    commands += [text for _, text in stats["repeated"]]
    commands += [text for size, text in stats["largest"] if size >= 10_000]
    commands += [text for _, text in stats["slowest"]]
    return commands
