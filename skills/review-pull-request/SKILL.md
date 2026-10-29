---
name: review-pull-request
description: Use when reviewing a GitHub pull request for someone, such as when given a PR number or URL and asked to review it, look it over, or leave review comments.
---

# Review pull request

## Overview

**REQUIRED SUB-SKILL:** Use `review-code` for writing the findings, checking each fix, offering the choices, and reporting in chat. This skill adds the two choices that act on the pull request itself. Nothing reaches GitHub as a submitted review: the user submits the review themselves.

## The PR's choices

Offer these alongside `review-code`'s **Create issue**. Its **Fix** choice is for local code, so a PR gets **Fix in a PR against this PR** in its place.

| Choice | What it does |
|---|---|
| **Attach as draft inline review comment** | Adds the comment, followed by the suggested fix when there is one, to the user's pending review on the PR. Creates the pending review if there isn't one. Never submits it. |
| **Fix in a PR against this PR** | Starts a new thread in the PR's project, in a new worktree branched from `origin/<PR head branch>`, with that branch as its diff base. |

Let the user edit a comment's text before it is attached.

### Attach as draft inline review comment

Write the fix by where it lands:

- **The fix replaces lines this PR changes.** Write it as a GitHub ` ```suggestion ` block, and anchor the comment to exactly the lines it replaces, as a multi-line comment when it covers several. GitHub can't widen a comment's range after it's added.
- **The fix is in a file or on lines the PR doesn't change.** GitHub doesn't allow suggestions there. Write it as a ` ```diff ` block and anchor the comment to the line the finding is about. GitHub only accepts comments on lines inside the PR's diff, changed or context. When that line is outside every hunk, anchor to the changed line that causes the problem and link the other line with `~/.claude/skills/draft-issue-description/permalink.sh`.

Check the fix as `review-code` says, with the PR's head branch checked out, before attaching it.

A user has at most one pending review per PR. Look for it, then add to it:

```bash
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){id reviews(states:PENDING,first:1){nodes{id}}}}}' \
  -f o=<owner> -f r=<repo> -F n=<n>

# A pending review exists: add the comment to it.
gh api graphql -f query='mutation($id:ID!,$path:String!,$line:Int!,$start:Int,$startSide:DiffSide,$body:String!){addPullRequestReviewThread(input:{pullRequestReviewId:$id,path:$path,line:$line,startLine:$start,side:RIGHT,startSide:$startSide,body:$body}){thread{id}}}' \
  -f id=<review-id> -f path=<path> -F line=<last-line> -F start=<first-line> -f startSide=RIGHT -F body=@/tmp/comment.md

# None exists: create it. Leaving out `event` keeps it pending.
gh api repos/<owner>/<repo>/pulls/<n>/reviews --input /tmp/review.json
# /tmp/review.json: {"comments":[{"path":"…","start_line":12,"line":14,"side":"RIGHT","start_side":"RIGHT","body":"…"}]}
```

For a single-line comment, drop `start` and `startSide` from the mutation call, or `start_line` and `start_side` from the JSON.

### Fix in a PR against this PR

Start the thread with `~/.claude/scripts/start-branch-thread <PR URL> --against-pr`. Its prompt stands alone, since that thread sees nothing of this one. It names the PR (title, number, and link), states the finding and the fix in full, and asks for a PR opened with `gh pr create --base <PR head branch>`.

## After approving

Once an approving review is on the PR, whether the user asked you to submit it or submitted it themselves, offer the next step above the composer as an inline Impromptu UI view with two buttons:

| Choice | What it does |
|---|---|
| **Merge and archive thread** (primary) | Merges the PR, then archives this thread. |
| **Merge only** | Merges the PR and leaves the thread open. |

**REQUIRED SUB-SKILL:** Use `merge-after-ci-completes` for either choice. It waits for every check on the PR to finish, merges, and archives the thread once the PR is merged. For **Merge only**, skip its archive step.

## Common mistakes

| Mistake | Fix |
|---|---|
| Suggestion anchored to one line of a several-line fix | Anchor to exactly the replaced lines, as a multi-line comment |
| Fix checked on another branch | Check it with the PR's head branch checked out |
| ` ```suggestion ` on lines the PR doesn't change | ` ```diff ` block, anchored to the line the finding is about |
| Comment anchored outside every hunk, so GitHub rejects it | Anchor to the changed line that causes it; permalink the other |
| Review created with an `event`, or a second review created | Leave out `event`; add to the existing pending review |
| Fix thread prompt that says "the finding above" | Name the PR and restate the finding in the prompt |
| Fix PR opened against `main` | `gh pr create --base <PR head branch>` |
| Approval reported in chat with nothing to act on next | Offer **Merge and archive thread** and **Merge only** above the composer |
| Merged with `gh pr merge --auto` or while checks were still running | Merge through `merge-after-ci-completes` |
