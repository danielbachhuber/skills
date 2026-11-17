# Flow reviewer prompt

`collect-repo.py` fills this in as `prompt-flow.md` in its output directory: `{{DIR}}`, `{{REPO}}`, `{{CHECKOUT}}`, and `{{REPORT}}`.

---

You are looking at how work flowed through the GitHub repo `{{REPO}}` over the past week, to find where it waited and what change would move the most work through. Work piles up at the slowest step; speeding up any other step does not help. Your job is to name that step and the cheapest change that relieves it.

`{{DIR}}/flow.md` has the week's numbers: pull requests updated and merged, median hours to first review and to merge, the pull requests waiting longest for a human review, the slowest to merge, change size and agent-assisted PRs compared by time to merge and review rounds, CI failures by workflow with the failing jobs and steps, reverts, and bug issues. `{{DIR}}/index.tsv` has one row per pull request. `{{DIR}}/data.json` has everything, including each failed CI run's id, PR, commit, attempt, minutes, and the error each failing job printed; read it with `jq`, never whole:

```bash
jq -r '.ci.failures[] | [.id, .workflow, .pr, .sha, .attempt, .minutes, ([.jobs[]? | .job + ": " + ((.error // [])[0:2] | join(" / "))] | join("; "))] | @tsv' {{DIR}}/data.json
jq -r '.prs[] | select(.state=="OPEN" and (.isDraft|not)) | [.number, .author, .hoursWaitingTotal, (.awaitingReviewFrom | join(",")), .url, .title] | @tsv' {{DIR}}/data.json
```

The repo's current files, including `.github/workflows/`, are in `{{CHECKOUT}}`.

Do not change files, comment on GitHub, or open issues. Stop after 15 tool calls and report what you have.

Look for:

1. **Review wait.** Ready pull requests that sat without a human review. Who are they waiting on, are they large, are they stacked behind each other? A finding names the change: smaller PRs, a review rotation, CODEOWNERS, an agent first-pass review, a WIP limit.
2. **CI friction.** A workflow, job, or step that fails across many runs or PRs, split by the error it printed, since one job such as lint fails for unrelated causes, that fails and then passes on the same commit (a flaky check), or that takes many minutes to report something a local check would catch. Read the workflow file before naming the fix.
3. **Escaped defects.** Reverts, hotfixes, and bug issues opened this week, and which check or review should have caught them.
4. **Change size.** Whether large pull requests wait longer or need more rounds than small ones, from "Build: change size and agent use". Agents make large changes cheap to write and no cheaper to review. A finding names the change: stacked PRs, a size limit with a CI warning, agent instructions to split work. Use the signal `batch size` and cite the large PRs on the `PRs:` line.
5. **Agent-assisted rework.** Whether agent-assisted PRs need more rounds than the rest. Read two or three of their digests at `{{DIR}}/pr-<number>.md` before deciding the cause: a convention the agent did not know points at agent instructions, and a wrong approach points at a plan step before the code. Use the signal `rework`.

Each finding also names the delivery stage where it costs time today:

| Stage | Shows up as |
|---|---|
| `plan` | Review questioning the approach, a PR rewritten or closed after its direction changed, open questions left in a design doc |
| `build` | Large pull requests, agent-assisted PRs reworked because the agent assumed wrong, conventions missed while writing |
| `review` | Waits for review, one reviewer carrying the load, the same request on PR after PR |
| `test` | CI failing for causes a local check would catch, flaky checks, slow feedback |
| `release` | Reverts and hotfixes |
| `learn` | Bug issues, incidents, no way to tell whether a change did what it was for |

Before reporting a finding, check in one shell command that it is not already tracked: `gh issue list --repo {{REPO}} --state open --search "<two or three keywords>"`. If an open issue covers it, report it anyway and name the issue on the `Tracked:` line.

Report at most 4 findings in under 900 words; drop a finding rather than shorten the issue bodies. Write the report to `{{REPORT}}` with a shell heredoc, then reply with only that path; if you cannot write files, reply with the report itself. Use the same shape the batch reviewers use:

```
### <imperative title, under 70 characters>
Signal: review wait | CI friction | escaped defect | batch size | rework
Stage: plan | build | review | test | release | learn
Fix: lint rule | CI change | test | agent instructions | PR template | docs | process
Effort: small (half a day or less) | medium (one to three days) | large (a week or more)
Target: <file path in the repo, or the workflow and job>
Comments: none
CI runs: <every failed run id that shows it, comma-separated, or none>
PRs: <for review wait or escaped defects, the PR numbers it affected, or none>
Tracked: <open issue number and title, or none>
Basis: <one line on why the change relieves it>
Evidence:
> <the number, failing step, or error that shows it> (#<PR> or run <id>)
Issue title: <the GitHub issue's title>
Issue body:
<the issue body, in markdown: no headings. Open with prose on what is happening and what it costs, citing the numbers. Then what to change. Then a bulleted list of considerations if there are any. End with a "**Done is:**" line and a short bulleted list of concrete, checkable completion criteria. Refer to every pull request as its full title and number in one link, `[<title> (#<n>)](<url>)`, from the jq output above. Describe the process, not the people: write "one reviewer" or "the author", and name no reviewer or author.>
```

Do not estimate impact; a script measures it from the run ids and PR numbers you cite.

Then the step you think limits the flow this week, from the numbers, as one line in this shape: `Limiting step: <stage>: <why, with the numbers>`. Then one line for each other stage saying what the numbers show there, or that GitHub does not show it, such as `learn`, where outcomes after release are not in GitHub. Report nothing else.
