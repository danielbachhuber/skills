---
name: review-code
description: Use when reviewing code for someone, such as a pull request, a branch, a diff, uncommitted changes, or a set of files, or when asked to look over, critique, or give feedback on changes, or which of them tests cover.
---

# Review code

## Overview

A review ends in decisions the user makes, one per finding. Each finding is written so its point lands at a glance, and each comes with ways to act on it. The user makes every decision; nothing is posted, filed, or committed until they choose it.

When the code under review is a GitHub pull request, also load the `review-pull-request` skill. It adds the choices that act on the PR itself.

## Writing each finding

Load the `show-dont-tell` skill. For each finding, pick the form it lists for that kind of finding (a scenario table, a call tree, a before and after), put it in the finding's summary, and cut the prose to the point the form makes.

Give each finding its suggested fix when it has one, as a diff against the code under review.

Rank findings most severe first.

## What the tests cover

List the behaviors the change adds or alters, one per row, not one per file. A behavior is something a caller or user could notice: a new branch, a new error case, a changed return value, a new screen state. Then find the test that exercises each one:

1. Look in the tests the change adds or edits, then in existing tests that call the changed code (search for the function, component, or route by name).
2. When the repo has a coverage command (in `package.json` scripts, the CI config, or the project's CLAUDE.md), run it for the touched tests and read the changed lines' hits. A line that runs isn't a behavior that's checked, so still read the assertions.
3. For a behavior a test seems to cover, confirm the test would catch its loss: undo that part of the change, run the test, then restore the file. A test that still passes doesn't cover it.

Show the result as a table above the findings:

| Behavior | Test | Covered |
|---|---|---|
| Retries a failed sync up to `MAX_ATTEMPTS` | `sync.test.ts` › "retries then succeeds" | Yes, fails when the retry is removed |
| Gives up after `MAX_ATTEMPTS` failures | None | **No** |
| Logs each retry | `sync.test.ts` › "retries then succeeds" runs it, asserts nothing | **Partly** |

A row marked **No** or **Partly** becomes a finding when the behavior could break unnoticed: error handling, edge cases, anything a later change is likely to touch. Rank it like any other finding. Its fix is the missing test, checked the same way as any fix, plus a run showing it fails without the change. Leave untested rows that aren't worth a test, such as logging or copy changes, as rows in the table.

## Checking a fix

Before offering a fix, apply it to the file, run the repo's typecheck and linter (from `package.json` scripts, the CI config, or the project's CLAUDE.md), then restore the file. A fix that fails either is not ready to offer.

## What the user decides on each finding

Offer each finding with these choices, and mark the likely one as the default.

| Choice | When | What it does |
|---|---|---|
| **Create issue** | Always | Drafts an issue for the finding with the `draft-issue-description` skill, in `~/projects/drafts/`, for the user to check before it is filed. |
| **Fix** | The code is a local branch or working tree, not a PR | Applies the fix in that worktree and leaves it uncommitted for the user to look over. |

## Reporting in chat

In chat, say whether you'd approve, how many findings there are, and how many of the changed behaviors tests cover (for example, "4 of 6"). The findings themselves don't go in chat.

## Common mistakes

| Mistake | Fix |
|---|---|
| A finding explained in a paragraph | The form `show-dont-tell` lists for it, with the paragraph cut to its point |
| A fix offered without checking it | Apply, typecheck, lint, restore, then offer |
| Coverage judged by which files have test files | One row per behavior, each matched to the test that checks it |
| A behavior called covered because a test runs its lines | Undo that part of the change; the test must fail |
| Every untested row turned into a finding | Only behaviors that could break unnoticed |
| Findings listed in chat | Chat says only the verdict, the finding count, and the coverage count |
| Reviewing a PR with only these choices | Load `review-pull-request` for the PR's own choices |
