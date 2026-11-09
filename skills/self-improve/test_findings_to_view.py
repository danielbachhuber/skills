import unittest

from findings_to_view import to_view

FINDINGS = {
    "threadCount": 12,
    "findings": [
        {
            "title": "Link drafts with absolute paths",
            "signal": "correction overhead",
            "target": "/home/octocat/INSTRUCTIONS.md",
            "project": "widgets",
            "threads": ["thr_aaa1", "thr_bbb2", "thr_aaa1"],
            "cost": "2 extra turns",
            "evidence": [
                {"quote": "Give me   the path", "threadId": "thr_aaa1", "speaker": "User"},
                {"quote": "Where is it?", "threadId": "thr_bbb2", "speaker": "User"},
            ],
            "task": "Add the rule.",
            "removes": [{"threadId": "thr_aaa1", "turn": 2}],
            "totalCost": {"tokens": 18_400_000, "ms": 42 * 60_000, "threads": 6},
            "estimatedSavings": {"tokens": 12_000_000, "ms": 30 * 60_000, "basis": "the rule removes 2 turns per thread"},
        }
    ],
    "observations": [{"text": "A flaky API", "threads": ["thr_ccc3"]}],
}


class FindingsToViewTest(unittest.TestCase):
    def test_one_card_per_finding_with_a_thread_button(self):
        view = to_view(FINDINGS, "2026-01-05")
        self.assertEqual(view["title"], "Self-improve review, 2026-01-05")
        card = view["sections"][0]["items"][0]
        self.assertEqual(card["id"], "finding-1")
        self.assertEqual(card["title"], "Link drafts with absolute paths")
        self.assertEqual([b["label"] for b in card["badges"]], ["correction overhead", "widgets", "2 threads"])
        self.assertIn("> Give me the path", card["summary"])
        [action] = card["actions"]
        self.assertEqual(action["type"], "thread")
        self.assertEqual(action["title"], "Improve: Link drafts with absolute paths")
        self.assertEqual(action["prompt"], "{draft}\n\nFound in: @thread:thr_aaa1 @thread:thr_bbb2")
        self.assertEqual(card["draft"], "Add the rule.")
        self.assertEqual(card["draftLabel"], "Task for the new thread")

    def test_details_hold_the_rest_of_the_evidence_but_not_the_task(self):
        details = to_view(FINDINGS)["sections"][0]["items"][0]["details"]
        # The task is the item's draft instead, shown once in its own box.
        self.assertNotIn("Add the rule.", details)
        self.assertIn("> Where is it?", details)
        self.assertIn("**Found in:** `thr_aaa1`, `thr_bbb2`", details)
        self.assertNotIn("@thread:", details)

    def test_summary_starts_with_the_cost_and_savings_line(self):
        summary = to_view(FINDINGS)["sections"][0]["items"][0]["summary"]
        lines = summary.split("\n")
        self.assertEqual(
            lines[0], "**Cost:** 18.4M tokens, 42 min across 6 threads · **Saves:** about 12M tokens, 30 min"
        )
        self.assertIn("**Basis:** the rule removes 2 turns per thread", summary)
        self.assertIn("2 extra turns", summary)

    def test_unpriced_findings_say_so_on_the_row(self):
        finding = {**FINDINGS["findings"][0], "totalCost": None, "estimatedSavings": None}
        summary = to_view({**FINDINGS, "findings": [finding]})["sections"][0]["items"][0]["summary"]
        self.assertTrue(summary.startswith("**Cost:** not priced\n\n2 extra turns"))

    def test_observations_become_a_section_without_buttons(self):
        seen = to_view(FINDINGS)["sections"][1]
        self.assertEqual(seen["title"], "Seen once")
        self.assertEqual(seen["items"][0], {"id": "seen-1", "title": "A flaky API", "summary": "`thr_ccc3`"})

    def test_no_observations_section_when_there_are_none(self):
        self.assertEqual(len(to_view({**FINDINGS, "observations": []})["sections"]), 1)


if __name__ == "__main__":
    unittest.main()
