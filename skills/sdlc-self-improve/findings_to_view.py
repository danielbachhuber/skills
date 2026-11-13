#!/usr/bin/env python3
"""Turn a measured findings.json into an Impromptu UI view.

Usage: python3 findings_to_view.py <dir>/findings.json > <dir>/view.json

One card per finding, in rank order, with its impact, evidence, and the issue
body as an editable draft. Draft issue sends the edited body back to the thread
that published the view, which writes the draft file for the user to check
before anything is filed. Findings a `state` marks as drafted or filed keep
their card, with a status, so republishing shows progress instead of dropping
them.
"""

import json
import os
import sys

TONES = {
    "escaped defect": "danger",
    "CI friction": "warning",
    "rework": "warning",
    "repeated review feedback": "info",
    "review wait": "info",
}


def quote_line(e):
    """A quote with its source. Flow evidence has no author and may have no PR."""
    text = " ".join(e["quote"].split())
    label = f"#{e['pr']}" if e.get("pr") else "source"
    source = f"[{label}]({e['url']})" if e.get("url") else (label if e.get("pr") else "")
    attribution = ", ".join(part for part in (e.get("author"), source) if part)
    return f"> {text}" + (f"\n>\n> {attribution}" if attribution else "")


def card(position, finding, repo):
    evidence = finding.get("evidence") or []
    impact = finding.get("impact") or {}
    prs = impact.get("prs", 0)
    summary = [f"**Impact:** {finding.get('impactLine', 'not measured')}",
               f"**Issue:** {finding['issue']['title']}"]
    if finding.get("basis"):
        summary.append(f"**Why the fix works:** {finding['basis']}")
    if evidence:
        summary.append(quote_line(evidence[0]))
    details = [f"**Fix:** {finding['fix']} in `{finding['target']}`"]
    if finding.get("tracked"):
        details.append(f"**Already tracked:** {finding['tracked']}")
    if len(evidence) > 1:
        details += ["", "**More evidence**", ""] + [quote_line(e) + "\n" for e in evidence[1:]]

    item = {
        "id": f"finding-{position}",
        "title": finding["title"],
        "badges": [
            {"label": finding["signal"], "tone": TONES.get(finding["signal"], "neutral")},
            {"label": finding["fix"], "tone": "neutral"},
            {"label": f"{prs} PR{'' if prs == 1 else 's'}", "tone": "neutral"},
        ],
        "summary": "\n\n".join(summary),
        "details": "\n".join(details),
        "draft": finding["issue"]["body"].strip(),
        "draftLabel": "Issue body",
    }
    state = finding.get("state") or {}
    if not state.get("issueUrl"):
        item["note"] = {"label": "Revise",
                        "placeholder": "What to change: the fix, the target, the issue, or why it's wrong"}
    if state.get("issueUrl"):
        item["url"] = state["issueUrl"]
        item["status"] = {"label": "Filed", "tone": "success", "complete": True}
        return item
    if state.get("draftPath"):
        item["status"] = {"label": "Draft ready", "tone": "info"}
        item["details"] += f"\n\n**Draft:** [{os.path.basename(state['draftPath'])}]({state['draftPath']})"
        item["actions"] = [{
            "type": "message", "label": "File issue", "primary": True,
            "detail": f"Creates the issue on {repo} from the draft file",
            "text": f"File the issue for {item['id']} ({finding['title']}) on {repo} from {state['draftPath']}.",
        }, redraft_action(item, finding, repo, "Redraft"), revise_action(item, finding, repo)]
        return item
    item["actions"] = [redraft_action(item, finding, repo, "Draft issue", primary=True), revise_action(item, finding, repo)]
    return item


def revise_action(item, finding, repo):
    return {
        "type": "message", "label": "Revise", "repeat": True,
        "detail": "Sends your note back to revise this suggestion and its issue body, then republishes the card",
        "text": (f"Revise {item['id']} ({finding['title']}) on {repo}: {{note}}\n\n"
                 f"The issue body as I left it:\n\n{{draft}}"),
    }


def redraft_action(item, finding, repo, label, primary=False):
    return {
        "type": "message", "label": label, "primary": primary, "repeat": True,
        "detail": "Writes the issue to ~/projects/drafts/ for you to check before filing",
        "text": (f"Draft the GitHub issue for {item['id']} on {repo}.\n\n"
                 f"Title: {finding['issue']['title']}\n\n{{draft}}"),
    }


def headline(findings, data):
    prs = data["prs"]
    merged = sum(1 for pr in prs if pr["mergedAt"])
    return (f"{len(findings['findings'])} suggestions from {findings.get('reviewedCount', '?')} of {len(prs)} "
            f"pull requests in `{data['repo']}` over {data['days']} days ({merged} merged, "
            f"{len(data['ci']['failures'])} failed CI runs), ranked by how many PRs each touched. "
            f"Edit an issue body before you draft it.")


def to_view(findings, data, date=""):
    repo = data["repo"]
    items = [card(i + 1, f, repo) for i, f in enumerate(findings["findings"])]
    sections = [{"title": "Suggestions", "items": items}]
    observations = findings.get("observations") or []
    if observations:
        sections.append({"title": "Seen once", "items": [
            {"id": f"seen-{i + 1}", "title": o["text"],
             "summary": ", ".join(f"#{n}" for n in o.get("prs", []))}
            for i, o in enumerate(observations)]})
    flow = findings.get("constraint")
    summary = headline(findings, data) + (f"\n\n**Limiting step:** {flow}" if flow else "")
    title = f"SDLC self-improve: {repo}" + (f", {date}" if date else "")
    return {"title": title, "summary": summary, "sections": sections}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    import datetime

    path = sys.argv[1]
    with open(path) as f:
        findings = json.load(f)
    with open(os.path.join(os.path.dirname(os.path.abspath(path)), "data.json")) as f:
        data = json.load(f)
    print(json.dumps(to_view(findings, data, datetime.date.today().isoformat()), indent=1))
