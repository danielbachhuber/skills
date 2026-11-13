---
name: sdlc-self-improve
description: Use when the user asks to review a repo's past week of pull requests, code review comments, CI failures, or delivery flow for improvements, run a retrospective on how a team ships code, or find review feedback that keeps recurring, checks that keep failing, or where pull requests wait.
---

# SDLC self-improve

## Overview

Read a repo's past week on GitHub: pull requests, review comments, review rounds, failed CI runs, review waits, reverts, and bug issues. Find what keeps recurring, pick the cheapest change that would stop it, measure what it cost, and show each suggestion as a card the user can turn into a GitHub issue. This is the repo-level counterpart to `self-improve-bb`, which reviews agent threads; this skill reviews the delivery process every author goes through, people and agents alike.

A suggestion is only useful if it recurs across pull requests, names the file or workflow to change, cites the comment or run ids that show it, and still holds against the current code. Prefer a deterministic fix to a written rule: a lint rule or CI check costs nothing per pull request, and a rule in `AGENTS.md` relies on someone reading it.

## Workflow

Run this skill in a fresh thread, from a checkout of the repo, so reviewers can check the current files.

1. **Collect.**
   ```bash
   python3 ~/.claude/skills/sdlc-self-improve/collect-repo.py --days 7
   ```
   Add `--repo owner/name` when the checkout's `origin` is not the repo. Use the number of days the user gives, at most 30. It takes about a minute. The script scans every author's pull requests updated in the window and counts only comments and reviews made inside it. It picks at most 40 pull requests with review feedback or failed CI (`--top` to change), busiest first, and splits them into batches of 8. The last line is the output directory. `flow.md` there has the repo-wide numbers; `batch-<n>.md` lists each batch; `pr-<n>.md` is one digest per picked pull request, with the error each failed CI job printed; `reviewer-<login>.md` holds all of one person's review feedback in the window, for each person who reviewed three or more PRs, including PRs below the cutoff; `prompt-<n>.md`, `prompt-flow.md`, and `prompt-people.md` are the reviewer subagents' filled-in prompts; `data.json` has everything. Mention any warning it prints: a source it could not check (no GitHub Actions runs, not run from a checkout) must be reported as not checked, never as clean.

   Each reviewer costs roughly 60k to 100k tokens. State the batch count. If it is over 6, ask whether to go ahead or rerun with a lower `--top`, and wait for the answer.

2. **Review in parallel.** In one message, dispatch one subagent per `prompt-<n>.md`, one for `prompt-flow.md`, and one for `prompt-people.md` when it exists, each with the prompt `Read <output-dir>/prompt-<n>.md and do what it says.` The batch reviewers read the week one pull request at a time; the people reviewer reads it one code reviewer at a time, which finds a request a person makes once on each of several PRs in different batches. Each writes its report to `report-<n>.md`, `report-flow.md`, or `report-people.md` in the output directory and replies with the path. If a reply holds the report instead, save it there yourself. Keep the digests out of your own context. If a reviewer hit its call limit, list the pull requests it skipped as one observation; do not send another reviewer.

3. **Merge.** Combine findings that share a target and a cause, and union their ids. A batch reviewer and the flow reviewer often reach the same CI fix from different sides, and a batch reviewer and the people reviewer the same review pattern; keep one finding with both sets of ids and evidence. A pattern seen in two batches is stronger than either alone, so merging is where most recurrence shows up. Drop a finding whose only evidence is one comment on one pull request; it goes under `observations`.

   Reviewers' run lists for the same CI failure differ and can hold a mistyped id. When merging CI findings, take the run ids from `data.json` instead, selecting by workflow, job, and the error text that defines the finding:
   ```bash
   jq '[.ci.failures[] | select(any(.jobs[]?; .job == "<job>" and any(.error[]?; test("<pattern>")))) | .id]' <output-dir>/data.json
   ```

4. **Write `findings.json`** in the output directory, in the shape below, then measure it:
   ```bash
   python3 ~/.claude/skills/sdlc-self-improve/measure_findings.py <output-dir>/findings.json
   ```
   It counts each finding's comments, reviewers, pull requests, authors, rework, failed CI runs and minutes, and review-wait hours from the ids, ranks the findings by how many pull requests they touched and then by cost, and prints one line each. Fix any `warning` about an id it could not find. Do not estimate impact yourself.

5. **Present.**
   ```bash
   python3 ~/.claude/skills/sdlc-self-improve/findings_to_view.py <output-dir>/findings.json > <output-dir>/view.json
   bb impromptu-ui publish --file <output-dir>/view.json --key sdlc-self-improve
   ```
   Each suggestion becomes a card with its impact, why the fix works, evidence, and the issue body as a draft the user can edit. In chat, say how many pull requests were scanned and reviewed, how many suggestions there are, the limiting step, and the top three by impact, and point to the cards. Do not repeat the list. If `publish` prints a validation error, fix `findings.json` and run both commands again. If `bb impromptu-ui` is not available, write the cards to `findings.md` in the output directory, show it numbered, and ask which to draft.

6. **When the user presses Draft issue**, the message carries the issue title and the body as they edited it. Load `draft-issue-description` and follow its rules for the body: prose context with no headings, then considerations, then the `**Done is:**` list. Write it to `~/projects/drafts/issue-<repo>-<slug>.md`, with the title as the first line (`# <title>`), and link it by absolute path. Set the finding's `state.draftPath` in `findings.json` and republish with the same two commands; the card then shows the draft and a **File issue** button. If the draft file exists when Revise is pressed later, rewrite it too. Do not file anything yet.

7. **When the user presses Revise**, the message carries their note and the issue body as they left it. Change the suggestion to match: its title, fix, target, basis, or issue body in `findings.json`, checking the repo or `data.json` when the note questions a fact. Keep the user's edits to the body unless the note asks otherwise. If the note shows the suggestion is wrong, move it to `observations` with the reason. If the change alters the cited ids, run `measure_findings.py` again. Republish with the same two commands, and reply in one line saying what changed.

8. **When the user presses File issue**, create it from the draft file, which they may have edited:
   ```bash
   gh issue create --repo <repo> --title "<first line without '# '>" --body "$(tail -n +3 <draft>)"
   ```
   Set `state.issueUrl`, delete the draft file, and republish so the card shows as filed with a link. Report the issue as its full title and number, linked.

## findings.json

```json
{
  "reviewedCount": 40,
  "constraint": "Human review: median 18.6h from ready to first review while CI reports in under 10 minutes",
  "findings": [
    {
      "title": "Run the formatter in a pre-commit hook",
      "signal": "CI friction",
      "fix": "CI change",
      "target": ".husky/pre-commit",
      "refs": { "comments": [2841234567], "ciRuns": [43456004013, 43456004099], "prs": [], "reverts": [], "bugs": [] },
      "tracked": "",
      "basis": "the hook formats staged files before they are pushed, so the Check formatting step stops failing",
      "evidence": [
        { "quote": "Check formatting failed again", "pr": 7132, "url": "https://github.com/o/r/pull/7132#discussion_r2841234567", "author": "reviewer" }
      ],
      "issue": { "title": "Format staged files before commit", "body": "<the reviewer's issue body>" },
      "state": {}
    }
  ],
  "observations": [{ "text": "Seen once and not tied to a fix", "prs": [7001] }]
}
```

`signal` is one of `repeated review feedback`, `CI friction`, `rework`, `escaped defect`, `review wait`, `review load`. A `review load` finding sets `refs.reviewer` to the login from the people reviewer's `Reviewer:` line; its impact is that person's share of the week's review feedback. `fix` is one of `lint rule`, `CI change`, `test`, `agent instructions`, `PR template`, `docs`, `process`. `refs` holds the reviewers' `Comments`, `CI runs`, and `PRs` lines as numbers; `reverts` and `bugs` hold commit SHAs and issue numbers from `flow.md`. `prs` counts toward review-wait hours only when `signal` is `review wait`. `tracked` is the reviewer's `Tracked:` line, empty when none. Evidence from a review comment or CI run has its `url` and `author`; evidence from the flow numbers leaves out `author`, and leaves out `pr` and `url` when it is about no single pull request. `constraint` is the flow reviewer's last line. `evidence` URLs come from the digest's comment or run. `measure_findings.py` adds `impact` and `impactLine`. `state` starts empty; steps 6 and 7 fill in `draftPath` and `issueUrl`. At most 20 findings.

## Common mistakes

- **One comment as a pattern.** A single reviewer's single comment is an observation. Recurrence across pull requests or reviewers is the point of the skill.
- **A rule where a check would do.** "Add to AGENTS.md: always run the formatter" fails the next time someone skips reading it. If a linter, formatter, type check, or CI step can catch it, that is the fix.
- **Old comments in this week's count.** Long-lived pull requests carry months of review. The digests and the measure count only what happened in the window; keep evidence quotes from it too.
- **Reporting a source as clean when it was not checked.** No GitHub Actions runs, no `bug` label, or no checkout means that part was not checked. Say so in chat.
- **Filing without confirmation.** Draft issue writes a file. Only File issue, pressed by the user, creates the issue.
- **Blaming a person.** A finding is about the system: the missing check, the unclear convention, the review queue. Do not name an author or reviewer as the problem in the issue body. One person writing most of the feedback is a load finding, not a criticism of them.
