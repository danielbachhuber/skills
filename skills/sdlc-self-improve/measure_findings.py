#!/usr/bin/env python3
"""Measure each finding's impact from the GitHub data collect-repo.py gathered.

Usage: python3 measure_findings.py <dir>/findings.json

Reads data.json beside findings.json, fills in each finding's `impact` from the
comment ids, CI run ids, and PR numbers in its `refs`, and prints one line per
finding. Warns about ids it could not find, which usually means a reviewer
mistyped one.
"""

import json
import os
import sys
from datetime import datetime


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def index(data):
    comments, prs = {}, {}
    for pr in data["prs"]:
        prs[pr["number"]] = pr
        for c in pr["comments"]:
            comments[c["id"]] = (pr, c)
    runs = {f["id"]: f for f in data["ci"]["failures"]}
    return comments, runs, prs


def measure(finding, comments, runs, prs, days=7):
    refs = finding.get("refs") or {}
    warnings = []
    cited = []
    for cid in refs.get("comments") or []:
        if cid in comments:
            cited.append(comments[cid])
        else:
            warnings.append(f"comment {cid} not found")
    failed = []
    for rid in refs.get("ciRuns") or []:
        if rid in runs:
            failed.append(runs[rid])
        else:
            warnings.append(f"CI run {rid} not found")
    named = []
    for number in refs.get("prs") or []:
        if number in prs:
            named.append(prs[number])
        else:
            warnings.append(f"PR #{number} not found")

    affected = {pr["number"]: pr for pr, _ in cited}
    affected.update({f["pr"]: prs[f["pr"]] for f in failed if f["pr"] in prs})
    affected.update({pr["number"]: pr for pr in named})

    # Rework: a cited comment the author answered with a later commit.
    rework = set()
    for pr, c in cited:
        at = parse_time(c["at"])
        if any(parse_time(t) > at for t in pr.get("commitTimes", [])):
            rework.add(pr["number"])
    reviewers = {c["author"] for _, c in cited if not c["byAuthor"]}
    signal = finding.get("signal")
    return {
        "comments": sum(1 for _, c in cited if not c["byAuthor"]),
        "reviewers": len(reviewers),
        "prs": len(affected),
        "authors": len({pr["author"] for pr in affected.values()}),
        "reworkPrs": len(rework),
        "ciFailures": len(failed),
        "ciMinutes": sum(f["minutes"] for f in failed),
        # Waiting counts only for review-wait findings, where it is the cost. Waits run
        # side by side, so the measure is how many PRs waited, not the sum of hours.
        **wait_impact(named if signal == "review wait" else [], days),
        "reverts": len(refs.get("reverts") or []),
        "bugs": len(refs.get("bugs") or []),
    }, warnings


def wait_impact(waiting, days):
    return {
        "waitingPrs": len(waiting),
        "wholeWindow": sum(1 for pr in waiting if (pr["hoursWaiting"] or 0) >= days * 24 - 1),
        "longestWaitHours": max((pr.get("hoursWaitingTotal", pr["hoursWaiting"]) or 0 for pr in waiting), default=0),
    }


def duration(h):
    return f"{round(h)}h" if h < 48 else f"{h / 24:.0f} days"


def describe(impact, days):
    """The card's impact line, such as '9 comments from 4 reviewers on 6 PRs'."""
    if not impact:
        return "not measured"
    parts = []
    if impact["comments"]:
        reviewers = impact["reviewers"]
        parts.append(f"{impact['comments']} review comment{'s' * (impact['comments'] != 1)} "
                     f"from {reviewers} reviewer{'s' * (reviewers != 1)}")
    if impact["ciFailures"]:
        parts.append(f"{impact['ciFailures']} failed CI run{'s' * (impact['ciFailures'] != 1)} "
                     f"({impact['ciMinutes']} min)")
    if impact.get("waitingPrs"):
        whole = impact["wholeWindow"]
        period_word = "week" if days == 7 else f"{days} days"
        text = f"{impact['waitingPrs']} PR{'s' * (impact['waitingPrs'] != 1)} waiting for a first review"
        if whole:
            text += f", {whole} of them all {period_word}"
        parts.append(text + f", the oldest for {duration(impact['longestWaitHours'])}")
    if impact["reverts"]:
        parts.append(f"{impact['reverts']} revert{'s' * (impact['reverts'] != 1)}")
    if impact["bugs"]:
        parts.append(f"{impact['bugs']} bug{'s' * (impact['bugs'] != 1)}")
    prs, authors = impact["prs"], impact["authors"]
    scope = f"across {prs} PR{'s' * (prs != 1)} by {authors} author{'s' * (authors != 1)}"
    period = "this week" if days == 7 else f"in {days} days"
    line = f"{', '.join(parts) or 'no measured cost'} {scope}, {period}"
    if impact["reworkPrs"]:
        line += f"; fixes were pushed after review on {impact['reworkPrs']} of them"
    return line


def rank_key(finding):
    """One score: recurrence across PRs, plus what people and CI paid for it.

    A PR touched or reworked counts 2, a review comment 1, a failed CI run 0.5
    plus a point per 10 minutes it ran, a PR that waited the whole window 2, and
    a revert or bug 5. Concentrated CI cost on one PR can then outrank a few
    comments spread over several.
    """
    i = finding.get("impact") or {}
    return (2 * i.get("prs", 0) + i.get("comments", 0) + 2 * i.get("reworkPrs", 0)
            + 0.5 * i.get("ciFailures", 0) + i.get("ciMinutes", 0) / 10
            + 2 * i.get("wholeWindow", 0) + 5 * (i.get("reverts", 0) + i.get("bugs", 0)))


def main(path):
    with open(path) as f:
        findings = json.load(f)
    with open(os.path.join(os.path.dirname(os.path.abspath(path)), "data.json")) as f:
        data = json.load(f)
    comments, runs, prs = index(data)
    for finding in findings["findings"]:
        finding["impact"], warnings = measure(finding, comments, runs, prs, data["days"])
        finding["impactLine"] = describe(finding["impact"], data["days"])
        for w in warnings:
            print(f"warning: {finding['title']}: {w}", file=sys.stderr)
    findings["findings"].sort(key=rank_key, reverse=True)
    with open(path, "w") as f:
        json.dump(findings, f, indent=1)
    for i, finding in enumerate(findings["findings"], 1):
        print(f"{i}. {finding['title']}: {finding['impactLine']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
