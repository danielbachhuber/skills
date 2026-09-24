---
name: self-improve
description: Use when the user asks to review the past week of bb threads for improvements, run a self-improvement or retrospective pass over recent agent work, or find where threads needed too much correction, took too many steps, burned tokens or tool calls, or would have gone faster with a non-chat UI.
---

# Self-improve

## Overview

Read every bb thread from the past week, find the changes that would have made them faster, cheaper, or needed less correction, and let the user pick which to act on. Each one they pick becomes a new thread. A finding is only useful if it names the file to change, quotes the transcript that shows the problem, and still holds against the current code.

## Workflow

1. **Collect transcripts.**
   ```bash
   python3 ~/.claude/skills/self-improve/collect-threads.py --days 7
   ```
   Use the number of days the user or the prompt gives. The last line is the output directory. `index.tsv` there lists each thread with a batch number and its tool-call and token totals. Each thread has a transcript (`<id>.txt`) and a tool and token digest (`<id>.tools.txt`), and `tool-summary.md` has the patterns across all of them. Mention any warning that the thread list did not reach back far enough.

2. **Review in parallel.** In one message, dispatch one subagent per batch with the prompt in `reviewer-prompt.md` (fill in the directory and batch number), plus one more with `tool-reviewer-prompt.md` (fill in the directory), which looks for tool and token patterns across every thread. Keep the transcripts out of your own context. Subagents may not be allowed to write files, so save each returned report yourself as `report-<batch>.md` or `report-tools.md` in the output directory.

3. **Merge.** Combine findings that share a target and a cause, and union their thread IDs. The tool reviewer and a batch reviewer often reach the same fix from different sides; keep one finding with both sets of evidence. Several findings against the same file can become one finding whose task lists each change. A problem seen in several threads outranks a one-off. Rank by recurrence, then cost. Drop findings whose task would repeat an open thread's work (`bb thread list` titles starting with `Improve:`, which is how this skill titles the threads it opens).

4. **Write `findings.json`** in the output directory, in the shape below.

5. **Present.** Check whether the dynamic-ui plugin is available:
   ```bash
   bb dynamic-ui help >/dev/null 2>&1 && echo available
   ```
   **If it is**, turn the findings into a view and publish it from this thread:
   ```bash
   python3 ~/.claude/skills/self-improve/findings_to_view.py <output-dir>/findings.json > <output-dir>/view.json
   bb dynamic-ui publish --file <output-dir>/view.json --key self-improve
   ```
   Each finding becomes a card with its evidence and an **Open thread** button that starts the fix in the finding's project, titled `Improve: <title>`. In chat, say how many threads were read and how many findings there are, name the top five, and point to the side panel. Do not repeat the list or open threads yourself. If `publish` prints a validation error, fix `findings.json` and run both commands again.

   **If it is not**, write the list to `findings.md` in the output directory and show it in chat, numbered, each with title, target, thread count, cost, and one evidence quote, with the one-off observations in a short section at the end. Ask which numbers to open threads for, and wait for the answer. For each chosen finding, write its task followed by a `Found in:` line of `@thread:<id>` mentions to `task-<n>.md`, then:
   ```bash
   bb thread spawn --project <id from bb project list> --title "Improve: <title>" --prompt-file <output-dir>/task-<n>.md
   ```
   Do not pass `--parent-self`. Report each new thread as `@thread:<id>`.

## findings.json

```json
{
  "threadCount": 101,
  "findings": [
    {
      "title": "Link local files with absolute paths",
      "signal": "correction overhead",
      "target": "<absolute path of the file to change>",
      "project": "<bb project name, or personal>",
      "threads": ["thr_abc123", "thr_def456"],
      "cost": "2 extra turns per thread",
      "evidence": [{ "quote": "Give me the full path", "threadId": "thr_abc123", "speaker": "User" }],
      "task": "<the reviewer's task, self-contained, ending with how to tell it is done>"
    }
  ],
  "observations": [{ "text": "Seen once and not tied to a fix", "threads": ["thr_ghi789"] }]
}
```

`signal` is one of `correction overhead`, `excess steps`, `non-chat UX`, `breakage`, `tool and token cost`. `findings` is ranked, first is most important, at most 60. `speaker` is `User`, `Assistant`, or `System`.

## Common mistakes

- **Vague tasks.** "Improve the PR sweep prompt" gives the new thread nothing to act on. The task names files, the change, and how to verify it.
- **Stale findings.** A fix may have landed later in the week. The reviewer checks the current file before reporting.
- **Tasks that point at the transcript.** "See thr_abc for details" makes the new thread re-read the transcript. Put the facts in the task; the source threads are added as a `Found in:` line.
- **A project name bb does not know.** The new thread opens in the project named in `project`, so it has to match `bb project list`, or be `personal`.
- **Blaming tokens on the task.** A thread that used 40M tokens may have needed them. A tool and token finding names the waste: the failed calls, the repeated command, the output nobody needed, the context that grew because nothing was delegated.
- **Skipping the non-chat UX signal.** Ask where the user waited on a chat reply for something a panel, form, or script would have shown at once.
