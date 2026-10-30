---
name: review-in-subthread
description: Use when a change should get a second read from a reviewer that hasn't seen this thread's reasoning, such as "review this in a subthread", "get a fresh review before I commit", "have another agent look at this PR", or when another skill offers a review in a subthread and the user says yes.
---

# Review in a subthread

A reviewer that starts fresh, without this thread's reasoning, catches what the author talked themselves past. This skill starts that reviewer as a child thread, waits for its report, and checks each finding before acting on it.

**REQUIRED SUB-SKILL for the reviewer:** `review-code`. The subthread loads it; this thread doesn't.

## 1. Pick where the reviewer runs

| What's being reviewed | Where the reviewer runs |
|---|---|
| Changes in this thread's working tree, committed or not | This thread's environment, so it sees the uncommitted changes |
| A pull request | The worktree that has the PR's head branch checked out |

## 2. Write the brief

The brief is the reviewer's only context. It has these parts, in this order:

1. **What to review.** "Use the review-code skill to review" the working tree's changes against the merge base (committed, staged, and unstaged), or the PR by title, number, and link.
2. **What the change is meant to do.** One or two sentences from the issue or the PR description, plus the issue's title and link when there is one.
3. **The read-only rule.** Another thread may be working in this checkout, so the reviewer doesn't edit, stage, commit, or stash anything, and doesn't post to GitHub.
4. **The report.** Every finding, ranked most severe first, with its suggested fix, and the test coverage table, all in the final response, which is reported back to the thread that started it.

Leave out how the change was built, approaches you tried, and what you're worried about, so the reviewer's read isn't shaped by yours.

## 3. Start the reviewer

For this thread's working tree:

```bash
bb thread spawn --project <project id from bb status> --environment "$BB_ENVIRONMENT_ID" \
  --parent-self --title "Review: <change>" --prompt-file - <<'EOF'
Use the review-code skill to review the changes in this working tree against
<merge base, such as origin/main>: committed, staged, and unstaged.

The change is meant to: <one or two sentences from the issue, not from your plan>.
Issue: <title and link, if there is one>.

This is a read-only review. Another thread is working in this checkout, so don't edit,
stage, commit, or stash anything, and don't post to GitHub. Put every finding, ranked
most severe first, with its suggested fix, and the test coverage table in your final
response. That response is reported back to the thread that started you.
EOF
```

For a pull request, `start-branch-thread` finds or creates the worktree with the PR's branch and sets the diff base:

```bash
~/.claude/scripts/start-branch-thread <PR URL> --prompt-file - -- --parent-self --title "Review: <PR title>" <<'EOF'
Use the review-code skill to review <PR title> (#<n>), <PR URL>, against its base branch.

The change is meant to: <one or two sentences from the PR description or its issue>.

This is a read-only review. Don't edit, stage, commit, or stash anything, and don't post
to GitHub. Put every finding, ranked most severe first, with its suggested fix, and the
test coverage table in your final response. That response is reported back to the
thread that started you.
EOF
```

Without `bb`, run the same brief as a subagent instead.

## 4. Wait, then archive

```bash
bb thread wait <review thread id> --timeout 30m
```

Once the report has arrived, archive the review thread so it leaves the sidebar. Its report stays readable in this thread and in the archived one:

```bash
bb thread archive <review thread id>
```

If the wait timed out or the reviewer stopped without a report, leave it open so the user can see what happened.

## 5. Check each finding

Check each finding against the code before acting on it:

- **Real, with an obvious fix:** fix it and rerun the tests. For a PR that isn't this thread's own work, offer the fix through `review-pull-request`'s choices instead of changing the branch.
- **Real, but a product decision or a tradeoff:** bring it to the user, with the options.
- **Wrong:** drop it, with a one-line reason.

## 6. Show the findings

When `bb impromptu-ui help` succeeds, load the `impromptu-ui` skill and publish one card per finding, in the cards layout. Include every finding, so the user sees the whole review in one place: the ones waiting on the user, and the fixed and dropped ones, published with a `complete` status that says what happened ("Fixed", "Dropped").

The user decides from the card alone, without opening the code or the reviewer's thread. Each card holds:

| Field | What goes in it |
|---|---|
| `title` | Priority and the problem as a situation the user would notice: "P2: Turning a filter back off returns to the old page", not "P2: stale page state". |
| `badges` | What your check found: `confirmed`, `tradeoff`, `test gap`, `not reproduced`. |
| `summary` | First line: the problem in one sentence. Then the steps or inputs that show it, in the form `show-dont-tell` gives for that kind of finding, such as a scenario table or a before and after. Then where it lives, as `file:line` links, and what you found when you checked it, such as "Reproduced: page 3 comes back after the filter is cleared". For a tradeoff, the options and what each costs. |
| `changes` | The suggested fix as a unified `patch`, with `role: "proposed"`, checked as `review-code` says. Leave it out when there's no code fix. |
| `details` | The reviewer's own words for the finding, quoted, and anything it affects outside this change, such as another PR that would have to follow a rename. |
| `actions` | The choices from `review-code`, or from `review-pull-request` for a PR. Give each a `detail` line saying what it will do to this finding, and mark the likely one `primary`. |

Then report in chat as `review-code` says: the verdict, the count at each priority, and what was fixed and dropped, each with its one-line reason. The findings waiting on the user are on the cards, not in chat. If a PR description exists or is being drafted, add the fixes that changed the code.

Without the plugin, write each finding in chat with the same parts, in the same order.

## Common mistakes

| Mistake | What to do instead |
|---|---|
| Briefing the reviewer with your own doubts or your plan | Give it the goal and what to review, and let it reach its own read. |
| Reviewer started in a new worktree for uncommitted changes | Use `--environment "$BB_ENVIRONMENT_ID"` so it sees the working tree. |
| Brief that says "the change above" | The subthread sees nothing of this one. Name the change, issue, or PR in full. |
| Acting on every finding as written | Check each against the code first; drop the wrong ones with a reason. |
| A finding card with only a title and buttons | Fill the summary with the steps that show it, where it lives, and what your check found, and add the fix as a proposed change. |
| Cards only for findings the user decides | Publish the fixed and dropped ones too, marked complete, with what happened. |
| Review thread left in the sidebar after its report arrived | Archive it once the report is in. |
| Archiving a reviewer that timed out | Leave it open so the user can see what happened. |
