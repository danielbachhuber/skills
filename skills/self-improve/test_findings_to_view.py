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
        self.assertEqual(card["title"], "1. Link drafts with absolute paths")
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

    def test_observations_become_a_section_without_buttons(self):
        seen = to_view(FINDINGS)["sections"][1]
        self.assertEqual(seen["title"], "Seen once")
        self.assertEqual(seen["items"][0], {"id": "seen-1", "title": "A flaky API", "summary": "`thr_ccc3`"})

    def test_no_observations_section_when_there_are_none(self):
        self.assertEqual(len(to_view({**FINDINGS, "observations": []})["sections"]), 1)


if __name__ == "__main__":
    unittest.main()
