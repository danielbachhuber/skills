---
name: review-code
description: Use when reviewing code for someone, such as a pull request, a branch, a diff, uncommitted changes, or a set of files, or when asked to look over, critique, or give feedback on changes, or which of them tests cover.
---

# Review code

## Overview

A review ends in decisions the user makes, one per finding. Each finding is written so its point lands at a glance, and each comes with ways to act on it. The user makes every decision; nothing is posted, filed, or committed until they choose it.

When the code under review is a GitHub pull request, also load the `review-pull-request` skill. It adds the choices that act on the PR itself.

## What to look for

Check the change in this order. Each layer depends on the ones before it, so a problem in an earlier layer matters more than any in a later one:

1. **Correct:** Does the code do what the issue, PR description, or user asked for? Does it handle edge cases? Is it tested well enough to stay correct when someone else changes it? Is it fast enough for its use?
2. **Secure:** Does it open a vulnerability? Does it store data safely and handle personal information correctly? Could it be used for a denial of service? Does it validate input enough?
3. **Readable:** Can someone follow it and see the business rule it carries? Are names clear, tests concise, and conventions consistent with the rest of the repo?
4. **Elegant:** Does it use well-known patterns and stay simple while doing what it needs to?
5. **Altruist:** Does it leave the codebase better, such as by removing unused code or improving documentation in what it touches?

Leave these alone: problems that existed before the change, guesses about what the author meant, choices the author made on purpose (the PR description, a code comment, or an ADR says so), and anything the repo's linter or formatter already enforces.

## Writing each finding

Load the `show-dont-tell` skill. For each finding, pick the form it lists for that kind of finding (a scenario table, a call tree, a before and after), put it in the finding's summary, and cut the prose to the point the form makes.

Give each finding its suggested fix when it has one, as a diff against the code under review.

Give each finding a priority and rank findings by it:

| Priority | Meaning |
|---|---|
| **P0 blocker** | Must be fixed before merging: wrong behavior, data loss, a security hole |
| **P1 material** | Should be fixed in this change: a likely bug, an untested risky behavior |
| **P2 suggestion** | Worth doing, and fine to skip or file for later |
| **P3 nit** | Small readability or style point |

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

Hold the change to these rules too:

- A bug fix comes with a test at the lowest layer that reproduces the bug, and the test fails without the fix.
- A change that writes, copies, counts, or deletes data needs a server test that reads the data back. An end-to-end test only checks what reaches the screen, so it doesn't show the data is right.
- A change that updates a denormalized copy, a counter, or a derived view needs a test that checks every copy after the write and after the delete.

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

In chat, say whether you'd approve, how many findings there are at each priority, and how many of the changed behaviors tests cover (for example, "4 of 6"). Then name what the review didn't check, such as how the change fits the wider architecture, domain rules you couldn't confirm, or a flow you couldn't run, so an approval isn't read as covering more than it did. The findings themselves don't go in chat. Leave out numbers the user can't act on, such as a confidence score.

## Common mistakes

| Mistake | Fix |
|---|---|
| A finding explained in a paragraph | The form `show-dont-tell` lists for it, with the paragraph cut to its point |
| A fix offered without checking it | Apply, typecheck, lint, restore, then offer |
| Coverage judged by which files have test files | One row per behavior, each matched to the test that checks it |
| A behavior called covered because a test runs its lines | Undo that part of the change; the test must fail |
| Every untested row turned into a finding | Only behaviors that could break unnoticed |
| A readability nit ranked above a missed edge case | Rank by priority; correctness and security come first |
| A finding about code the change didn't touch, or about a choice the author explained | Leave it out |
| A bug fix accepted with only an end-to-end test | A test at the lowest layer that reproduces the bug and fails without the fix |
| A data write checked only by what the screen shows | A server test that reads the data back, every copy, after write and delete |
| An approval with no word on what wasn't checked | Name what the review didn't cover |
| Findings listed in chat | Chat says only the verdict, the finding count, and the coverage count |
| Reviewing a PR with only these choices | Load `review-pull-request` for the PR's own choices |
