#!/usr/bin/env python3
"""Turn a findings.json into a dynamic-ui view.

Usage: python3 findings_to_view.py <findings.json> > view.json

One card per finding, in rank order, with a button that opens a thread for
it in the finding's project. The "seen once" observations become a second
section of cards with no buttons.
"""

import json
import sys

TONES = {
    "breakage": "danger",
    "correction overhead": "warning",
    "tool and token cost": "warning",
    "excess steps": "info",
    "non-chat UX": "info",
}


# Cards show plain thread ids: the panel's Markdown does not resolve
# `@thread:` mentions, though the prompt a new thread gets does.
def quote_line(evidence):
    text = " ".join(evidence["quote"].split())
    return f"> {text}\n>\n> {evidence['speaker']}, `{evidence['threadId']}`"


def unique(threads):
    return list(dict.fromkeys(threads))


def task_prompt(finding):
    """The new thread's prompt: the task as the user edits it, then the sources."""
    sources = " ".join(f"@thread:{t}" for t in unique(finding["threads"]))
    return f"{{draft}}\n\nFound in: {sources}"


def card(position, finding):
    threads = unique(finding["threads"])
    count = len(threads)
    evidence = finding["evidence"]
    # The task is not repeated here: it is the item's draft, which the opened
    # item shows in a box the user can edit before Open thread sends it.
    details = [f"**Target:** `{finding['target']}`"]
    if len(evidence) > 1:
        details += ["", "**More evidence**", ""] + [quote_line(e) + "\n" for e in evidence[1:]]
    details += ["", "**Found in:** " + ", ".join(f"`{t}`" for t in threads)]
    return {
        "id": f"finding-{position}",
        "title": f"{position}. {finding['title']}",
        "badges": [
            {"label": finding["signal"], "tone": TONES.get(finding["signal"], "neutral")},
            {"label": finding["project"], "tone": "neutral"},
            {"label": f"{count} thread{'' if count == 1 else 's'}", "tone": "neutral"},
        ],
        "summary": f"{finding['cost']}\n\n{quote_line(evidence[0])}" if evidence else finding["cost"],
        "details": "\n".join(details),
        "draft": finding["task"].strip(),
        "draftLabel": "Task for the new thread",
        "actions": [
            {
                "type": "thread",
                "label": "Open thread",
                "project": finding["project"],
                "title": f"Improve: {finding['title']}",
                "prompt": task_prompt(finding),
                "primary": True,
            }
        ],
    }


def to_view(findings, date=""):
    items = [card(i + 1, f) for i, f in enumerate(findings["findings"])]
    sections = [{"title": "Findings", "items": items}]
    observations = findings.get("observations") or []
    if observations:
        sections.append(
            {
                "title": "Seen once",
                "items": [
                    {
                        "id": f"seen-{i + 1}",
                        "title": o["text"],
                        "summary": ", ".join(f"`{t}`" for t in o["threads"]),
                    }
                    for i, o in enumerate(observations)
                ],
            }
        )
    title = "Self-improve review" + (f", {date}" if date else "")
    summary = f"{len(items)} findings from {findings['threadCount']} threads, most important first."
    return {"title": title, "summary": summary, "sections": sections}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    import datetime

    with open(sys.argv[1]) as f:
        print(json.dumps(to_view(json.load(f), datetime.date.today().isoformat()), indent=1))
