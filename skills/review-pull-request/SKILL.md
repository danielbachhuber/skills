---
name: review-pull-request
description: Use when reviewing a pull request or a diff for someone, such as when asked to review, look over, or give feedback on a PR, a branch, or a set of changes before it merges.
---

# Review pull request

## Overview

A review ends in decisions the user makes, one per finding. Each finding is written so its point lands at a glance, and each comes with three ways to act on it. Nothing reaches GitHub as a submitted review: the user submits the review themselves.

## Writing each finding

Load the `show-dont-tell` skill. For each finding, pick the form it lists for that kind of finding (a scenario table, a call tree, a before and after), put it in the finding's summary, and cut the prose to the point the form makes.

Rank findings most severe first.

## What the user decides on each finding

Offer each finding with these three choices, and mark the likely one as the default.

| Choice | What it does |
|---|---|
| **Attach as draft inline review comment** | Adds the comment, followed by the suggested fix when there is one, to the user's pending review on the PR. Creates the pending review if there isn't one. Never submits it. |
| **Create issue** | Drafts an issue for the finding with the `draft-issue-description` skill, in `~/projects/drafts/`, for the user to check before it is filed. |
| **Fix in a PR against this PR** | Starts a new thread in the PR's project, in a new worktree branched from `origin/<PR head branch>`, with that branch as its diff base. |

Let the user edit a comment's text before it is attached.

### Attach as draft inline review comment

Write the fix by where it lands:

- **The fix replaces lines this PR changes.** Write it as a GitHub ` ```suggestion ` block, and anchor the comment to exactly the lines it replaces, as a multi-line comment when it covers several. GitHub can't widen a comment's range after it's added.
- **The fix is in a file or on lines the PR doesn't change.** GitHub doesn't allow suggestions there. Write it as a ` ```diff ` block and anchor the comment to the line the finding is about. GitHub only accepts comments on lines inside the PR's diff, changed or context. When that line is outside every hunk, anchor to the changed line that causes the problem and link the other line with `~/.claude/skills/draft-issue-description/permalink.sh`.

Before attaching a fix of either kind, apply it to the file on the PR's head branch, run the repo's typecheck and linter (from `package.json` scripts, the CI config, or the project's CLAUDE.md), then restore the file. A fix that fails either is not ready to attach.

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

## Reporting in chat

In chat, say whether you'd approve and how many findings there are. The findings themselves don't go in chat.

## Common mistakes

| Mistake | Fix |
|---|---|
| A finding explained in a paragraph | The form `show-dont-tell` lists for it, with the paragraph cut to its point |
| Suggestion anchored to one line of a several-line fix | Anchor to exactly the replaced lines, as a multi-line comment |
| ` ```suggestion ` on lines the PR doesn't change | ` ```diff ` block, anchored to the line the finding is about |
| Comment anchored outside every hunk, so GitHub rejects it | Anchor to the changed line that causes it; permalink the other |
| Suggestion attached without checking it | Apply, typecheck, lint, restore, then attach |
| Review created with an `event`, or a second review created | Leave out `event`; add to the existing pending review |
| Fix thread prompt that says "the finding above" | Name the PR and restate the finding in the prompt |
| Fix PR opened against `main` | `gh pr create --base <PR head branch>` |
