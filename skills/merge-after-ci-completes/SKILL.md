---
name: merge-after-ci-completes
description: Use when the user asks to merge a pull request once CI finishes, when checks go green, or after tests pass, including when some checks that matter are not GitHub required checks.
---

# Merge After CI Completes

## Overview

Wait until every check on the PR's head commit has finished and passed, then merge it the way a person clicking GitHub's merge button would.

"Every check" includes the ones branch protection does not require. That is why `gh pr merge --auto` is the wrong tool: it merges as soon as the *required* checks pass, while the full test suite or e2e run may still be going.

## 1. Preflight

```bash
gh pr view <n> -R <owner>/<repo> --json number,url,state,isDraft,headRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision
```

Stop and report before waiting if any of these would block the merge at the end anyway:

| Field | Blocks when |
|-------|-------------|
| `state` | not `OPEN` |
| `isDraft` | `true` (do not mark it ready unless asked) |
| `mergeable` | `CONFLICTING` (offer the resolve-merge-conflicts skill) |
| `reviewDecision` | `REVIEW_REQUIRED` or `CHANGES_REQUESTED` |

`mergeStateStatus: BLOCKED` on its own usually just means checks are still running. Record `headRefOid`: that is the commit you are waiting on and the only one you will merge.

## 2. Pick the merge method

```bash
gh api graphql -F owner=<owner> -F name=<repo> -F n=<n> -f query='
  query($owner: String!, $name: String!, $n: Int!) {
    repository(owner: $owner, name: $name) {
      viewerDefaultMergeMethod
      mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed
      pullRequest(number: $n) { isMergeQueueEnabled }
    }
  }'
```

`viewerDefaultMergeMethod` is the method GitHub's merge button preselects: your last-used method on this repo, or the repo's default. It is always one of the allowed methods. Map it to a flag: `MERGE` is `--merge`, `SQUASH` is `--squash`, `REBASE` is `--rebase`.

If `isMergeQueueEnabled` is `true`, pass no method flag. The queue decides the method, and `gh pr merge` adds the PR to the queue.

Do not infer the method from `git log` shapes or pick your own favorite.

## 3. Wait for every check

Run [wait-for-checks.sh](wait-for-checks.sh) with the Bash tool's `run_in_background: true`. It polls quietly and exits once, so the harness wakes you when it finishes. Do not poll in a foreground loop.

```bash
bash ~/.claude/skills/merge-after-ci-completes/wait-for-checks.sh <n> <owner>/<repo> <headRefOid>
```

It watches everything `gh pr checks` reports for the head commit: Actions jobs, other apps' check runs, and commit statuses such as Vercel. It handles three things that `gh pr checks --watch` gets wrong:

- **Checks that have not registered yet.** Right after a push the list can be empty, and `--watch` exits at once. The script waits up to 3 minutes for checks to appear.
- **Checks that register late.** An e2e run triggered by `deployment_status` shows up only after the preview deploy finishes. The script requires the all-green state to hold for 60 seconds, with no new checks, before it reports a pass. If a repo's late checks take longer than that to appear, raise `SETTLE`.
- **A new push since preflight.** It stops with `HEAD_CHANGED` instead of approving a commit you never checked.

Override timings with `POLL`, `SETTLE`, `NO_CHECKS_GRACE`, or `TIMEOUT` (seconds, default 3600) in the environment. Raise `TIMEOUT` for a suite known to run longer than an hour.

Workflows triggered by `workflow_run` run against the default branch, so they never appear on the PR. If the repo has one that matters, such as a deploy gate, check it separately with `gh run list -R <owner>/<repo> --event workflow_run`.

## 4. Act on the result

The script prints a marker, then one tab-separated line per check (`bucket`, `name`, `workflow`, `link`), failures first.

| Marker | Do |
|--------|----|
| `CHECKS_PASSED` | Merge (step 5) |
| `CHECKS_FAILED` | Do not merge. Report each failing check with its link and the relevant log lines. The script stops at the first failure, so list any checks still `pending` as pending, not passed. Ask whether to rerun, investigate a fix, or leave it. |
| `HEAD_CHANGED` | Someone pushed. Tell the user, rerun preflight, and wait again on the new commit only if they still want the merge. |
| `TIMED_OUT` | Report which checks are still pending. Ask whether to keep waiting. |
| `NO_CHECKS` | The repo may have no CI for this branch. Ask before merging. |
| `PR_NOT_OPEN` | Someone else merged or closed it. Report and stop. |

For an Actions check, the link has the form `.../actions/runs/<run-id>/job/<job-id>`. Read the failure with:

```bash
gh run view -R <owner>/<repo> --job <job-id> --log-failed
```

If the user wants a rerun, `gh run rerun <run-id> -R <owner>/<repo> --failed` reruns only the failed jobs, on the same commit, so run the script again with the same SHA afterward. A check from another app, such as Vercel, has no Actions log; give its link.

## 5. Merge the commit you watched

```bash
gh pr merge <n> -R <owner>/<repo> --<method> --match-head-commit <headRefOid>
```

`--match-head-commit` makes GitHub refuse the merge if the head moved after your last check.

- Leave out `--delete-branch`. The repo's own "delete branch on merge" setting handles the remote, and the flag also checks out the base branch in your local checkout.
- Leave out `--admin` and `--auto`.
- If the merge fails, report GitHub's message as-is. Do not retry with other flags.

## 6. Confirm

```bash
gh pr view <n> -R <owner>/<repo> --json state,mergedAt,mergeCommit,url
```

With a merge queue, `state` stays `OPEN` until the queue lands it. Report that the PR is queued, not merged.

Report the method used, the merge commit SHA, and any checks that were skipped, not passed.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `gh pr merge --auto` | Merges on required checks only; wait for every check with the script |
| `gh pr checks --watch` straight after a push | Exits with nothing registered; the script waits for checks to appear |
| Merging the moment the last pending check clears | Late checks register afterward; the script holds a settle window |
| Choosing squash because it is tidy | Use `viewerDefaultMergeMethod` |
| Passing a method flag on a merge-queue repo | Let the queue decide |
| Merging without `--match-head-commit` | A push during the wait would merge unwatched code |
| Rerunning a failed check to get to green | Report it and ask; a failure is a result |
