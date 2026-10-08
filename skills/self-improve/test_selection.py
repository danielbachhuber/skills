import unittest

from selection import entry_from_stats, estimate, flagged_commands, pack, score, select, signals, trim
from tool_stats import thread_stats


def entry(thread_id, tokens, turns=10, peak=None, p90=None, longest=None, waiting=0, subagent_tokens=0):
    """One `bb tokenomics threads --json` entry. Titles are made up."""
    timed = p90 is not None
    return {
        "threadId": thread_id,
        "title": f"Made-up thread {thread_id}",
        "project": "example",
        "provider": "claude-code",
        "archived": False,
        "turns": turns,
        "tokens": {"input": 0, "cacheRead": 0, "output": 0, "total": tokens},
        "subagents": {"count": 1 if subagent_tokens else 0, "tokens": subagent_tokens},
        "context": {"peak": peak, "latest": peak},
        "turnTime": (
            {"count": turns, "totalMs": 0, "medianMs": 0, "p90Ms": p90, "longestMs": longest}
            if timed
            else {"count": 0, "totalMs": 0, "medianMs": None, "p90Ms": None, "longestMs": None}
        ),
        "waitingOnYou": {"count": 1 if waiting else 0, "ms": waiting},
        "slowestCommands": [],
    }


FIXTURE = [
    entry("thr_big", 90_000_000, turns=40, peak=180_000, p90=600_000, longest=1_800_000, waiting=60_000, subagent_tokens=5_000_000),
    entry("thr_chatty", 8_000_000, turns=55, peak=90_000, p90=120_000, longest=300_000),
    entry("thr_quiet", 2_000_000, turns=3),
    entry("thr_old", 30_000_000, turns=20),  # from before Tokenomics recorded context and turn times
    entry("thr_tiny", 100_000, turns=1),
]


class SignalsTest(unittest.TestCase):
    def test_nulls_count_as_zero(self):
        s = signals(FIXTURE[3])
        self.assertEqual(s["context_peak"], 0)
        self.assertEqual(s["turn_p90"], 0)
        self.assertEqual(s["failed"], 0)
        self.assertEqual(s["tokens"], 30_000_000)

    def test_failed_commands_come_from_the_log(self):
        self.assertEqual(signals(FIXTURE[0], failed=7)["failed"], 7)

    def test_an_entry_with_missing_sections(self):
        s = signals({"threadId": "thr_x", "tokens": None, "context": None})
        self.assertEqual(s["tokens"], 0)
        self.assertEqual(s["context_peak"], 0)


class EntryFromStatsTest(unittest.TestCase):
    def test_builds_an_entry_tokenomics_would_have_given(self):
        events = [
            {"type": "turn/completed", "createdAt": 1},
            {"type": "item/completed", "createdAt": 2, "data": {"item": {"type": "commandExecution", "id": "c1", "command": "npm test", "exitCode": 1}}},
            {"type": "thread/tokenUsage/updated", "createdAt": 3, "data": {"tokenUsage": {"total": {"totalTokens": 4_000_000}}}},
            {"type": "thread/contextWindowUsage/updated", "createdAt": 3, "data": {"contextWindowUsage": {"usedTokens": 120_000}}},
        ]
        thread = {"id": "thr_made_up", "title": None, "titleFallback": "Fix the widget", "archivedAt": None}
        e = entry_from_stats(thread, "example", thread_stats(events))
        self.assertEqual(e["title"], "Fix the widget")
        s = signals(e, failed=1)
        self.assertEqual((s["tokens"], s["turns"], s["context_peak"], s["failed"]), (4_000_000, 1, 120_000, 1))
        self.assertEqual((s["turn_p90"], s["waiting"], s["subagent_tokens"]), (0, 0, 0))


class ScoreTest(unittest.TestCase):
    def test_orders_costly_threads_first(self):
        scores = score([signals(e) for e in FIXTURE])
        order = [e["threadId"] for _, e in sorted(zip(scores, FIXTURE), key=lambda p: p[0], reverse=True)]
        self.assertEqual(order[0], "thr_big")
        self.assertEqual(order[-1], "thr_tiny")
        self.assertLess(order.index("thr_chatty"), order.index("thr_quiet"))

    def test_failed_commands_lift_a_thread(self):
        rows = [signals(FIXTURE[1]), signals(FIXTURE[3])]
        before = score(rows)
        rows[1]["failed"] = 25
        after = score(rows)
        self.assertLess(before[1], before[0])
        self.assertGreater(after[1], before[1])

    def test_a_single_thread_scores_zero(self):
        self.assertEqual(score([signals(FIXTURE[0])]), [0.0])


class SelectTest(unittest.TestCase):
    def test_takes_the_top_n(self):
        ranked = [("thr_a", None), ("thr_b", None), ("thr_c", None)]
        self.assertEqual(select(ranked, 2), {"thr_a", "thr_b"})

    def test_caps_threads_from_one_plugin(self):
        ranked = [
            ("thr_s1", "sweep"),
            ("thr_s2", "sweep"),
            ("thr_s3", "sweep"),
            ("thr_u1", None),
            ("thr_b1", "bumps"),
            ("thr_u2", None),
        ]
        self.assertEqual(select(ranked, 5), {"thr_s1", "thr_s2", "thr_u1", "thr_b1", "thr_u2"})

    def test_user_threads_have_no_cap(self):
        ranked = [(f"thr_{i}", None) for i in range(5)]
        self.assertEqual(len(select(ranked, 5)), 5)


class PackTest(unittest.TestCase):
    def test_fills_earlier_batches_first(self):
        sizes = [("a", 60), ("b", 50), ("c", 30), ("d", 40)]
        self.assertEqual(pack(sizes, 100), {"a": 1, "b": 2, "c": 1, "d": 2})

    def test_an_oversized_thread_gets_its_own_batch(self):
        self.assertEqual(pack([("a", 10), ("big", 150), ("c", 10)], 100), {"a": 1, "big": 2, "c": 1})


class EstimateTest(unittest.TestCase):
    def test_counts_the_tool_reviewer(self):
        self.assertEqual(estimate(4), 10_000_000)


TRANSCRIPT = """\
── User ────────────────────────────────────────────────────
Add a widget to the dashboard.

── Ran 2 commands ──────────────────────────────────────────

── Assistant ───────────────────────────────────────────────
Looking at the dashboard code.

── Explored 3 files ────────────────────────────────────────

── Assistant ───────────────────────────────────────────────
Done. The widget is on the dashboard.

── User ────────────────────────────────────────────────────
It should be on the settings page, not the dashboard.

── Ran npm test -- --run widget
  $ npm test -- --run widget

── Ran git status
  $ git status

── Assistant ───────────────────────────────────────────────
Moved it to settings.

── Stopped manually ────────────────────────────────────────

── Assistant ───────────────────────────────────────────────
Moved it to settings and the tests pass.
"""


class TrimTest(unittest.TestCase):
    def test_keeps_user_messages_and_the_reply_before_each(self):
        text = trim(TRANSCRIPT)
        self.assertIn("Add a widget to the dashboard.", text)
        self.assertIn("Done. The widget is on the dashboard.", text)
        self.assertIn("It should be on the settings page", text)
        self.assertNotIn("Looking at the dashboard code.", text)

    def test_keeps_the_final_reply_and_interruptions(self):
        text = trim(TRANSCRIPT)
        self.assertIn("Moved it to settings and the tests pass.", text)
        self.assertIn("── Stopped manually", text)
        self.assertNotIn("Moved it to settings.\n", text)

    def test_marks_what_was_dropped(self):
        text = trim(TRANSCRIPT)
        self.assertIn("[… 3 sections omitted …]", text)
        self.assertLess(len(text), len(TRANSCRIPT))

    def test_keeps_flagged_commands(self):
        text = trim(TRANSCRIPT, flagged=["npm test -- --run widget"])
        self.assertIn("$ npm test -- --run widget", text)
        self.assertNotIn("$ git status", text)

    def test_a_flagged_tool_name_does_not_match_prose(self):
        text = trim(TRANSCRIPT, flagged=["dashboard"])
        self.assertNotIn("Looking at the dashboard code.", text)

    def test_clips_long_replies_keeping_the_end(self):
        long = "── Assistant ──\n" + "start " + "x" * 5000 + " which option do you want?\n── User ──\nThe second.\n"
        text = trim(long)
        self.assertIn("start", text)
        self.assertIn("which option do you want?", text)
        self.assertIn("characters cut", text)
        self.assertLess(len(text), 1400)

    def test_flagged_commands_from_tool_stats(self):
        events = [
            {"type": "item/completed", "createdAt": 1, "data": {"item": {"type": "commandExecution", "id": "c1", "command": "npm test", "exitCode": 1}}},
            {"type": "item/completed", "createdAt": 2, "data": {"item": {"type": "commandExecution", "id": "c2", "command": "ls", "exitCode": 0}}},
        ]
        self.assertEqual(flagged_commands(thread_stats(events)), ["npm test"])


if __name__ == "__main__":
    unittest.main()
