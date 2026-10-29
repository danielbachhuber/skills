---
name: work-on
description: Use when starting work on a GitHub issue or a new piece of code, such as "work on #123", a pasted issue URL or issue text, "let's build X", or "implement this", and when a thread that began as triage, review, or discussion turns into solving it, such as "should we just try to solve this?" or "go ahead and fix it". Use before any code is written.
argument-hint: [issue-number-or-url-or-topic]
---

# Work on an issue

Before writing code, work out what the change has to look like, how it will be tested,
where it can break, and how it will ship. Then build it and hand it back ready for review. Most corrections
after an agent starts on an issue come from skipping one of these, so each one leaves
something the user can read.

Only two things wait for the user: choosing a visual direction, and any decision that is
theirs to make. Everything else gets written down and the work goes on.

## 1. Read the issue and the code

- Read the issue body, every comment, and any linked issues and PRs. Later comments often
  narrow or change what the body asks for. If the user pasted issue text without a number,
  look for the issue with `gh issue list --search`, and work from the text if there is none.

  ```bash
  gh issue view <n> --comments
  gh issue view <n> --json body,comments,closedByPullRequestsReferences,assignees
  ```

- If nobody is assigned to the issue, assign it to the user. Leave an existing assignee
  alone, even if it's someone else, and mention it in your first message.

  ```bash
  gh issue edit <n> --add-assignee @me
  ```

- Read the code the change touches, and the code that calls it. Note what you find with
  `file:line` references. Tests named after old bugs, guard clauses with comments, and odd
  constants mark edge cases someone has already hit. Carry them into step 4.
- Check for related work: an open PR or a branch for the same issue. If the work needs its
  own branch, set it up the way CLAUDE.md says.

## 2. Visual changes

If the change alters what a user sees:

- **A Figma link or a high-fidelity design exists:** build from it.
- **Otherwise:** use the `iterate-design` skill, show the options, and wait for the user
  to pick one before implementing any of them. Work out steps 3 to 5 first and post them
  with the options, so the user answers everything in one stop.

## 3. Choose a testing strategy

Pick the kinds of tests that fit this change, not whichever kind is most familiar. Start
from where the risk in this change lives, then look at what the repo already runs. The
right kind may be one the repo doesn't use yet. Some to consider:

- unit, integration, and end-to-end tests
- component tests and Storybook stories, with interaction or visual snapshot checks
- property-based tests for logic with many possible inputs
- contract tests where the change meets an API or another service
- migration or backfill tests run against a copy of real data
- accessibility checks, and performance or load measurements
- type checks and lint rules that make a mistake impossible to write
- a manual check in the running app, with screenshots

Write the strategy down:

```
Tests:      <kind> for <behavior>, because <reason>
            ...
Not tested: <behavior>, because <reason> (how it gets checked instead, such as a manual check in the app)
```

Test behavior through public interfaces, not internals. An expected value has to come from
somewhere other than the code under test: a literal, a worked example, the issue.

Ask the user only when the choice is a real tradeoff they would want a say in, such as an
end-to-end test that would be slow or flaky, or adding a new testing tool.

## 4. List the edge cases

List the edge cases this change will meet in a table, so the case and its handling read
separately:

```markdown
| Edge case | How it's handled | Source |
|-----------|------------------|--------|
| <what happens, as a situation: "The page reloads before the vote is saved"> | <what the code does about it, and the test that covers it, if any> | <issue comment, `file:line`, or "my reasoning"> |
```

Write the edge case as the situation only, with no handling in it. Put a case that needs the
user's decision in the table too, with "Your call:" and the options in the handling column.

Cover empty, missing, and loading data; the smallest and largest realistic values; errors
and failures from what the code depends on; concurrency and stale data; and permissions.
Only list the ones that apply to this change.

Most cases have an obvious handling: build it, and test it where step 3 says to. Ask the
user only about cases where the right behavior is a product decision, such as what a user
should see, or whether to block an action.

## 5. Decide whether it needs a rollout plan

Most changes ship by merging: once deployed, everyone gets them, and reverting the PR
undoes them. Those need no rollout plan. Say so in one line and move on.

A change needs a rollout plan when merging and deploying is not enough, or when reverting
would not undo it. Look for:

- a database migration, backfill, or other change to stored data, especially one that
  drops or rewrites data
- code and schema that have to ship in a set order, such as adding a column before the
  code that writes it, or a deploy that has to wait for another service or a mobile release
- a breaking change to an API, event, or file format that something else reads
- a new environment variable, secret, third-party setting, or cron job that someone sets
  outside the code
- a change risky enough to put behind a feature flag or release to some users first, such
  as a change to sign-in, payments, or something many people use at once
- caches, queued jobs, or open clients that will still hold the old shape after deploy

Check what the repo already uses before inventing a process: its feature flag system, how
migrations run, and any rollout or deploy section in the PR template.

When one applies, write the plan down:

```
Rollout:    <steps in order, and who or what does each: merge, run migration, set env var, turn on flag>
Check:      <how to tell in production that it worked: a log line, a metric, a page to load>
Roll back:  <how to undo each step, and which steps can't be undone>
```

Ask the user only for what you can't decide or do yourself, such as who turns on the flag,
when a migration can run, or whether a step that can't be undone is acceptable.

## 6. Post the plan, then build

Post steps 3, 4, and 5 in chat as one short message, with any questions for the user at the
top. If step 2 already posted them, don't repeat them. If there are no questions, keep
building. Don't wait for approval.

Build the change, run the tests, and check it in the running app when the change is visible
(the `run` skill covers launching it). Take screenshots of each visible state for the
hand-back.

## 7. Offer a review in a subthread

Once the change is built and its tests pass, decide whether to offer the user a second read.
A reviewer that starts fresh, without this thread's reasoning, catches what the author talked
themselves past. The review is opt-in: offer it in the hand-back (step 8) and run it only
when the user says yes. Offer it when any of these applies:

- the change touches more than one module, or about 150 or more lines outside tests and
  generated files
- it adds new logic: branches, state, error handling, concurrency, or a new data path
- it touches sign-in, permissions, payments, stored data, or anything step 5 gave a
  rollout plan
- you changed approach partway through, or worked around something you don't fully
  understand

Don't offer it for copy and docs changes, config and dependency bumps, fixture swaps, and
small fixes in one place.

When `bb impromptu-ui help` succeeds, load the `impromptu-ui` skill and ask with
`"layout": "inline"` under the key `work-on-review`, as the last tool call of the
hand-back. Its title is "Review this change in a subthread before you commit?", its
`summary` is the one line that made you offer it (such as "Touches `src/votes/` and
`src/auth/`, about 300 lines"), and its answers are "Run review" (`primary`) and "Skip
review". Don't ask in chat as well. Without the plugin, end the hand-back on the question.

If the user says yes, start the review as a child of this thread, in this thread's
environment so it sees the uncommitted changes:

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

Tell the reviewer what the change is for, not how you built it or what you are worried
about, so its read isn't shaped by yours. Then wait for it:

```bash
bb thread wait <review thread id> --timeout 30m
```

Once the report has arrived, archive the review thread so it leaves the sidebar. Its report
stays readable in this thread and in the archived one:

```bash
bb thread archive <review thread id>
```

If the wait timed out or the reviewer stopped without a report, leave it open so the user
can see what happened.

Check each finding against the code before acting on it:

- **Real, with an obvious fix:** fix it and rerun the tests.
- **Real, but a product decision or a tradeoff:** bring it to the user with the hand-back,
  with the options.
- **Wrong:** drop it, with a one-line reason.

Then hand back again: update the PR description with the fixes that changed the code, and
list the findings and what happened to each. Without `bb`, run the same prompt as a
subagent instead.

## 8. Hand it back

When the user's instructions are to wait for their review before committing:

1. **PR description.** If the work is going to be a pull request, use the
   `draft-pr-description` skill. The testing strategy, edge cases, and any rollout plan
   from steps 3 to 5 belong in it, and so do review findings from step 7 that changed
   the code.
2. **Review offer.** If step 7 says to offer a review, ask as it describes.
3. Stop. Don't commit, push, or open the PR until the user confirms.

When the user has told you to commit and push without review, still draft the PR
description before opening the PR. Don't stop to offer the review.

## 9. Suggest reviewers

Once the PR is open, suggest who should review it. Skip this step when the PR is a draft,
when it already has a reviewer, or when nobody but the user reviews PRs in the repo.

1. **Check for reviewers already requested.** CODEOWNERS and branch rules often request
   them when the PR opens. Count entries rather than reading `.login`, since a team entry
   has `.slug` instead.

   ```bash
   gh pr view <n> --json isDraft,reviewRequests --jq '{isDraft, requested: (.reviewRequests | length)}'
   ```

2. **Check that the repo has other reviewers.** List who reviewed recently merged PRs,
   leaving out the user and bots. An empty list means a solo repo: stop here.

   ```bash
   gh pr list --state merged --limit 30 --json author,reviews --jq '
     [.[] | .author.login as $a | .reviews[].author.login
      | select(. != $a and (test("\\[bot\\]$|^github-actions$|^copilot"; "i") | not))]
     | group_by(.) | map({login: .[0], reviews: length}) | sort_by(-.reviews)'
   ```

   Drop the user's own login from the result (`gh api user --jq .login`).

3. **Match people to the change.** Look at who knows the code this PR touches:
   - `EXPERTS.md` at the repo root, if it exists: match the PR's scope and changed paths
     to a row.
   - Recent authors of the changed files, from `git log --format='%an <%ae>' -n 20 -- <paths>`.
   - People named in the issue or its comments as owning the area, or asked to weigh in.

   Prefer someone who appears both here and in the list from step 2. A recent author who
   never reviews is a weaker pick than an active reviewer who knows the area.

4. **Suggest one reviewer, with the reason.** Add a second only when the change spans two
   areas with different owners. Name the evidence for each pick, such as "wrote most of
   `src/votes/` in the last month" or "the `votes` row in `EXPERTS.md`", so the user can
   judge it. Ask before requesting the review, since it notifies the person. When
   `bb impromptu-ui` is available, ask above the composer with the `impromptu-ui` skill,
   one option per candidate. Once the user confirms:

   ```bash
   gh pr edit <n> --add-reviewer <login>
   ```

## Common mistakes

| Mistake | What to do instead |
|---------|-----------|
| Reading only the issue body | Read the comments and linked PRs too. |
| Writing unit tests by default | Say which kinds of tests fit and why, and what goes untested. |
| Putting edge cases only in test names | List them with their handling so the user can see and redirect. |
| Waiting for approval on the test plan | Post it and keep building, unless it asks the user a real question. |
| Assuming merging is the whole release | Check for migrations, deploy order, settings outside the code, and anything a revert won't undo. |
| Building one visual design without showing options | Use `iterate-design` unless a Figma or high-fidelity design exists. |
| Starting a review the user didn't ask for | Offer it above the composer and run it only on a yes. |
| Briefing the reviewer with your own doubts | Give it the goal and the diff, and let it reach its own read. |
| Opening the PR and stopping there | Suggest a reviewer, unless the repo has nobody else reviewing. |
| Requesting a review without asking | Name the pick and the reason, and request it once the user confirms. |
