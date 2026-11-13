import unittest

from tool_stats import command_prefix, digest, summary, thread_stats


def item(kind, item_id, **fields):
    return {"type": kind, "id": item_id, **fields}


def started(item_id, at):
    return {"type": "item/started", "createdAt": at, "data": {"item": {"id": item_id}}}


def completed(it, at):
    return {"type": "item/completed", "createdAt": at, "data": {"item": it}}


EVENTS = [
    started("c1", 1_000),
    completed(item("commandExecution", "c1", command="git status", exitCode=0, aggregatedOutput="clean"), 2_000),
    started("c2", 3_000),
    completed(item("commandExecution", "c2", command="cd /tmp && npm test", exitCode=1, aggregatedOutput="x" * 20_000), 93_000),
    *[completed(item("commandExecution", f"r{i}", command="git status", exitCode=0), 100_000 + i) for i in range(3)],
    *[completed(item("fileRead", f"f{i}", path="/src/app.ts"), 110_000 + i) for i in range(3)],
    completed(item("toolCall", "t1", tool="ToolSearch", result="ok"), 120_000),
    completed(item("delegation", "d1", label="Survey the repo", background=False, status="completed"), 125_000),
    started("q1", 0),
    completed(item("toolCall", "q1", tool="AskUserQuestion", result="yes"), 600_000),
    {"type": "turn/completed", "createdAt": 130_000},
    {
        "type": "thread/tokenUsage/updated",
        "createdAt": 130_000,
        "data": {"tokenUsage": {"total": {"totalTokens": 2_500_000, "inputTokens": 10, "cachedInputTokens": 2_400_000, "outputTokens": 9_000}}},
    },
    {
        "type": "thread/contextWindowUsage/updated",
        "createdAt": 130_000,
        "data": {"contextWindowUsage": {"usedTokens": 180_000, "modelContextWindow": 1_000_000}},
    },
]


class ToolStatsTest(unittest.TestCase):
    def test_command_prefix_ignores_cd_and_env(self):
        self.assertEqual(command_prefix("cd /repo && gh pr view 12"), "gh pr")
        self.assertEqual(command_prefix("FOO=1 npx tsc --noEmit"), "npx tsc")
        self.assertEqual(command_prefix("/usr/bin/git status"), "git status")
        self.assertEqual(command_prefix("ls -la"), "ls")

    def test_thread_stats(self):
        s = thread_stats(EVENTS)
        self.assertEqual(s["counts"], {"commands": 5, "failed": 1, "reads": 3, "edits": 0, "tools": 2, "delegations": 1})
        self.assertEqual(s["tokens"]["total"], 2_500_000)
        self.assertEqual(s["context"]["peak"], 180_000)
        self.assertEqual(s["failed"], [(1, "cd /tmp && npm test")])
        self.assertEqual(s["repeated"], [(4, "git status")])
        self.assertEqual(s["slowest"], [(90_000, "cd /tmp && npm test")])
        self.assertEqual(s["reread"], [(3, "/src/app.ts")])

    def test_digest_lists_only_what_is_there(self):
        text = digest(thread_stats(EVENTS))
        self.assertIn("Tokens: 2.5M total", text)
        self.assertIn("peak context 180.0k of 1.0M", text)
        self.assertIn("exit 1  cd /tmp && npm test", text)
        self.assertIn("4x  git status", text)
        self.assertIn("20.0kB  cd /tmp && npm test", text)
        self.assertIn("1m 30s  cd /tmp && npm test", text)
        self.assertIn("ToolSearch 1", text)
        self.assertIn("1 subagents", text)

    def test_digest_of_a_thread_with_no_events(self):
        self.assertIn("Tool calls: 0 commands", digest(thread_stats([])))

    def test_summary_flags_big_threads_with_no_subagents(self):
        alone = thread_stats([e for e in EVENTS if (e.get("data") or {}).get("item", {}).get("type") != "delegation"])
        helped = thread_stats(EVENTS)
        alone["tokens"]["total"] = helped["tokens"]["total"] = 6_000_000
        text = summary([("thr_a", "Alone", alone), ("thr_b", "Helped", helped)])
        self.assertIn("0 subagents, peak context 180.0k, no subagents: Alone", text)
        self.assertIn("1 subagents, peak context 180.0k: Helped", text)
        self.assertIn("1 of the 2 threads over 5.0M tokens started no subagent; together they used 6.0M tokens.", text)

    def test_summary_counts_threads_not_calls(self):
        s = thread_stats(EVENTS)
        text = summary([("thr_a", "First", s), ("thr_b", "Second", s)])
        self.assertIn("`npm test`: 2 calls in 2 threads", text)
        self.assertIn("`git status`: 8 calls in 2 threads", text)
        self.assertIn("ToolSearch: 2 calls in 2 threads", text)


if __name__ == "__main__":
    unittest.main()
