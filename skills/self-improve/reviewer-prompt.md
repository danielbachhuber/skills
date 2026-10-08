# Reviewer prompt

Send this to each reviewer subagent, filling in `{{DIR}}` and `{{BATCH}}`, and replacing `{{THREADS}}` with the contents of `{{DIR}}/batch-{{BATCH}}.md`.

---

You are reviewing recent bb agent threads to find changes that would make future threads faster and need less correction. "The user" below is the person who ran those threads. Your batch is these threads, each with the numbers it was picked by:

{{THREADS}}

Start from those numbers: a thread with many user messages points to correction overhead, high tokens or peak context with no subagents points to tool and token cost, and long turn times or time waiting on the user point to excess steps or non-chat UX.

Each thread has a trimmed transcript at `{{DIR}}/<thread-id>.txt`: the user's messages, the assistant reply before each, the final reply, and the command lines flagged as failed, repeated, large, or slow. `[… n sections omitted …]` marks the tool calls and replies cut between them. `{{DIR}}/<thread-id>.tools.txt` beside it lists the thread's failed and repeated commands, largest outputs, slowest calls, and files read three or more times.

Do not spawn threads, message threads, or change files.

**Keep your context small.** Every tool call re-sends everything you have read so far, so read with the shell and filter, never the `Read` tool on a whole transcript:

- `cat {{DIR}}/<id>.tools.txt` for each thread first; they are short.
- `grep -n -A3 '^── User' {{DIR}}/<id>.txt` to see what the user said, and `head -c 6000` or `sed -n 'a,bp'` for the stretch around a message that looks like a correction.
- Note candidate findings as you go, then confirm the top 5 in one shell command that runs `grep -n` against each target file, for example `grep -n 'absolute path' /path/to/SKILL.md; grep -n 'jq' /path/to/other.md`.
- Use `bb thread log <id> --format verbose --all` at most 3 times in total, and pipe it through `grep` or `sed -n` to the calls you need.
- Stop after 20 tool calls, and report what you have. If you stop before reading every thread, say so on the first line of your report, as `Hit the call limit; did not read: <thread IDs>`.

Look for these signals:

1. **Correction overhead.** The user restated a request, corrected a wrong assumption, pointed to a file or project the agent should have found, or undid the agent's work.
2. **Excess steps.** The thread took many more turns or tool calls than the task needed: repeated failed commands, searching the wrong place, rediscovering facts a skill or instruction could have stated.
3. **Non-chat UX.** The user waited on a chat round trip for something a panel, form, button, table view, or script would have shown faster, such as reading a status list, picking from options, or typing the same reply every time.
4. **Breakage.** Errors, lost work, or confusing behavior in bb itself, a bb plugin, a skill, or project code.
5. **Tool and token cost.** Work that burned tokens or tool calls for no result: commands that failed and were retried, the same command run over and over, outputs of tens of kilobytes read into context when a filter would do, files read again and again, slow commands run where a faster one exists, a thread whose context kept growing because nothing was delegated to a subagent. Start from the `.tools.txt` file, and check the calls it points at before naming a cause.

For each signal, work out where the fix belongs, and find the real file before you name it. Run the lookups you need together in one shell command:

| Target | How to find it |
|---|---|
| A skill | `ls -la ~/.claude/skills` shows where each skill's directory really lives. A skill a plugin ships lives in that plugin's `skills/` directory. |
| Global agent instructions | `readlink -f ~/.claude/CLAUDE.md` |
| A bb plugin | `bb plugin list`, then the plugin's source directory |
| bb itself | the bb source checkout, if `bb project list` has one |
| Project code or project instructions | the repo's path from `bb project list`, and its `AGENTS.md` or `CLAUDE.md` |

The `Project` field is the bb project the fix gets made in, named exactly as `bb project list` prints it, or `personal` when no project holds the file.

When the same problem can be fixed in more than one target, for example a skill that gives bad advice and bb code that does not guard against it, report one finding per target.

Before reporting a finding, confirm the problem is still in the file you would change, with the one `grep -n` command above. Drop the finding if it has already been fixed.

Report at most 5 findings, the ones that cost the user the most, in under 600 words. Your final message is the report, with each finding in this shape:

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
