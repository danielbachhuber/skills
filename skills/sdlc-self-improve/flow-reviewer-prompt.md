# Flow reviewer prompt

Send this to one subagent, filling in `{{DIR}}`, `{{REPO}}`, and `{{CHECKOUT}}`.

---

You are looking at how work flowed through the GitHub repo `{{REPO}}` over the past week, to find where it waited and what change would move the most work through. Work piles up at the slowest step; speeding up any other step does not help. Your job is to name that step and the cheapest change that relieves it.

`{{DIR}}/flow.md` has the week's numbers: pull requests updated and merged, median hours to first review and to merge, the pull requests waiting longest for a human review, the slowest to merge, CI failures by workflow with the failing jobs and steps, reverts, and bug issues. `{{DIR}}/index.tsv` has one row per pull request. `{{DIR}}/data.json` has everything, including each failed CI run's id, PR, commit, attempt, and minutes; read it with `jq`, never whole:

```bash
jq -r '.ci.failures[] | [.id, .workflow, .pr, .sha, .attempt, .minutes, ([.jobs[]?.job] | join("; "))] | @tsv' {{DIR}}/data.json
jq -r '.prs[] | select(.state=="OPEN" and (.isDraft|not)) | [.number, .author, .hoursWaiting, .hoursToFirstHumanReview] | @tsv' {{DIR}}/data.json
```

The repo's current files, including `.github/workflows/`, are in `{{CHECKOUT}}`.

Do not change files, comment on GitHub, or open issues. Stop after 15 tool calls and report what you have.

Look for:

1. **Review wait.** Ready pull requests that sat without a human review. Who are they waiting on, are they large, are they stacked behind each other? A finding names the change: smaller PRs, a review rotation, CODEOWNERS, an agent first-pass review, a WIP limit.
2. **CI friction.** A workflow, job, or step that fails across many runs or PRs, that fails and then passes on the same commit (a flaky check), or that takes many minutes to report something a local check would catch. Read the workflow file before naming the fix.
3. **Escaped defects.** Reverts, hotfixes, and bug issues opened this week, and which check or review should have caught them.

Before reporting a finding, check in one shell command that it is not already tracked: `gh issue list --repo {{REPO}} --state open --search "<two or three keywords>"`. If an open issue covers it, report it anyway and name the issue on the `Tracked:` line.

Report at most 4 findings in under 600 words, in the same shape the batch reviewers use:

```
### <imperative title, under 70 characters>
Signal: review wait | CI friction | escaped defect
Fix: lint rule | CI change | test | agent instructions | PR template | docs | process
Target: <file path in the repo, or the workflow and job>
Comments: none
CI runs: <every failed run id that shows it, comma-separated, or none>
PRs: <for review wait or escaped defects, the PR numbers it affected, or none>
Tracked: <open issue number and title, or none>
Basis: <one line on why the change relieves it>
Evidence:
> <the number, failing step, or PR that shows it> (#<PR> or run <id>)
Issue title: <the GitHub issue's title>
Issue body:
<the issue body, in markdown: no headings. Open with prose on what is happening and what it costs, citing the numbers. Then what to change. Then a bulleted list of considerations if there are any. End with a "**Done is:**" line and a short bulleted list of concrete, checkable completion criteria.>
```

Do not estimate impact; a script measures it from the run ids and PR numbers you cite.

Then one line naming the step you think limits the flow this week and why, from the numbers. Report nothing else.
