---
name: work-on
description: Use when starting work on a GitHub issue or a new piece of code, such as "work on #123", a pasted issue URL or issue text, "let's build X", or "implement this", and when a thread that began as triage, review, or discussion turns into solving it, such as "should we just try to solve this?" or "go ahead and fix it". Use before any code is written.
argument-hint: [issue-number-or-url-or-topic]
---

# Work on an issue

Before writing code, work out what the change has to look like, how it will be tested,
and where it can break. Then build it and hand it back ready for review. Most corrections
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
  to pick one before implementing any of them. Work out steps 3 and 4 first and post them
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

## 5. Post the plan, then build

Post steps 3 and 4 in chat as one short message, with any questions for the user at the
top. If step 2 already posted them, don't repeat them. If there are no questions, keep
building. Don't wait for approval.

Build the change, run the tests, and check it in the running app when the change is visible
(the `run` skill covers launching it). Take screenshots of each visible state for the
hand-back.

## 6. Hand it back

When the user's instructions are to wait for their review before committing:

1. **Super Diff.** If `bb super-diff` exists in this bb, write the Super Diff yourself:
   run `bb super-diff guide` and follow it, passing `--target all` to `files`, `patch`, and
   `submit`. All changes is the Diff tab's default view, so the Super Diff shows there when
   the user opens it. Don't press Generate or ask the user to, since that only sends the
   request back to an agent.
2. **PR description.** If the work is going to be a pull request, use the
   `draft-pr-description` skill. The testing strategy and edge cases from steps 3 and 4
   belong in it.
3. Stop. Don't commit, push, or open the PR until the user confirms.

When the user has told you to commit and push without review, skip the Super Diff, and
still draft the PR description before opening the PR.

## Common mistakes

| Mistake | What to do instead |
|---------|-----------|
| Reading only the issue body | Read the comments and linked PRs too. |
| Writing unit tests by default | Say which kinds of tests fit and why, and what goes untested. |
| Putting edge cases only in test names | List them with their handling so the user can see and redirect. |
| Waiting for approval on the test plan | Post it and keep building, unless it asks the user a real question. |
| Building one visual design without showing options | Use `iterate-design` unless a Figma or high-fidelity design exists. |
| Ending with "press Generate for a Super Diff" | Write the Super Diff yourself with `bb super-diff`. |
