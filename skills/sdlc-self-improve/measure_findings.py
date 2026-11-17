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


# What each measured event costs people, in minutes. These are rough working
# figures, kept in one place so a team can set its own. The estimate is the time
# a finding cost last week, which a fix saves each week the pattern would recur.
MINUTES = {
    "comment": 20,        # a reviewer writes it, the author reads and answers it
    "rework": 60,         # another push, re-review, and switching back into the PR
    "ciFailure": 15,      # noticing the failure, reading the log, pushing a fix
    "waitWeek": 60,       # per PR per week waiting: rebasing, nudging, reloading context
    "defect": 240,        # a revert or bug: finding, fixing, and shipping it again
    "loadItem": 5,        # half the ~10 min a load reviewer spends per comment, the share a second owner could take
}

# Hours to make each size of fix, for the payback estimate.
EFFORT_HOURS = {"small": 4, "medium": 16, "large": 40}
DEFAULT_EFFORT = {
    "docs": "small", "agent instructions": "small", "PR template": "small",
    "lint rule": "medium", "CI change": "medium", "test": "medium", "process": "medium",
}


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def feedback_share(data, login):
    """How much of the window's review feedback one person wrote."""
    total = mine = 0
    prs = set()
    for pr in data["prs"]:
        items = [c for c in pr["comments"] if c.get("inWindow", True) and not c["byAuthor"]]
        items += [r for r in pr.get("reviews", []) if r.get("inWindow", True) and r.get("body")]
        total += len(items)
        n = sum(1 for i in items if i["author"] == login)
        mine += n
        if n:
            prs.add(pr["number"])
    return {"reviewer": login, "reviewerItems": mine, "reviewerPrs": sorted(prs),
            "reviewerShare": round(100 * mine / total) if total else 0}


def index(data):
    comments, prs = {}, {}
    for pr in data["prs"]:
        prs[pr["number"]] = pr
        for c in pr["comments"]:
            comments[c["id"]] = (pr, c)
        # A review summary can be cited by its review id, like a comment.
        for r in pr.get("reviews", []):
            if r.get("body"):
                comments.setdefault(r["id"], (pr, {**r, "byAuthor": False}))
    runs = {f["id"]: f for f in data["ci"]["failures"]}
    return comments, runs, prs


def measure(finding, comments, runs, prs, days=7, data=None):
    refs = finding.get("refs") or {}
    warnings = []
    cited = []
    for cid in refs.get("comments") or []:
        if cid in comments:
            cited.append(comments[cid])
            if comments[cid][1]["byAuthor"]:
                warnings.append(f"comment {cid} is the PR author's own and is not counted")
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

    signal = finding.get("signal")
    load = {}
    if signal == "review load" and data and refs.get("reviewer"):
        load = feedback_share(data, refs["reviewer"])
        # The cost of load is every PR the reviewer gave feedback on.
        affected.update({n: prs[n] for n in load.pop("reviewerPrs") if n in prs})

    # Rework: a cited comment the author answered with a later commit.
    rework = set()
    for pr, c in cited:
        at = parse_time(c["at"])
        if any(parse_time(t) > at for t in pr.get("commitTimes", [])):
            rework.add(pr["number"])
    reviewers = {c["author"] for _, c in cited if not c["byAuthor"]}
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
        **load,
        "reverts": len(refs.get("reverts") or []),
        "bugs": len(refs.get("bugs") or []),
    }, warnings


def wait_impact(waiting, days):
    return {
        "waitingPrs": len(waiting),
        "wholeWindow": sum(1 for pr in waiting if (pr["hoursWaiting"] or 0) >= days * 24 - 1),
        "longestWaitHours": max((pr.get("hoursWaitingTotal", pr["hoursWaiting"]) or 0 for pr in waiting), default=0),
        # Within the window only, so a PR open for a month counts one week.
        "waitPrWeeks": round(sum(min(pr["hoursWaiting"] or 0, days * 24) for pr in waiting) / (7 * 24), 1),
    }


def hours_lost(impact, days=7):
    """Estimated hours of people's time this cost per week, and how it adds up."""
    weekly = 7 / days
    terms = [
        ("comment", impact.get("comments", 0), "review comment", "review comments"),
        ("rework", impact.get("reworkPrs", 0), "round of fixes after review", "rounds of fixes after review"),
        ("ciFailure", impact.get("ciFailures", 0), "failed CI run", "failed CI runs"),
        ("waitWeek", impact.get("waitPrWeeks", 0), "PR-week waiting", "PR-weeks waiting"),
        ("defect", impact.get("reverts", 0) + impact.get("bugs", 0), "revert or bug", "reverts and bugs"),
        ("loadItem", impact.get("reviewerItems", 0), "load-reviewer comment", "load-reviewer comments"),
    ]
    used = [(n, MINUTES[k], one if n == 1 else many) for k, n, one, many in terms if n]
    hours = sum(n * m for n, m, _ in used) / 60 * weekly
    basis = " + ".join(f"{n:g} {label} × {m} min" for n, m, label in used)
    return round(hours, 1), basis


def effort_of(finding):
    effort = (finding.get("effort") or "").lower()
    return effort if effort in EFFORT_HOURS else DEFAULT_EFFORT.get(finding.get("fix"), "medium")


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
    if impact.get("reviewerShare"):
        parts.append(f"one reviewer wrote {impact['reviewerShare']}% of the review feedback "
                     f"({impact['reviewerItems']} comments and summaries)")
    if impact["ciFailures"]:
        parts.append(f"{impact['ciFailures']} failed CI run{'s' * (impact['ciFailures'] != 1)} "
                     f"({impact['ciMinutes']} min)")
    if impact.get("waitingPrs"):
        whole = impact["wholeWindow"]
        period_word = "week" if days == 7 else f"{days} days"
        # The details go in parentheses so the oldest wait does not read as
        # belonging to the "across N PRs" scope that follows.
        details = [f"{whole} of them all {period_word}"] if whole else []
        details.append(f"the oldest for {duration(impact['longestWaitHours'])}")
        parts.append(f"{impact['waitingPrs']} PR{'s' * (impact['waitingPrs'] != 1)} "
                     f"waiting for a first review ({', '.join(details)})")
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
    """Highest impact first: estimated hours a week, then fewer weeks to pay back."""
    i = finding.get("impact") or {}
    return (i.get("hoursPerWeek", 0), -(i.get("paybackWeeks") or 0))


def main(path):
    with open(path) as f:
        findings = json.load(f)
    with open(os.path.join(os.path.dirname(os.path.abspath(path)), "data.json")) as f:
        data = json.load(f)
    comments, runs, prs = index(data)
    for finding in findings["findings"]:
        finding["impact"], warnings = measure(finding, comments, runs, prs, data["days"], data)
        finding["impactLine"] = describe(finding["impact"], data["days"])
        impact = finding["impact"]
        impact["hoursPerWeek"], impact["hoursBasis"] = hours_lost(impact, data["days"])
        finding["effort"] = effort_of(finding)
        impact["paybackWeeks"] = (round(EFFORT_HOURS[finding["effort"]] / impact["hoursPerWeek"], 1)
                                  if impact["hoursPerWeek"] else None)
        for w in warnings:
            print(f"warning: {finding['title']}: {w}", file=sys.stderr)
    findings["findings"].sort(key=rank_key, reverse=True)
    with open(path, "w") as f:
        json.dump(findings, f, indent=1)
    for i, finding in enumerate(findings["findings"], 1):
        i_ = finding["impact"]
        print(f"{i}. ~{i_['hoursPerWeek']:g}h/week, {finding['effort']} effort: {finding['title']}: {finding['impactLine']}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
