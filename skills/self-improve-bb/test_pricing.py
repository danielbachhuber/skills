import os
import sqlite3
import tempfile
import unittest

from price_findings import price_all
from pricing import (
    build_turns,
    describe_cost,
    describe_savings,
    load_turns,
    price,
    requests_from_events,
    turn_lines,
)

MIN = 60_000

# Two turns. Turn 1: 2 calls, 1M tokens, 10 min. Turn 2: 76 calls at about
# 486K of context, 37.1M tokens, 20 min, the example from 2026-11-09.
TURN_ROWS = [(20 * MIN, 40 * MIN), (0, 10 * MIN)]
USAGE_ROWS = [(10 * MIN, 1_000_000), (40 * MIN, 37_100_000)]
CONTEXT_ROWS = [(1 * MIN, 400_000), (2 * MIN, 600_000), (21 * MIN, 486_000)]
CALL_TIMES = [1 * MIN, 2 * MIN] + [20 * MIN + i * 1000 for i in range(76)]


# A background subagent that finishes after turn 1 ends still counts in turn 1.
SUBAGENT_ROWS = [(15 * MIN, 500_000)]


def turns():
    return build_turns(
        TURN_ROWS, USAGE_ROWS, CONTEXT_ROWS, CALL_TIMES, [(0, "Fix the   login"), (19 * MIN, "Now the tests")], SUBAGENT_ROWS
    )


class BuildTurnsTest(unittest.TestCase):
    def test_numbers_turns_in_start_order_with_their_calls_and_tokens(self):
        first, second = turns()
        self.assertEqual(
            first,
            {"n": 1, "startedAt": 0, "ms": 10 * MIN, "tokens": 1_000_000, "calls": 2, "context": 600_000, "subagentTokens": 500_000, "said": "Fix the login"},
        )
        self.assertEqual((second["n"], second["calls"], second["tokens"], second["said"]), (2, 76, 37_100_000, "Now the tests"))

    def test_counts_distinct_context_sizes_as_calls_without_a_transcript(self):
        rows = [(1 * MIN, 400_000), (1 * MIN + 5, 400_000), (2 * MIN, 600_000)]
        [turn, _] = build_turns(TURN_ROWS, USAGE_ROWS, rows)
        self.assertEqual(turn["calls"], 2)

    def test_a_turn_still_running_ends_at_the_next_turn(self):
        [turn, _] = build_turns([(0, None), (20 * MIN, 40 * MIN)], USAGE_ROWS, CONTEXT_ROWS, CALL_TIMES)
        self.assertEqual((turn["ms"], turn["calls"]), (20 * MIN, 2))

    def test_table_lines_cite_turn_numbers(self):
        lines = turn_lines(turns())
        self.assertIn("turn 1: 2 calls, 1M tokens, 10 min, context up to 600K, subagents 500K tokens", lines[1])
        self.assertIn("turn 2: 76 calls, 37.1M tokens, 20 min, context up to 486K", lines[2])
        self.assertEqual(turn_lines([]), [])


class PriceTest(unittest.TestCase):
    def test_removed_calls_are_priced_at_their_turns_tokens_per_call(self):
        # A script replaces 6 calls with 1 in turn 2: 5 of 76 calls.
        cost, savings, problems = price([{"threadId": "thr_a", "turn": 2, "calls": 6, "removed": 5}], {"thr_a": turns()})
        self.assertEqual(problems, [])
        self.assertEqual(cost, {"tokens": round(37_100_000 * 6 / 76), "ms": round(20 * MIN * 6 / 76), "threads": 1})
        self.assertEqual(savings, {"tokens": round(37_100_000 * 5 / 76), "ms": round(20 * MIN * 5 / 76)})

    def test_a_whole_turn_or_thread_by_default(self):
        cost, savings, _ = price([{"threadId": "thr_a", "turn": 1}, {"threadId": "thr_b"}], {"thr_a": turns(), "thr_b": turns()})
        # A whole turn includes the subagents it started.
        self.assertEqual(cost["tokens"], 1_500_000 + 38_600_000)
        self.assertEqual(cost["threads"], 2)
        self.assertEqual(savings["tokens"], cost["tokens"])

    def test_counts_are_capped_at_what_the_turn_had(self):
        cost, savings, _ = price([{"threadId": "thr_a", "turn": 1, "calls": 9, "removed": 12}], {"thr_a": turns()})
        self.assertEqual((cost["tokens"], savings["tokens"]), (1_500_000, 1_500_000))

    def test_some_of_a_turns_calls_leave_out_its_subagents(self):
        cost, _, _ = price([{"threadId": "thr_a", "turn": 1, "calls": 1}], {"thr_a": turns()})
        self.assertEqual(cost["tokens"], 500_000)

    def test_reports_turns_it_cannot_find(self):
        cost, _, problems = price([{"threadId": "thr_a", "turn": 9}, {"threadId": "thr_z"}], {"thr_a": turns()})
        self.assertEqual(problems, ["thr_a: no data for turn 9", "thr_z: no data for any turn"])
        self.assertEqual(cost["threads"], 0)

    def test_describes_the_numbers_for_a_card(self):
        self.assertEqual(describe_cost({"tokens": 18_400_000, "ms": 42 * MIN, "threads": 6}), "18.4M tokens, 42 min across 6 threads")
        self.assertEqual(describe_cost({"tokens": 950, "ms": 30_000, "threads": 1}), "950 tokens, 30s across 1 thread")
        self.assertEqual(describe_savings({"tokens": 12_000_000, "ms": 90 * MIN}), "about 12M tokens, 1h 30m")


class RequestsTest(unittest.TestCase):
    def test_reads_the_text_that_started_each_turn(self):
        events = [
            {"type": "client/turn/requested", "createdAt": 5, "data": {"input": [{"type": "text", "text": "Hi"}]}},
            {"type": "turn/started", "createdAt": 6, "data": {}},
        ]
        self.assertEqual(requests_from_events(events), [(5, "Hi")])


class LoadTurnsTest(unittest.TestCase):
    def test_reads_the_tokenomics_tables(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "data.db")
            conn = sqlite3.connect(path)
            conn.executescript(
                """
                create table turn_times (thread_id, turn_id, started_at, completed_at);
                create table usage (thread_id, created_at, input, cache_read, output);
                create table context (thread_id, created_at, used_tokens);
                create table threads (thread_id, session_id);
                create table subagent_calls (thread_id, created_at, input, cache_read, output);
                insert into subagent_calls values ('thr_a', 120, 0, 50, 0);
                insert into turn_times values ('thr_a', 't1', 0, 100);
                insert into usage values ('thr_a', 100, 10, 980, 10);
                insert into context values ('thr_a', 50, 400), ('thr_a', 60, 600);
                insert into threads values ('thr_a', null);
                """
            )
            conn.commit()
            conn.close()
            [turn] = load_turns("thr_a", db=path)
        self.assertEqual((turn["tokens"], turn["calls"], turn["context"], turn["subagentTokens"]), (1000, 2, 600, 50))


class PriceAllTest(unittest.TestCase):
    def test_fills_in_both_fields_and_keeps_the_basis(self):
        findings = {
            "findings": [
                {
                    "title": "Script the PR lookup",
                    "removes": [{"threadId": "thr_a", "turn": 2, "calls": 6, "removed": 5}],
                    "estimatedSavings": {"basis": "the script replaces 6 calls with 1"},
                },
                {"title": "Say it plainly"},
            ]
        }
        lines = price_all(findings, load=lambda _: turns())
        first, second = findings["findings"]
        self.assertEqual(first["totalCost"]["threads"], 1)
        self.assertEqual(first["estimatedSavings"]["basis"], "the script replaces 6 calls with 1")
        self.assertEqual(first["estimatedSavings"]["tokens"], round(37_100_000 * 5 / 76))
        self.assertIsNone(second["totalCost"])
        self.assertIsNone(second["estimatedSavings"])
        self.assertEqual(lines[1], "2. Say it plainly: unpriced, no removes")


if __name__ == "__main__":
    unittest.main()
