#!/usr/bin/env python3
"""Collect a repo's recent delivery history from GitHub for sdlc-self-improve.

Usage: python3 collect-repo.py [--repo owner/name] [--days 7] [--batch-size 8] [--top 40] [--out DIR]

Writes, in the output directory (printed on the last line):
  data.json     every pull request, CI run, revert, and bug issue collected,
                which measure_findings.py reads to price findings
  index.tsv     one row per pull request with its numbers and batch
  pr-<n>.md     one digest per pull request picked for review: timings, review
                comments with their ids, and failed CI runs
  batch-<n>.md  the pull requests in each reviewer batch
  flow.md       repo-wide numbers: waits, CI failures by workflow, reverts, bugs
"""

import argparse
import datetime as dt
import json
import os
import statistics
import subprocess
import sys

# Bots whose comments are reports, not review. Bot reviewers such as Copilot
# or Claude are kept: what they flag is review feedback like anyone's.
NOISE_BOTS = {
    "codecov", "dependabot", "github-actions", "vercel", "netlify", "changeset-bot",
    "renovate", "sonarcloud", "socket-security", "linear", "coderabbitai-summary",
}

PR_QUERY = """
query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 20, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url state isDraft createdAt mergedAt closedAt
        additions deletions changedFiles headRefName
        author { login __typename }
        timelineItems(first: 50, itemTypes: [READY_FOR_REVIEW_EVENT, HEAD_REF_FORCE_PUSHED_EVENT]) {
          nodes {
            __typename
            ... on ReadyForReviewEvent { createdAt }
            ... on HeadRefForcePushedEvent { createdAt }
          }
        }
        commits(last: 100) { nodes { commit { committedDate } } }
        reviewRequests(first: 20) {
          nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } ... on Bot { login } } }
        }
        reviews(first: 60) {
          nodes { databaseId state submittedAt body url author { login __typename } }
        }
        reviewThreads(first: 100) {
          nodes {
            isResolved isOutdated
            comments(first: 20) {
              nodes { databaseId body path line createdAt url author { login __typename } }
            }
          }
        }
        comments(first: 60) {
          nodes { databaseId body createdAt url author { login __typename } }
        }
      }
    }
  }
}
"""


def gh(*args, check=True):
    result = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and result.returncode != 0:
        sys.exit(f"gh {' '.join(args[:3])} failed: {result.stderr.strip()}")
    return result.stdout


def gh_json(*args, check=True):
    out = gh(*args, check=check)
    return json.loads(out) if out.strip() else None


def parse_time(value):
    return dt.datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def hours(start, end):
    return round((end - start).total_seconds() / 3600, 1) if start and end else None


def minutes(start, end):
    return round((end - start).total_seconds() / 60) if start and end else 0


def login(node):
    author = node.get("author") or {}
    return author.get("login") or "ghost", author.get("__typename") == "Bot"


def is_noise(name):
    base = name.removesuffix("[bot]").lower()
    return any(base == bot or base.startswith(bot) for bot in NOISE_BOTS)


def fetch_prs(repo, since):
    query = f"repo:{repo} is:pr updated:>={since.date().isoformat()}"
    prs, cursor = [], None
    while True:
        args = ["api", "graphql", "-f", f"query={PR_QUERY}", "-f", f"q={query}"]
        if cursor:
            args += ["-f", f"cursor={cursor}"]
        page = gh_json(*args)["data"]["search"]
        prs += [n for n in page["nodes"] if n]
        if not page["pageInfo"]["hasNextPage"] or len(prs) >= 300:
            return prs
        cursor = page["pageInfo"]["endCursor"]


def normalize_pr(raw, since, now):
    author, author_is_bot = login(raw)
    created = parse_time(raw["createdAt"])
    ready_events = [parse_time(n["createdAt"]) for n in raw["timelineItems"]["nodes"]
                    if n["__typename"] == "ReadyForReviewEvent"]
    ready = max(ready_events) if ready_events else (None if raw["isDraft"] else created)
    merged = parse_time(raw["mergedAt"])
    commit_times = sorted(parse_time(n["commit"]["committedDate"]) for n in raw["commits"]["nodes"])
    force_pushes = sum(1 for n in raw["timelineItems"]["nodes"]
                       if n["__typename"] == "HeadRefForcePushedEvent")

    reviews = []
    for r in raw["reviews"]["nodes"]:
        name, bot = login(r)
        if name == author or is_noise(name) or not r["submittedAt"]:
            continue
        submitted = parse_time(r["submittedAt"])
        reviews.append({
            "id": r["databaseId"], "author": name, "bot": bot, "state": r["state"],
            "at": r["submittedAt"], "url": r["url"], "body": (r["body"] or "").strip(),
            # A round is a review the author answered with more commits.
            "followedByCommit": any(t > submitted for t in commit_times),
            "inWindow": submitted >= since,
        })

    comments = []
    for thread in raw["reviewThreads"]["nodes"]:
        for i, c in enumerate(thread["comments"]["nodes"]):
            name, bot = login(c)
            if is_noise(name):
                continue
            comments.append({
                "id": c["databaseId"], "kind": "review" if i == 0 else "reply",
                "author": name, "bot": bot, "byAuthor": name == author,
                "path": c["path"], "line": c["line"], "at": c["createdAt"], "url": c["url"],
                "body": c["body"].strip(), "resolved": thread["isResolved"],
                "inWindow": parse_time(c["createdAt"]) >= since,
            })
    for c in raw["comments"]["nodes"]:
        name, bot = login(c)
        if is_noise(name):
            continue
        comments.append({
            "id": c["databaseId"], "kind": "conversation", "author": name, "bot": bot,
            "byAuthor": name == author, "path": None, "line": None, "at": c["createdAt"],
            "url": c["url"], "body": c["body"].strip(), "resolved": None,
            "inWindow": parse_time(c["createdAt"]) >= since,
        })

    human_reviews = [parse_time(r["at"]) for r in reviews if not r["bot"]]
    any_reviews = [parse_time(r["at"]) for r in reviews]
    first_human = min(human_reviews) if human_reviews else None
    end_of_wait = first_human or merged or (parse_time(raw["closedAt"]) if raw["closedAt"] else now)
    return {
        "number": raw["number"], "title": raw["title"], "url": raw["url"],
        "author": author, "authorIsBot": author_is_bot, "state": raw["state"],
        "isDraft": raw["isDraft"], "branch": raw["headRefName"],
        "size": {"additions": raw["additions"], "deletions": raw["deletions"], "files": raw["changedFiles"]},
        "createdAt": raw["createdAt"], "readyAt": ready.isoformat() if ready else None,
        "mergedAt": raw["mergedAt"], "closedAt": raw["closedAt"],
        "hoursToFirstReview": hours(ready, min(any_reviews)) if any_reviews and ready else None,
        "hoursToFirstHumanReview": hours(ready, first_human) if ready and first_human else None,
        # Hours the PR sat ready with no human review, within the window.
        "hoursWaiting": hours(max(ready, since), end_of_wait) if ready and end_of_wait > max(ready, since) else 0,
        "hoursReadyToMerge": hours(ready, merged) if ready and merged else None,
        "rounds": sum(1 for r in reviews if r["inWindow"] and r["followedByCommit"]
                      and r["state"] in ("CHANGES_REQUESTED", "COMMENTED")),
        "forcePushes": force_pushes,
        # Pending requests now: people or teams the PR is waiting on.
        "awaitingReviewFrom": [r["requestedReviewer"].get("login") or "team:" + r["requestedReviewer"].get("slug", "?")
                               for r in raw["reviewRequests"]["nodes"] if r["requestedReviewer"]],
        "commitTimes": [t.isoformat() for t in commit_times],
        "reviews": reviews, "comments": comments, "ciFailures": [],
    }


def fetch_runs(repo, since):
    """Failed runs in the window, and how many runs there were in all."""
    created = f"created=>={since.date().isoformat()}"
    first = gh_json("api", f"repos/{repo}/actions/runs?{created}&per_page=1", check=False) or {}
    runs, page = [], 1
    while page <= 5:
        data = gh_json("api", f"repos/{repo}/actions/runs?{created}&status=failure&per_page=100&page={page}",
                       check=False)
        if not data or not data.get("workflow_runs"):
            break
        runs += data["workflow_runs"]
        if len(data["workflow_runs"]) < 100:
            break
        page += 1
    return first.get("total_count", 0), runs


def failed_jobs(repo, run_id):
    data = gh_json("api", f"repos/{repo}/actions/runs/{run_id}/jobs?filter=all&per_page=100", check=False) or {}
    out = []
    for job in data.get("jobs", []):
        if job.get("conclusion") != "failure":
            continue
        steps = [s["name"] for s in job.get("steps") or [] if s.get("conclusion") == "failure"]
        out.append({"job": job["name"], "steps": steps,
                    "minutes": minutes(parse_time(job.get("started_at")), parse_time(job.get("completed_at")))})
    return out


def normalize_runs(repo, total, raw_runs, prs):
    by_branch = {pr["branch"]: pr["number"] for pr in prs}
    failures = []
    # A failure re-run on the same commit is a flake, or a wait on something else.
    reruns = sum(1 for run in raw_runs if run.get("run_attempt", 1) > 1)
    for run in raw_runs:
        numbers = [p["number"] for p in run.get("pull_requests") or []]
        pr = numbers[0] if numbers else by_branch.get(run.get("head_branch"))
        failures.append({
            "id": run["id"], "workflow": run["name"], "event": run["event"], "branch": run.get("head_branch"),
            "pr": pr, "sha": run.get("head_sha"), "attempt": run.get("run_attempt", 1), "url": run["html_url"], "at": run["run_started_at"],
            "minutes": minutes(parse_time(run["run_started_at"]), parse_time(run["updated_at"])),
        })
    for failure in failures[:80]:
        failure["jobs"] = failed_jobs(repo, failure["id"])
    return {"total": total, "reruns": reruns, "failures": failures, "jobsFetched": min(len(failures), 80)}


def fetch_reverts(repo, default_branch, since):
    commits = gh_json("api", f"repos/{repo}/commits?sha={default_branch}&since={since.isoformat()}&per_page=100",
                      check=False) or []
    out = []
    for c in commits:
        subject = c["commit"]["message"].splitlines()[0]
        lowered = subject.lower()
        if lowered.startswith("revert") or "hotfix" in lowered or "fix forward" in lowered:
            out.append({"sha": c["sha"], "subject": subject, "url": c["html_url"], "at": c["commit"]["committer"]["date"]})
    return out


def fetch_bugs(repo, since):
    out = gh_json("issue", "list", "--repo", repo, "--state", "all", "--limit", "100",
                  "--search", f"created:>={since.date().isoformat()} label:bug",
                  "--json", "number,title,url,createdAt,state,author", check=False)
    return out or []


def review_comment_count(pr):
    """Comments from someone other than the author, made within the window."""
    return sum(1 for c in pr["comments"] if not c["byAuthor"] and c["inWindow"])


def pick_and_batch(prs, batch_size, top):
    """PRs with this window's review feedback or failed CI go to reviewers, busiest first."""
    picked = [pr for pr in prs if not pr["authorIsBot"] and (review_comment_count(pr) or pr["ciFailures"])]
    picked.sort(key=lambda pr: (review_comment_count(pr) + 2 * len(pr["ciFailures"]), pr["rounds"]), reverse=True)
    picked = picked[:top]
    for i, pr in enumerate(picked):
        pr["batch"] = i // batch_size + 1
    return picked


def clip(text, limit=1200):
    text = " ".join(text.split()) if "\n" not in text else text
    return text if len(text) <= limit else text[:limit] + " […]"


def pr_digest(pr):
    lines = [f"# PR #{pr['number']}: {pr['title']}", "",
             f"{pr['url']}", f"Author: {pr['author']} · State: {pr['state']} · "
             f"+{pr['size']['additions']}/-{pr['size']['deletions']} in {pr['size']['files']} files",
             f"Ready: {pr['readyAt']} · First review after: {pr['hoursToFirstReview']}h · "
             f"First human review after: {pr['hoursToFirstHumanReview']}h · Ready to merge: {pr['hoursReadyToMerge']}h",
             f"Rounds answered with commits: {pr['rounds']} · Force pushes: {pr['forcePushes']} · "
             f"Waiting on: {', '.join(pr['awaitingReviewFrom']) or 'nobody'}", ""]
    earlier = sum(1 for c in pr["comments"] if not c["inWindow"]) + sum(1 for r in pr["reviews"] if not r["inWindow"])
    if earlier:
        lines += [f"{earlier} reviews and comments from before the window are left out.", ""]
    lines.append("## Reviews")
    for r in (r for r in pr["reviews"] if r["inWindow"]):
        tag = " (bot)" if r["bot"] else ""
        lines.append(f"- review {r['id']} · {r['author']}{tag} · {r['state']} · {r['at']}"
                     + (f"\n  > {clip(r['body'], 600)}" if r["body"] else ""))
    lines += ["", "## Comments", "Each starts with its id, which findings cite.", ""]
    for c in (c for c in pr["comments"] if c["inWindow"]):
        who = c["author"] + (" (bot)" if c["bot"] else "") + (" (PR author)" if c["byAuthor"] else "")
        where = f" · {c['path']}:{c['line']}" if c["path"] else ""
        state = " · resolved" if c["resolved"] else ""
        body = clip(c["body"]).replace("\n", "\n  > ")
        lines.append(f"- [{c['id']}] {c['kind']} · {who}{where}{state}\n  > {body}")
    if pr["ciFailures"]:
        lines += ["", "## Failed CI runs"]
        for f in pr["ciFailures"]:
            jobs = "; ".join(f"{j['job']} ({', '.join(j['steps']) or 'no step named'})" for j in f.get("jobs", []))
            lines.append(f"- run {f['id']} · {f['workflow']} · attempt {f['attempt']} · {f['minutes']} min · {jobs}")
    return "\n".join(lines) + "\n"


def median(values):
    values = [v for v in values if v is not None]
    return round(statistics.median(values), 1) if values else None


def flow_report(repo, days, prs, ci, reverts, bugs):
    humans = [pr for pr in prs if not pr["authorIsBot"]]
    merged = [pr for pr in humans if pr["mergedAt"]]
    waiting = sorted((pr for pr in humans if pr["state"] == "OPEN" and not pr["isDraft"]
                      and pr["hoursToFirstHumanReview"] is None), key=lambda pr: pr["hoursWaiting"], reverse=True)
    by_workflow = {}
    for f in ci["failures"]:
        entry = by_workflow.setdefault(f["workflow"], {"failures": 0, "minutes": 0, "prs": set(), "jobs": {}})
        entry["failures"] += 1
        entry["minutes"] += f["minutes"]
        if f["pr"]:
            entry["prs"].add(f["pr"])
        for j in f.get("jobs", []):
            key = j["job"] + (f" › {', '.join(j['steps'])}" if j["steps"] else "")
            entry["jobs"][key] = entry["jobs"].get(key, 0) + 1
    lines = [f"# Flow for {repo}, last {days} days", "",
             f"- Pull requests updated: {len(prs)} ({len(prs) - len(humans)} by bots)",
             f"- Merged (human-authored): {len(merged)}",
             f"- Median hours from ready to first review (any): {median(pr['hoursToFirstReview'] for pr in humans)}",
             f"- Median hours from ready to first human review: {median(pr['hoursToFirstHumanReview'] for pr in humans)}",
             f"- Median hours from ready to merge: {median(pr['hoursReadyToMerge'] for pr in merged)}",
             f"- Median review rounds answered with commits: {median(pr['rounds'] for pr in merged)}",
             f"- CI runs: {ci['total']}, failed: {len(ci['failures'])}, failed runs that were re-runs: {ci['reruns']}",
             f"- Reverts or hotfixes on the default branch: {len(reverts)}",
             f"- Bug issues opened: {len(bugs)}", "",
             "## Waiting longest for a human review", ""]
    lines += [f"- #{pr['number']} {pr['title']} · {pr['author']} · {pr['hoursWaiting']}h in the window · "
              f"+{pr['size']['additions']}/-{pr['size']['deletions']} · "
              f"waiting on {', '.join(pr['awaitingReviewFrom']) or 'nobody requested'}" for pr in waiting[:10]] or ["- none"]
    load = {}
    for pr in waiting:
        for who in pr["awaitingReviewFrom"]:
            load[who] = load.get(who, 0) + 1
    lines += ["", "## Open review requests per reviewer", ""]
    lines += [f"- {who}: {n}" for who, n in sorted(load.items(), key=lambda kv: kv[1], reverse=True)[:10]] or ["- none"]
    lines += ["", "## Slowest to merge", ""]
    lines += [f"- #{pr['number']} {pr['title']} · {pr['hoursReadyToMerge']}h · {pr['rounds']} rounds"
              for pr in sorted(merged, key=lambda pr: pr["hoursReadyToMerge"] or 0, reverse=True)[:10]] or ["- none"]
    lines += ["", "## CI failures by workflow", ""]
    for name, e in sorted(by_workflow.items(), key=lambda kv: kv[1]["failures"], reverse=True):
        lines.append(f"- {name}: {e['failures']} failures, {e['minutes']} min, {len(e['prs'])} PRs")
        lines += [f"  - {job}: {n}" for job, n in sorted(e["jobs"].items(), key=lambda kv: kv[1], reverse=True)[:5]]
    if not by_workflow:
        lines.append("- none" if ci["total"] else "- not checked: no GitHub Actions runs in the window")
    lines += ["", "## Reverts and hotfixes", ""]
    lines += [f"- {r['subject']} ({r['url']})" for r in reverts] or ["- none"]
    lines += ["", "## Bug issues opened", ""]
    lines += [f"- #{b['number']} {b['title']} ({b['state']})" for b in bugs] or ["- none, or the repo has no `bug` label"]
    return "\n".join(lines) + "\n"


def checkout(repo):
    """This directory, when it is a checkout of the repo, for reviewers to read files in."""
    remote = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True).stdout
    if repo.lower() in remote.lower().removesuffix(".git\n").removesuffix("\n"):
        return subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip()
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--top", type=int, default=40, help="most pull requests to send to reviewers")
    parser.add_argument("--out")
    args = parser.parse_args()

    info = gh_json("repo", "view", *([args.repo] if args.repo else []), "--json", "nameWithOwner,defaultBranchRef")
    repo = info["nameWithOwner"]
    default_branch = info["defaultBranchRef"]["name"]
    now = dt.datetime.now(dt.timezone.utc)
    since = now - dt.timedelta(days=args.days)
    out = args.out or f"/tmp/sdlc-self-improve-{repo.replace('/', '-')}-{now.date().isoformat()}"
    os.makedirs(out, exist_ok=True)

    print(f"Collecting pull requests in {repo} updated since {since.date()}…", file=sys.stderr)
    prs = [normalize_pr(raw, since, now) for raw in fetch_prs(repo, since)]
    print(f"Collecting CI runs…", file=sys.stderr)
    ci = normalize_runs(repo, *fetch_runs(repo, since), prs)
    by_number = {pr["number"]: pr for pr in prs}
    for f in ci["failures"]:
        if f["pr"] in by_number:
            by_number[f["pr"]]["ciFailures"].append(f)
    reverts = fetch_reverts(repo, default_branch, since)
    bugs = fetch_bugs(repo, since)

    picked = pick_and_batch(prs, args.batch_size, args.top)
    with open(os.path.join(out, "data.json"), "w") as fh:
        json.dump({"repo": repo, "days": args.days, "checkout": checkout(repo), "since": since.isoformat(), "defaultBranch": default_branch,
                   "prs": prs, "ci": ci, "reverts": reverts, "bugs": bugs}, fh, indent=1)
    with open(os.path.join(out, "index.tsv"), "w") as fh:
        fh.write("pr\tauthor\tstate\tcomments\trounds\tci_failures\thours_waiting\tbatch\ttitle\n")
        for pr in prs:
            fh.write(f"{pr['number']}\t{pr['author']}\t{pr['state']}\t{review_comment_count(pr)}\t{pr['rounds']}\t"
                     f"{len(pr['ciFailures'])}\t{pr['hoursWaiting']}\t{pr.get('batch', '')}\t{pr['title']}\n")
    batches = {}
    for pr in picked:
        with open(os.path.join(out, f"pr-{pr['number']}.md"), "w") as fh:
            fh.write(pr_digest(pr))
        batches.setdefault(pr["batch"], []).append(pr)
    for n, members in batches.items():
        with open(os.path.join(out, f"batch-{n}.md"), "w") as fh:
            for pr in members:
                fh.write(f"- PR #{pr['number']} ({pr['author']}): {pr['title']} · {review_comment_count(pr)} comments · "
                         f"{pr['rounds']} rounds · {len(pr['ciFailures'])} CI failures · `pr-{pr['number']}.md`\n")
    with open(os.path.join(out, "flow.md"), "w") as fh:
        fh.write(flow_report(repo, args.days, prs, ci, reverts, bugs))

    comments = sum(review_comment_count(pr) for pr in picked)
    print(f"{len(prs)} pull requests, {len(picked)} with review feedback or failed CI in {len(batches)} batches, "
          f"{comments} comments, {len(ci['failures'])} failed CI runs.", file=sys.stderr)
    if not ci["total"]:
        print("warning: no GitHub Actions runs found; CI was not checked.", file=sys.stderr)
    if len(ci["failures"]) > ci["jobsFetched"]:
        print(f"warning: job details fetched for only {ci['jobsFetched']} of {len(ci['failures'])} failed runs.",
              file=sys.stderr)
    if not checkout(repo):
        print("warning: not run from a checkout of the repo; reviewers cannot check the current files.", file=sys.stderr)
    print(out)


if __name__ == "__main__":
    main()
