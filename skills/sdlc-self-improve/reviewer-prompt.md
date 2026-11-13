# Reviewer prompt

`collect-repo.py` fills this in for each batch as `prompt-<n>.md` in its output directory: `{{DIR}}`, `{{REPO}}`, `{{CHECKOUT}}`, `{{BATCH}}`, `{{REPORT}}`, and `{{PRS}}`, the contents of `batch-<n>.md`.

---

You are reviewing a week of pull requests in the GitHub repo `{{REPO}}` to find changes to how the team builds software that would stop the same feedback, failures, and rework from coming back. Authors and reviewers include people and agents. Your batch is these pull requests:

{{PRS}}

Each has a digest at `{{DIR}}/pr-<number>.md`: its timings, this week's reviews, every review and conversation comment with its id in brackets (`[2841234567]`), and its failed CI runs with the failing job, step, and the error it printed. The repo's current files are in `{{CHECKOUT}}`.

Do not change files, comment on GitHub, or open issues.

**Keep your context small.** Read the digests with `cat`, several in one shell command. Read repo files with `grep -n` or `sed -n`, not whole. Stop after 20 tool calls and report what you have; if you did not read every digest, say so on the first line as `Hit the call limit; did not read: #<n>, #<n>`.

Look for these signals:

1. **Repeated review feedback.** The same kind of comment on two or more pull requests, or from two or more reviewers: a naming rule, a missing test, an error-handling pattern, a convention the author did not know. One comment on one PR is an observation, not a finding.
2. **CI friction.** The same job or step failing across pull requests, failures fixed by a formatting or lint-only commit, failures the author could have caught locally before pushing.
3. **Rework.** Rounds of review answered with commits for the same cause, force pushes after review, a PR rewritten after a reviewer questioned its direction, which points at missing upfront guidance.
4. **Escaped defects.** Review that caught a bug a test or check should have caught first.

For each finding, pick the cheapest fix that would have stopped it, in this order of preference, because a deterministic check costs nothing per pull request and a written rule relies on someone reading it:

| Fix | When |
|---|---|
| `lint rule` | A pattern a linter, formatter, or type check can detect |
| `CI change` | A check that should run earlier, faster, locally, or not at all |
| `test` | A behavior that review protected and no test does |
| `agent instructions` | A convention agents keep missing: `AGENTS.md`, `CLAUDE.md`, or a repo skill |
| `PR template` | Something reviewers keep asking authors to state |
| `docs` | A convention people keep missing that no tool can check |
| `process` | Review load, ownership, or sequencing; name the change |

Before reporting a finding, check in one shell command that the problem is still there and not already tracked: `grep -n` the target file in `{{CHECKOUT}}`, and `gh issue list --repo {{REPO}} --state open --search "<two or three keywords>"`. Drop the finding if the fix has landed. If an open issue covers it, report it anyway and name the issue on the `Tracked:` line.

Report at most 5 findings, the ones that recur most, in under 700 words. Write the report to `{{REPORT}}` with a shell heredoc, then reply with only that path; if you cannot write files, reply with the report itself. Each finding takes this shape:

```
### <imperative title, under 70 characters>
Signal: repeated review feedback | CI friction | rework | escaped defect
Fix: lint rule | CI change | test | agent instructions | PR template | docs | process
Target: <file path in the repo, or the workflow and job>
Comments: <every comment id that shows it, comma-separated, or none>
CI runs: <every failed run id that shows it, comma-separated, or none>
PRs: <PR numbers this affected that the ids above do not already cover, or none>
Tracked: <open issue number and title, or none>
Basis: <one line on why the fix stops these, e.g. "an ESLint rule rejects the pattern before review sees it">
Evidence:
> <verbatim comment text or failing step> (#<PR>, <comment or run id>, <author>)
Issue title: <the GitHub issue's title>
Issue body:
<the issue body, in markdown: no headings. Open with prose on what keeps happening and what it costs, citing PR numbers. Then what to change, in which files. Then a bulleted list of considerations if there are any. End with a "**Done is:**" line and a short bulleted list of concrete, checkable completion criteria. It must make sense to someone who has not read these pull requests. Refer to every pull request in the issue body as its full title and number in one link, `[<title> (#<n>)](<url>)`, which the digest's first two lines give you.>
```

Do not count or estimate impact; a script measures it from the ids you cite. Cite every id that shows the problem, since the ids are the measure.

Then list what you saw once and could not tie to a fix, one line each with its PR number. Then, for each of the four signals with no findings, write one line saying you found none. Report nothing else.
