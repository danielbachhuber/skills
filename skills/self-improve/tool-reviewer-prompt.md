# Tool and token reviewer prompt

Send this to one extra subagent, alongside the batch reviewers, filling in `{{DIR}}`.

---

You are looking for tool-call and token patterns across recent bb agent threads, the ones no reviewer reading a single batch can see. The threads were picked by cost. "The user" below is the person who ran those threads.

Start with `{{DIR}}/tool-summary.md`: the threads that used the most tokens, the commands that fail in the most threads, the most used commands, and the other tools. `{{DIR}}/index.tsv` lists every scored thread with its tokens, tool calls, and failed commands, and `{{DIR}}/<thread-id>.tools.txt` has a selected thread's detail. If `{{DIR}}/slow-commands.json` exists, slow commands are handled separately, so leave them out. If it does not, include them: the `Slowest calls` in each `.tools.txt` show commands that took a minute or more.

For any pattern you report, check one thread it names, and only the calls the pattern is about. Never read a full verbose log: it re-sends every call and output in the thread. Filter the JSON log to the named calls instead, for example the `gh pr` commands that failed:

```bash
bb thread log <id> --json --all | jq -r '.[] | select(.type == "item/completed") | .data.item | select(.type == "commandExecution" and .exitCode != 0 and (.command | test("gh pr"))) | "\(.exitCode) \(.command)\n\((.aggregatedOutput // "")[:300])"'
```

Change the `select` to match the pattern: `.type == "toolCall" and .tool == "ToolSearch"` for a tool, `.type == "fileRead"` and `.path` for a reread file.

Do not spawn threads, message threads, or change files.

Look for:

- **A command that fails in many threads.** Find why: a flag that does not exist, a shell quirk (zsh treats `=` and word splitting differently from bash), a missing file the agent keeps guessing at, a tool that needs setup. The fix is usually a line in a skill or the global instructions, or a wrapper script.
- **A command run constantly that a script or plugin could replace.** Dozens of calls of the same `gh`, `bb`, or `git` sequence per thread is a script waiting to be written, or data a plugin could hand the agent up front.
- **Oversized outputs.** Logs, diffs, or JSON read into context whole when a filter, `--jq`, or `head` would do.
- **Threads that ran long without delegating.** The summary counts subagents per thread and flags big threads that started none. High peak context with many turns means every turn re-reads everything. Check whether the work could have gone to subagents or been split into threads.
- **Tools that churn.** Repeated `ToolSearch`, loading the same skill several times in a thread, or an MCP tool that keeps failing.

Find where each fix belongs the same way the batch reviewers do, in one shell command: `ls -la ~/.claude/skills`, `readlink -f ~/.claude/CLAUDE.md`, `bb plugin list`, and `bb project list`. Confirm the problem is still in each target file with one shell command of `grep -n` calls before reporting it.

Stop after 20 tool calls. Report at most 5 findings, in under 600 words. Your final message is the report, using the finding shape in `reviewer-prompt.md` with `Signal: tool and token cost`. `Cost` gives the numbers: calls, failures, threads, tokens. Evidence quotes a command line or its output, with `System` as the speaker.
