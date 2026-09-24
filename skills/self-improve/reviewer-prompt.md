# Reviewer prompt

Send this to each reviewer subagent, filling in `{{DIR}}` and `{{BATCH}}`.

---

You are reviewing recent bb agent threads to find changes that would make future threads faster and need less correction. "The user" below is the person who ran those threads. Read the transcripts listed in batch {{BATCH}} of `{{DIR}}/index.tsv`. Each transcript is `{{DIR}}/<thread-id>.txt`, and `{{DIR}}/<thread-id>.tools.txt` beside it has the thread's token usage, tool-call counts, failed and repeated commands, largest outputs, slowest calls, and files read three or more times. The minimal transcript hides tool calls and prints summary lines like "Ran 12 tools, explored 3 files". When a finding depends on what the agent actually ran, read the detail with `bb thread log <id> --format verbose --all`.

Do not spawn threads, message threads, or change files.

Read every thread in the batch for these signals:

1. **Correction overhead.** The user restated a request, corrected a wrong assumption, pointed to a file or project the agent should have found, or undid the agent's work.
2. **Excess steps.** The thread took many more turns or tool calls than the task needed: repeated failed commands, searching the wrong place, rediscovering facts a skill or instruction could have stated.
3. **Non-chat UX.** The user waited on a chat round trip for something a panel, form, button, table view, or script would have shown faster, such as reading a status list, picking from options, or typing the same reply every time.
4. **Breakage.** Errors, lost work, or confusing behavior in bb itself, a bb plugin, a skill, or project code.
5. **Tool and token cost.** Work that burned tokens or tool calls for no result: commands that failed and were retried, the same command run over and over, outputs of tens of kilobytes read into context when a filter would do, files read again and again, slow commands run where a faster one exists, a thread whose context kept growing because nothing was delegated to a subagent. Start from the `.tools.txt` file, and read the verbose log for the calls it points at before naming a cause.

For each signal, work out where the fix belongs, and find the real file before you name it:

| Target | How to find it |
|---|---|
| A skill | `ls -la ~/.claude/skills` shows where each skill's directory really lives. A skill a plugin ships lives in that plugin's `skills/` directory. |
| Global agent instructions | `readlink -f ~/.claude/CLAUDE.md` |
| A bb plugin | `bb plugin list`, then the plugin's source directory |
| bb itself | the bb source checkout, if `bb project list` has one |
| Project code or project instructions | the repo's path from `bb project list`, and its `AGENTS.md` or `CLAUDE.md` |

The `Project` field is the bb project the fix gets made in, named exactly as `bb project list` prints it, or `personal` when no project holds the file.

When the same problem can be fixed in more than one target, for example a skill that gives bad advice and bb code that does not guard against it, report one finding per target.

Before reporting a finding, open the file you would change and confirm the problem is still there. Drop the finding if it has already been fixed.

Report at most 8 findings, the ones that cost the user the most. Your final message is the report, with each finding in this shape:

```
### <imperative title, under 70 characters>
Signal: correction overhead | excess steps | non-chat UX | breakage | tool and token cost
Target: <file path or component>
Project: <bb project name>
Threads: <every thread ID where it happened>
Cost: <what it cost, e.g. "3 extra turns", "20 minutes of rework", "work lost", "40 failed calls", "about 2M tokens">
Evidence:
> <verbatim quote from the transcript, or a command line or output from the tool log> (<thread-id>, <User, Assistant, or System for tool calls and their output>)
Task: <the prompt for a new agent thread: what to change, in which files, and how to tell it is done. It must make sense to an agent that has never seen these transcripts, so state the facts instead of pointing at the thread.>
```

Then list what you saw once and could not tie to a fix, one line each with its thread ID. Then, for each of the five signals with no findings, write one line saying you found none. Report nothing else.
