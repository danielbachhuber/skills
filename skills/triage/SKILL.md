---
name: triage
description: Use when triaging an open GitHub issue or pull request, a batch of them, or every issue in a milestone — checking whether an older issue is still relevant and what of it has already been done, or whether an old pull request already landed, was superseded, or should be closed, nudged, taken over, or rebased and reviewed.
argument-hint: [issue-or-pr-number-or-url ... | milestone]
---

# Triage

## Overview

Compare an open issue against the current state of the code and the work done since it was filed. Break it into the separate things it asks for, decide the status of each one with evidence, and draft a comment that says what is done and what is left. Then recommend one outcome: close it, keep it open, or rewrite it.

An open pull request gets a different check, in "Pull requests" below: whether the change already landed or was superseded, whether it still applies to the default branch, and whether the author is still around. It ends in one of five outcomes: close it, close it as stale with an invitation to reopen, nudge the author, take it over, or rebase and review it.

**Nothing goes to GitHub until the user confirms.** The comment is drafted to a file first, and closing, relabeling, or editing the issue or pull request waits for a yes.

## Issue or pull request?

Issues and pull requests share one number sequence, so a bare number can be either. Check before anything else. A URL with `/pull/` is a pull request, but an `/issues/<n>` URL can be one too.

```bash
gh api repos/<owner>/<repo>/issues/<n> --jq 'if .pull_request then "pr" else "issue" end'
```

For an issue, follow steps 1 to 9. For a pull request, follow "Pull requests".

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

## 4. Check for duplicates and blockers

Search for other open issues that cover the same ground. A remaining ask may already be tracked somewhere else.

```bash
gh issue list --state open --search '<keywords>' --json number,title,url --limit 20
```

Then check whether the remaining asks are waiting on something else. Issues are often blocked without being marked as blocked, which makes them look ready to pick up when they are not. Signs in the body and comments:

- "depends on", "after #<n> lands", "once we have", "waiting on"
- a later comment putting it on hold: "not a priority for now", "requirements are still unclear", "needs a decision from"
- an ask that needs code, an API, or a design that does not exist yet, and that another open issue or pull request is building

The issue may say nothing, so also run a quick search. For each remaining ask, name what it needs that does not exist yet (an API, a component, a data model change, a product or legal decision), and search open issues and pull requests for that, not for the ask itself:

```bash
gh issue list --state open --search '<what the ask needs>' --json number,title,labels,milestone,url --limit 10
gh pr list --state open --search '<what the ask needs>' --json number,title,author,url --limit 10
gh issue list --state open --label '<repo blocked label>' --search '<keywords>' --json number,title,url --limit 10
```

The last search finds issues on the same ground that are already marked blocked, and whatever blocks them often blocks this one too. A hit only counts as a blocker if this issue cannot be finished until it is. Related work that could ship in either order is not a blocker.

Read each candidate blocker, since a blocker that has since closed or merged no longer blocks anything. Then compare with what is already marked:

```bash
gh api repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by --jq '.[] | {number, title, state}'
gh issue view <n> --json labels --jq '.labels[].name'
gh label list --limit 200 --json name --jq '.[].name' | grep -iE 'block|wait|hold'
```

Give each blocker one of these:

| Blocker | What to mark |
| --- | --- |
| An open issue that is not linked | Add it as "blocked by" |
| A decision, a person, or another team, with no issue of its own | The repo's blocked label if it has one, and a sentence in the comment naming the blocker and who decides. Offer to draft an issue for the decision with `draft-issue-description` when the decision itself needs tracking |
| Already marked, and still open | Nothing |
| Marked, but now closed or merged | Remove the link or label, and say in the comment that the issue is unblocked |

## 5. Pick an outcome

| Situation | Recommendation |
| --- | --- |
| Every ask is Done | Close as completed |
| Every ask is Done or Obsolete, at least one Obsolete | Close as not planned, and say what replaced it |
| The remaining asks are tracked in another issue | Close as a duplicate of that issue |
| Some asks remain, and the body still describes them accurately | Keep open, comment with the status |
| Some asks remain, but the body is mostly about finished or obsolete work | Keep open and rewrite the body around what is left, using `draft-issue-description` |
| Anything Unclear that blocks the decision | Keep open, and ask the question in the comment, addressed to whoever can answer it |
| Some asks remain, and they are waiting on a blocker that is not marked | Keep open, mark it blocked (step 4), and say in the comment what it is waiting on |
| It is marked blocked, but every blocker has closed | Keep open, remove the blocked marking, and say in the comment that it is ready to pick up |

Blocking combines with the other rows: an issue can need both a rewritten body and a "blocked by" link.

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

If `bb impromptu-ui help` succeeds, publish the issue as a one-item view above the composer, as described in "Showing it above the composer" below. Then, in one message after every tool call is finished, give the user:

- the recommended outcome and why
- one line per ask with its status and evidence
- a pointer to the item above the composer, where the draft and the buttons are

Do not repeat the draft or the commands in chat. The opened item shows the draft, and the buttons say what will run.

Without impromptu-ui, give the user, in one message after every tool call is finished:

- the asks with their statuses and evidence
- the recommended outcome and why
- the full draft comment, inline
- the exact commands you would run

Either way, stop and wait for a yes. Pressing a button above the composer counts as the yes.

## 8. Act on confirmation

Run only what the user approved:

```bash
gh issue comment <n> --body-file ~/projects/drafts/reply-<n>-triage.md

# only if closing was approved; the comment is already posted, so no --comment here
gh issue close <n> --reason completed
gh issue close <n> --reason "not planned"
gh issue close <n> --duplicate-of <other-n>

# only if marking it blocked was approved. issue_id is the blocking issue's numeric id, not its number
gh api -X POST repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by \
  -F issue_id="$(gh api repos/<owner>/<repo>/issues/<blocker-n> --jq .id)"
gh issue edit <n> --add-label '<repo blocked label>'

# only if unblocking was approved
gh api -X DELETE repos/<owner>/<repo>/issues/<n>/dependencies/blocked_by/<blocker issue id>
gh issue edit <n> --remove-label '<repo blocked label>'
```

To rewrite the body, fetch the live body again first (the user may have edited it since step 1), then hand off to `draft-issue-description`.

Delete the draft file once the comment is posted.

If the user decides to solve the issue instead of only triaging it ("should we just try to solve this?"), use the `work-on` skill from here, and keep the thread open.

## 9. Archive the thread

When the triage is finished, archive the bb thread so it leaves the sidebar. Triage is finished when every issue in it has been acted on or skipped, and nothing is waiting on the user, such as an unanswered question or a pending yes to close a milestone. With impromptu-ui, run `bb impromptu-ui state --key triage` and confirm no item is still `[open]`. When triaging several issues, wait until the last one is settled. Do not archive after each issue.

Send the final chat message first, then archive as the turn's last action:

```bash
[ -n "$BB_THREAD_ID" ] && bb thread archive --self
```

Skip this outside bb, and when the user has asked to keep the thread open.

## Pull requests

An old pull request asks a different question from an old issue. The issue asks "was this done?" The pull request asks "is this change still wanted, and who will finish it?" Check four things, then pick one outcome.

### P1. Read the whole pull request

```bash
gh pr view <n> --json number,title,state,isDraft,author,createdAt,updatedAt,baseRefName,headRefName,headRefOid,isCrossRepository,maintainerCanModify,mergeable,mergeStateStatus,reviewDecision,latestReviews,reviewRequests,statusCheckRollup,closingIssuesReferences,labels,assignees,milestone,files,commits,body,url \
  > /tmp/pr-<n>.json
gh pr view <n> --comments > /tmp/pr-<n>-comments.txt
gh api repos/<owner>/<repo>/pulls/<n>/comments --paginate \
  --jq '.[] | {user: .user.login, created_at, path, body}' > /tmp/pr-<n>-review-comments.json
gh pr diff <n> > /tmp/pr-<n>.diff
```

Read the description, the diff, every comment, and every review. Note what the change does in a sentence or two, which issue it closes if any, and where the last exchange left it: waiting on the author, waiting on a reviewer, or stalled with no ask from either side.

Fetch the head so later checks can compare it with the default branch. This works for pull requests from forks too:

```bash
git fetch origin
git fetch origin pull/<n>/head:triage-pr-<n>
```

### P2. Did it land or get superseded?

The change may already be on the default branch even though this pull request is open. Someone may have redone it, cherry-picked it, or merged another pull request that does the same thing.

Treat the change as two parts: the diff itself, and any changes reviewers asked for. A requested change can ship in another pull request while this one sits, and then it no longer blocks anything. List each change request from `latestReviews` and the review comments, and check it the same way as the diff.

```bash
# commits whose patch is already upstream are marked "-"
git cherry -v origin/HEAD triage-pr-<n>

# what changed in the same files since the PR was opened
git log --oneline origin/HEAD --since=<createdAt> -- <files from the PR>

# merged or open PRs on the same ground
gh pr list --state merged --search '<keywords>' --json number,title,mergedAt,url --limit 20
gh pr list --state open --search '<keywords>' --json number,title,author,url --limit 20
```

`git cherry` only catches commits that landed with the same patch. A squash merge or a rewrite will not show, so also search by what the change does, not only by its wording, and read the diffs of the likely matches.

Check the related issues too, which are often the fastest route to the pull request that replaced this one. `closingIssuesReferences` only holds issues the body closes with a keyword such as "Fixes". Also take every `#<n>` the body and comments mention, such as "Relates to #1578":

```bash
jq -r '.closingIssuesReferences[].number' /tmp/pr-<n>.json
jq -r .body /tmp/pr-<n>.json | cat - /tmp/pr-<n>-comments.txt | grep -oE '#[0-9]+' | sort -u
```

Then search for related issues the pull request never mentions. Search by what each part of the change does, and especially by the parts that have not landed, since those are the ones still waiting on someone:

```bash
gh issue list --state all --search '<keywords>' --json number,title,state,stateReason,updatedAt,milestone,assignees,url --limit 20
```

For each related issue, read the body, the comments, and the timeline (step 1), and note where it stands:

| Issue state | What it says about the pull request |
| --- | --- |
| Closed by another pull request | Strong evidence this one was superseded |
| Closed as not planned | The change is not wanted |
| Open, but the latest word is that it is not a priority, is waiting on a decision, or has unclear requirements | Nobody has decided to go ahead. The pull request is waiting on that decision, not on code |
| Open, assigned, and in a current milestone or recently discussed | The change is still wanted |
| No related issue | Nobody is tracking the work outside this pull request |

Quote the comment that shows the state, with its author and date, such as a product manager writing that the feature "is not high priority for now".

Give the pull request one of these:

| Finding | Evidence required |
| --- | --- |
| **Landed** | The commit or PR that put the same change on the default branch, and a permalink to it |
| **Partly landed** | What landed (as above) and which part of this diff is still missing |
| **Superseded** | The PR or commit that solved the same problem another way, or removed the code this changes |
| **Not landed** | A permalink showing the default branch still lacks the change |

### P3. Does it still apply?

```bash
# exit 0 = merges cleanly, 1 = conflicts. The output is a tree ID, then the
# conflicted files, a blank line, and CONFLICT messages. This prints only the files:
git merge-tree --write-tree --name-only origin/HEAD triage-pr-<n> | sed -n '2,/^$/p'

gh pr checks <n>
```

Check whether the files it touches still exist, and tell deleted files from moved ones. A file that was renamed or moved is still there, so the change could be carried over. Compare the PR's merge base with the default branch, over the whole tree, since a pathspec stops git from seeing where a file moved to:

```bash
base=$(git merge-base origin/HEAD triage-pr-<n>)
git diff -M -l0 --name-status --diff-filter=DR "$base" origin/HEAD | grep -F -f <(jq -r '.files[].path' /tmp/pr-<n>.json)
```

`R<similarity>` lines give the new path. A `D` line is not proof the file is gone. Across many commits, a file that was moved and then edited, or moved twice, no longer looks similar enough for git to pair the old and new paths. Within the single commit that moved it, git usually still can. So follow each `D` file one commit at a time:

```bash
path=<path from a D line>
while ! git cat-file -e origin/HEAD:"$path" 2>/dev/null; do
  sha=$(git log -1 --diff-filter=D --format=%h "$base"..origin/HEAD -- "$path")
  [ -z "$sha" ] && break
  next=$(git show -M --name-status --format= "$sha" | awk -F'\t' -v p="$path" '$1 ~ /^R/ && $2 == p {print $3}')
  echo "$sha: $path -> ${next:-deleted}"
  [ -z "$next" ] && break
  path=$next
done
```

The loop stops at a path that exists on the default branch (the file moved there) or at a commit that really deleted it. Only call a file gone in the second case, and read that commit's message to see what replaced it.

Also read `mergeable` and `mergeStateStatus` from P1, but trust `git merge-tree` over them, since GitHub recomputes mergeability lazily on old pull requests. Note how far behind it is (`git rev-list --count triage-pr-<n>..origin/HEAD`), how many files conflict and whether the conflicts rewrite the same code, and when CI last passed. A clean merge is not proof the change still works: if the code around it moved, say so.

### P4. Who has touched it, and when?

Two separate questions, and the outcome depends on both. A pull request can sit untouched for a year while its author merges something every week.

**Activity on the pull request.** The latest commit, comment, or review on it from anyone:

```bash
jq -r '[.commits[-1].committedDate, (.latestReviews[].submittedAt)] | max' /tmp/pr-<n>.json
gh api repos/<owner>/<repo>/issues/<n>/comments --paginate --jq 'last | .created_at'
gh api repos/<owner>/<repo>/pulls/<n>/comments --paginate --jq 'last | .created_at'
```

Take the latest of these as the date the pull request was last touched.

**Activity of the author in the repo.** Get their git name and email from the PR's own commits, since `git log --author` does not know GitHub logins:

```bash
jq -r '.commits[].authors[] | select(.login == "<author>") | "\(.name) <\(.email)>"' /tmp/pr-<n>.json | sort -u

gh pr list --state all --author <author> --json number,title,updatedAt,url --limit 5
git log -1 --format='%ad %s' --date=short origin/HEAD --author='<email>'

# whether they are still in the org (204 = member, 404 = not, or membership is private)
gh api orgs/<owner>/members/<author> --silent && echo member || echo "not a visible member"
```

Call the author **active** if they have commented, pushed, or opened a pull request in this repo in the last 60 days, and **inactive** otherwise. Say which signal you used. A bot author (Dependabot, Renovate) is out of scope for this skill; point to `review-dependabot-prs` instead.

### P5. Pick an outcome

Go down the table and take the first row that fits.

| Situation | Recommendation |
| --- | --- |
| Landed, or superseded | **Close.** Comment with where it landed or what replaced it |
| Not wanted any more: the feature changed direction, or a maintainer said no in the thread | **Close.** Comment with the reason, quoting the decision if there is one |
| What is left, or the whole change, belongs to a related issue that is waiting on a decision or was deprioritized | **Close.** Comment with what landed where, and point to the issue as the place the decision is tracked, quoting its latest status. The work can restart from there once someone decides to go ahead |
| Partly landed or superseded, and what is left is small enough to redo in a fresh pull request (a line of copy, one rule, one small function) | **Close.** Comment with what landed where, name the leftover piece, and point to the related issue that tracks it. If none does, offer to draft one with `draft-issue-description`, so closing does not lose the work |
| Not landed, nobody has touched the pull request in 6 months or more, and nothing in the thread or a related issue says it is still wanted | **Close as stale.** Say why it is being closed, what would need to happen for it to land, and invite the author or anyone else to reopen it if it still needs addressing. This applies whether or not the author is active elsewhere in the repo |
| Still wanted, the author is active, and the next move is theirs (review feedback to address, conflicts, failing CI) | **Nudge the author.** Comment with exactly what is left, and ask whether they still plan to finish it |
| Still wanted, but the author is inactive or has said they cannot finish it | **Take it over.** Someone continues on a new branch from the author's commits, and this PR closes once the new one is open |
| Still wanted, and the next move is a reviewer's: it was never reviewed, or the author answered the last review | **Rebase and review.** Bring it up to date with the default branch, then review it |
| Partly landed, and what is left is substantial | Whichever of the last three rows fits the remaining part, and say in the comment what already landed |
| Cannot tell whether the change is still wanted, and the pull request has been touched in the last 6 months | **Keep open**, and ask the question in the comment, addressed to whoever can answer it |

"Still wanted" needs evidence: an open related issue that is assigned or in a current milestone, a maintainer asking for the change, or recent discussion on the pull request. An approval from months ago is not enough on its own, and neither is an open issue whose latest comment says it is not a priority.

Close as stale is the default for a very old pull request that is not clearly wanted. It costs nothing to reopen, while keeping it open costs a row in every list of open pull requests. An active author does not make an untouched pull request less stale: if they still wanted it, they would have come back to it, and they can reopen it in one click.

A draft pull request leans toward close as stale: a draft that has sat for months was usually an experiment. Say so when recommending it.

### P6. Draft, show, and act

Draft the comment to `~/projects/drafts/reply-<n>-triage.md` as in step 6: one sentence with the conclusion, then one bullet per finding (landed, related issues, still applies, last activity) with its evidence as a link. When quoting someone, name them without the `@` ("mlcnp wrote on 20 May"), since an `@login` notifies them when the comment posts. Use `@` only for someone the comment is meant to reach, such as the author in a nudge. For a nudge, list what is left as items the author can act on. For a take-over, thank the author and say their commits will be kept. For close as stale, keep it to two or three sentences with no blame: it is being closed because it has been inactive since <date>, here is what stands in its way now (conflicts, superseded code, open review feedback), and anyone who thinks it still needs addressing is welcome to reopen it. Apply the `unslop` skill.

Example for close as stale:

```markdown
Closing this since it has been inactive since December 2025, and `main` has moved on enough that it now conflicts in several files, including the translations. If the split between Community guidelines and Norms still needs to happen, feel free to reopen this or start a new PR from it.
```

Show it and wait for a yes as in step 7. Then run only what the user approved:

```bash
gh pr comment <n> --body-file ~/projects/drafts/reply-<n>-triage.md

# Close
gh pr close <n>

# Rebase and review: only when the head branch can be updated (same repo, or maintainerCanModify)
gh pr update-branch <n> --rebase
```

- **Close, or close as stale.** Post the comment, then `gh pr close <n>`. Do not pass `--delete-branch`: the branch belongs to the author, and reopening needs it.
- **Nudge the author.** Post the comment. Add a reviewer or assignee only if the user asked.
- **Take it over.** Post the comment, then use the `work-on` skill to continue on a new branch made from the PR head (`git switch -c <new-branch> triage-pr-<n>`), so the author's commits and credit carry over. Close this pull request, linking the new one, only after the new one is open.
- **Rebase and review.** `gh pr update-branch --rebase` rewrites someone else's branch, so it needs the user's yes like a force-push does. If it reports conflicts, or the head branch cannot be updated, leave it and say so: the comment then asks the author to rebase. Once it is up to date, use the `review-pull-request` skill.

Delete the draft once the comment is posted, delete the local `triage-pr-<n>` branch (`git branch -D triage-pr-<n>`), and archive the thread as in step 9.

## Showing it above the composer

When `bb impromptu-ui help` succeeds, show triaged issues above the composer instead of in chat. The `impromptu-ui` skill has the file format. Publish with `bb impromptu-ui publish --file <path> --key triage`, one item per issue:

- `title`: `#<n> <issue title>`, with `url` set to the issue, so the title links to it
- `badges`: the recommended outcome, then the issue's labels
- `summary`: first line is the recommendation and why, since it is all the row above the composer shows. Then one line per ask with its status and evidence.
- `details`: suggested label, assignee, or milestone changes, and blockers to mark or unmark, if any
- `draft`: the full drafted comment, with `draftLabel` set to `Comment to post`. The opened item shows it once, in a box the user can edit, so do not repeat it in `summary` or `details`.
- `actions`: a primary `message` button labelled for the recommended outcome ("Post and close", "Post and mark blocked by #<m>"), then one for the likeliest alternative ("Post" when the alternative is keeping it open). Labels say only what the button does, with no "Instead:" prefix. Each `message` button's `text` is its instruction followed by `{draft}`, for example `Post this comment on #<n>, then close it as completed:` and `{draft}` below it. Both buttons share the one draft, and whichever is pressed sends the comment as the user left it.

Pressing a button is the user's yes for that issue. When its message arrives, post the comment exactly as it appears in the message, since the user may have edited it: write it to `~/projects/drafts/reply-<n>-triage.md`, run the step 8 commands for the outcome the message names, delete the draft, and republish with the same key. Act only on the issue the message names. If that was the last open item, go on to step 9.

A pull request gets the same kind of item, with these differences:

- `badges`: `PR` first, then the recommended outcome, then `Draft` if it is one
- `summary`: after the recommendation, one line each for whether it landed, the related issues and where each stands (quoting the latest status), whether it still applies, when the pull request was last touched, and whether the author is active in the repo, each with its evidence
- `actions`: a primary button for the recommended outcome ("Post and close", "Post and close as stale", "Post nudge", "Post and take over", "Post, rebase, and review"), then one for the likeliest alternative. The `text` names the outcome, for example `Post this comment on #<n>, then close it:` with `{draft}` below. When pressed, run the P6 commands for that outcome.

## Several issues at once

Given a list, a label, a milestone, "the oldest issues in this repo", or "the oldest open pull requests", triage one at a time: read, assess, draft, confirm, act, then move to the next. Start with a short table of the queue (number, title, age, last activity) so the user can reorder or skip. Do not batch drafts across issues unless the user asks.

```bash
gh issue list --state open --search 'sort:updated-asc' --json number,title,createdAt,updatedAt,labels --limit 30
gh pr list --state open --search 'sort:created-asc' --json number,title,author,isDraft,createdAt,updatedAt --limit 30
```

In a queue that mixes the two, tag each row `issue` or `PR`.

### With the impromptu-ui plugin

If `bb impromptu-ui help` succeeds, show the whole batch above the composer instead of going one issue at a time in chat:

1. Do steps 1 to 6 for every issue first. Post, close, label, and move nothing yet.
2. Publish one view as described in "Showing it above the composer", one item per issue, sectioned by recommended outcome (close, keep open, move, rewrite).
3. In chat, give the counts by outcome and point to the list above the composer.

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

Archive the thread (step 9) only after the user has answered about the milestone.

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
| Leaving an issue that is waiting on something unmarked | Mark it blocked by the issue it waits on, or label it and name the decision it waits on |
| Treating a pull request like an issue | Check the number first, then follow "Pull requests" |
| Calling a PR not landed because `git cherry` found nothing | Squash merges and rewrites do not show there. Search merged PRs by what the change does, and check the issues it mentions |
| Checking only the issues the PR links to | Also search issues by what the unlanded parts do, and read where each one stands |
| Calling a file gone because `git diff -M` shows `D` | Follow the file one commit at a time: files moved and then edited, or moved twice, lose rename detection across the whole range |
| Writing `@login` when quoting someone in the comment | Name them without the `@` unless the comment is meant to notify them |
| Judging staleness by the author's activity in the repo | Judge it by the last activity on the pull request itself |
| Calling a PR obsolete because its files are "gone" | Check for renames first: a moved file can still take the change |
| Keeping a years-old, unclaimed PR open with a question nobody will answer | Close it as stale, and invite a reopen |
| Rebasing someone else's branch, or deleting it on close, without asking | Rebase only on a yes, and never pass `--delete-branch` |
