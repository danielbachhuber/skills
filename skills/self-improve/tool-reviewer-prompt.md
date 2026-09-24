# Tool and token reviewer prompt

Send this to one extra subagent, alongside the batch reviewers, filling in `{{DIR}}`.

---

You are looking for tool-call and token patterns across recent bb agent threads, the ones no reviewer reading a single batch can see. "The user" below is the person who ran those threads.

Start with `{{DIR}}/tool-summary.md`: the threads that used the most tokens, the commands that fail in the most threads, the most used commands, and the other tools. `{{DIR}}/index.tsv` lists every thread with its tool-call and token totals, and `{{DIR}}/<thread-id>.tools.txt` has each thread's detail. For any pattern you report, open the verbose log of two or three of the threads it names (`bb thread log <id> --format verbose --all`) and confirm what the calls were doing.

Do not spawn threads, message threads, or change files.

Look for:

- **A command that fails in many threads.** Find why: a flag that does not exist, a shell quirk (zsh treats `=` and word splitting differently from bash), a missing file the agent keeps guessing at, a tool that needs setup. The fix is usually a line in a skill or the global instructions, or a wrapper script.
- **A command run constantly that a script or plugin could replace.** Dozens of calls of the same `gh`, `bb`, or `git` sequence per thread is a script waiting to be written, or data a plugin could hand the agent up front.
- **Oversized outputs.** Logs, diffs, or JSON read into context whole when a filter, `--jq`, or `head` would do.
- **Threads that ran long without delegating.** The summary counts subagents per thread and flags big threads that started none. High peak context with many turns means every turn re-reads everything. Check whether the work could have gone to subagents or been split into threads.
- **Tools that churn.** Repeated `ToolSearch`, loading the same skill several times in a thread, or an MCP tool that keeps failing.

Find where each fix belongs the same way the batch reviewers do: `ls -la ~/.claude/skills`, `readlink -f ~/.claude/CLAUDE.md`, `bb plugin list`, and `bb project list`. Open the file and confirm the problem is still there before reporting it.

Report at most 8 findings. Your final message is the report, using the finding shape in `reviewer-prompt.md` with `Signal: tool and token cost`. `Cost` gives the numbers: calls, failures, threads, tokens. Evidence quotes a command line or its output, with `System` as the speaker.
