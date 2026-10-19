---
name: review-code
description: Use when reviewing code for someone, such as a pull request, a branch, a diff, uncommitted changes, or a set of files, or when asked to look over, critique, or give feedback on changes.
---

# Review code

## Overview

A review ends in decisions the user makes, one per finding. Each finding is written so its point lands at a glance, and each comes with ways to act on it. The user makes every decision; nothing is posted, filed, or committed until they choose it.

When the code under review is a GitHub pull request, also load the `review-pull-request` skill. It adds the choices that act on the PR itself.

## Writing each finding

Load the `show-dont-tell` skill. For each finding, pick the form it lists for that kind of finding (a scenario table, a call tree, a before and after), put it in the finding's summary, and cut the prose to the point the form makes.

Give each finding its suggested fix when it has one, as a diff against the code under review.

Rank findings most severe first.

## Checking a fix

Before offering a fix, apply it to the file, run the repo's typecheck and linter (from `package.json` scripts, the CI config, or the project's CLAUDE.md), then restore the file. A fix that fails either is not ready to offer.

## What the user decides on each finding

Offer each finding with these choices, and mark the likely one as the default.

| Choice | When | What it does |
|---|---|---|
| **Create issue** | Always | Drafts an issue for the finding with the `draft-issue-description` skill, in `~/projects/drafts/`, for the user to check before it is filed. |
| **Fix** | The code is a local branch or working tree, not a PR | Applies the fix in that worktree and leaves it uncommitted for the user to look over. |

## Reporting in chat

In chat, say whether you'd approve and how many findings there are. The findings themselves don't go in chat.

## Common mistakes

| Mistake | Fix |
|---|---|
| A finding explained in a paragraph | The form `show-dont-tell` lists for it, with the paragraph cut to its point |
| A fix offered without checking it | Apply, typecheck, lint, restore, then offer |
| Findings listed in chat | Chat says only the verdict and the count |
| Reviewing a PR with only these choices | Load `review-pull-request` for the PR's own choices |
