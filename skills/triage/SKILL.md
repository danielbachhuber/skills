---
name: triage
description: Use when triaging an open GitHub issue, a batch of them, or every issue in a milestone — checking whether an older issue is still relevant, what of it has already been done, and whether it can be closed.
argument-hint: [issue-number-or-url ... | milestone]
---

# Triage

## Overview

Compare an open issue against the current state of the code and the work done since it was filed. Break it into the separate things it asks for, decide the status of each one with evidence, and draft a comment that says what is done and what is left. Then recommend one outcome: close it, keep it open, or rewrite it.

**Nothing goes to GitHub until the user confirms.** The comment is drafted to a file first, and closing, relabeling, or editing the issue waits for a yes.

## 1. Read the whole issue

Take the body, every comment, and the timeline. The timeline shows the pull requests and commits that referenced the issue, which is usually the fastest route to "was this done?"

```bash
gh issue view <n> --json number,title,state,author,createdAt,updatedAt,labels,assignees,milestone,body,url \
  > /tmp/issue-<n>.json
gh issue view <n> --comments > /tmp/issue-<n>-comments.txt

gh api repos/<owner>/<repo>/issues/<n>/timeline --paginate \
  --jq '.[] | select(.event == "cross-referenced" or .event == "referenced" or .event == "connected")
        | {event, commit: .commit_id, source: .source.issue.html_url, title: .source.issue.title,
           state: .source.issue.state, merged: .source.issue.pull_request.merged_at}'
```

Read the comments as carefully as the body. The scope often changed in the discussion: a maintainer narrowed it, someone reported a workaround, or a later comment said part of it shipped.

## 2. List the asks

Write out each separate thing the issue asks for, in the issue's own words. A bug report is usually one ask. A feature request or a "clean up X" issue is often three or four. Quote the sentence each ask comes from, so the assessment can be checked against the source.

If the issue has a `Done is:` block, use its criteria as the asks.

## 3. Check each ask against the code

Check against the default branch on the remote, not the local checkout, which may be stale or on another branch:

```bash
git fetch origin
git grep -n '<symbol>' origin/HEAD -- <path>
git log --oneline origin/HEAD -S '<symbol>' --since=<issue createdAt> -- <path>
gh pr list --state merged --search '<keywords>' --json number,title,mergedAt,url --limit 20
```

For a bug, try to reproduce it or find the fix. For a feature, find where it lives now. For a cleanup, check whether the code it names still exists.

Give each ask one status:

| Status | Meaning | Evidence required |
| --- | --- | --- |
| **Done** | Shipped as asked | The PR or commit that did it, and a permalink to the code |
| **Partly done** | Some of it shipped | What shipped (as above) and what is missing |
| **Still needed** | Not done, still applies | A permalink showing the current state |
| **Obsolete** | The code, feature, or plan it refers to is gone or changed direction | The PR or commit that removed or replaced it |
| **Unclear** | Cannot tell from the code | The question someone has to answer |

A PR title or a linked-PR badge is not evidence on its own. Read the diff and confirm it covers the ask. Closed-but-unmerged PRs in the timeline do not count.

Pin every code reference with the permalink helper from `draft-issue-description`:

```bash
~/.claude/skills/draft-issue-description/permalink.sh <path> <line-or-range>
```

## 4. Check for duplicates

Search for other open issues that cover the same ground. A remaining ask may already be tracked somewhere else.

```bash
gh issue list --state open --search '<keywords>' --json number,title,url --limit 20
```

## 5. Pick an outcome

| Situation | Recommendation |
| --- | --- |
| Every ask is Done | Close as completed |
| Every ask is Done or Obsolete, at least one Obsolete | Close as not planned, and say what replaced it |
| The remaining asks are tracked in another issue | Close as a duplicate of that issue |
| Some asks remain, and the body still describes them accurately | Keep open, comment with the status |
| Some asks remain, but the body is mostly about finished or obsolete work | Keep open and rewrite the body around what is left, using `draft-issue-description` |
| Anything Unclear that blocks the decision | Keep open, and ask the question in the comment, addressed to whoever can answer it |

Suggest labels, assignees, or milestone changes only when the evidence supports them, such as a `bug` label on something that turned out to be a feature request. Do not add labels the repo does not already use (`gh label list`).

## 6. Draft the comment

Write it to `~/projects/drafts/reply-<n>-triage.md`. Keep it short, since it will be read by people who know the issue:

- One sentence with the overall conclusion.
- One bullet per ask: the status, then the evidence as a link (PR, commit, or permalink).
- If it stays open, one sentence on what is left. If a question blocks it, ask it directly.

No headings, no restating the issue, no summary paragraph at the end. Apply the `unslop` skill before showing it.

Example:

```markdown
Most of this has shipped. The export button is the only piece left.

- CSV download for the members table: done in #412 ([code](https://github.com/org/repo/blob/<sha>/app/members/export.ts#L10-L42))
- Filter the export by role: done in #430
- Export button on the mobile layout: still needed. The desktop toolbar has it, but the [mobile toolbar](https://github.com/org/repo/blob/<sha>/app/members/MobileToolbar.tsx#L18) does not.
```

## 7. Show it and wait

In one message, after every tool call is finished, give the user:

- the asks with their statuses and evidence
- the recommended outcome and why
- the full draft comment, inline
- the exact commands you would run

Then stop and wait for a yes.

## 8. Act on confirmation

Run only what the user approved:

```bash
gh issue comment <n> --body-file ~/projects/drafts/reply-<n>-triage.md

# only if closing was approved; the comment is already posted, so no --comment here
gh issue close <n> --reason completed
gh issue close <n> --reason "not planned"
gh issue close <n> --duplicate-of <other-n>
```

To rewrite the body, fetch the live body again first (the user may have edited it since step 1), then hand off to `draft-issue-description`.

Delete the draft file once the comment is posted.

## Several issues at once

Given a list, a label, a milestone, or "the oldest issues in this repo", triage one issue at a time: read, assess, draft, confirm, act, then move to the next. Start with a short table of the queue (number, title, age, last activity) so the user can reorder or skip. Do not batch drafts across issues unless the user asks.

```bash
gh issue list --state open --search 'sort:updated-asc' --json number,title,createdAt,updatedAt,labels --limit 30
```

### A milestone

When the argument is a milestone (a title such as `v2.1` or `Q3 cleanup`, a `/milestone/<n>` URL, or a number the user calls a milestone), triage every open issue in it. A bare number with no other context is an issue number. Resolve the milestone first, since a title can match more than one or none:

```bash
gh api repos/<owner>/<repo>/milestones --paginate \
  --jq '.[] | {number, title, state, due_on, open_issues, closed_issues}'
```

If the argument matches no open milestone exactly, show the list and ask which one. Then take every open issue in it. Pass a high `--limit`, because the default of 30 silently drops the rest:

```bash
gh issue list --milestone '<title>' --state open --limit 500 \
  --json number,title,createdAt,updatedAt,labels,assignees
```

`gh issue list` returns issues only, so pull requests in the milestone are left out on purpose. The milestone's `open_issues` counts pull requests too, so it can be higher than the queue. If the queue length equals the `--limit`, raise the limit and list again.

Within a milestone, one more outcome applies: an issue that is still needed but will not be done in this milestone. Recommend moving it to another milestone or clearing it (`gh issue edit <n> --milestone '<other>'` or `--remove-milestone`), and say why.

After the last issue, give a short summary: how many were closed, kept, moved, or skipped, and what is still open in the milestone. If nothing is left open, suggest closing the milestone, and wait for a yes:

```bash
gh api -X PATCH repos/<owner>/<repo>/milestones/<number> -f state=closed
```

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Marking an ask Done because a linked PR exists | Read the PR diff and confirm it covers the ask |
| Checking the local checkout | Check `origin/HEAD` after `git fetch` |
| Reading only the body | Comments often narrow or expand the scope |
| Bare file paths in the comment | Permalinks pinned to a SHA |
| Closing with a comment that restates the whole issue | One line per ask, with a link |
| Closing without the user's yes | Draft, show, wait |
| Editing the body from the step 1 copy | Fetch the live body again right before editing |
| Listing a milestone with the default `--limit` | Pass `--limit 500`, and raise it if the result fills the limit |
