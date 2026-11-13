import unittest

from findings_to_view import to_view
from measure_findings import describe, index, measure, rank_key

DATA = {
    "repo": "octo/widgets",
    "days": 7,
    "prs": [
        {
            "number": 1, "author": "ana", "mergedAt": "2026-11-10T00:00:00Z", "hoursWaiting": 168, "hoursWaitingTotal": 840,
            "commitTimes": ["2026-11-09T10:00:00+00:00"],
            "comments": [
                {"id": 11, "author": "ben", "byAuthor": False, "at": "2026-11-09T09:00:00Z"},
                {"id": 12, "author": "ana", "byAuthor": True, "at": "2026-11-09T09:30:00Z"},
            ],
        },
        {
            "number": 2, "author": "cy", "mergedAt": None, "hoursWaiting": 50,
            "commitTimes": ["2026-11-08T10:00:00+00:00"],
            "comments": [{"id": 21, "author": "dee", "byAuthor": False, "at": "2026-11-09T09:00:00Z"}],
        },
    ],
    "ci": {"failures": [{"id": 900, "pr": 2, "minutes": 12}, {"id": 901, "pr": 2, "minutes": 8}]},
}


def finding(**kw):
    base = {
        "title": "Format before push", "signal": "CI friction", "fix": "CI change", "target": ".husky/pre-commit",
        "refs": {}, "basis": "the hook formats files", "evidence": [
            {"quote": "Formatting  failed", "pr": 2, "url": "https://github.com/octo/widgets/pull/2", "author": "dee"}],
        "issue": {"title": "Format staged files", "body": "Body.\n\n**Done is:**\n- it runs"},
    }
    base.update(kw)
    return base


class MeasureTest(unittest.TestCase):
    def setUp(self):
        self.comments, self.runs, self.prs = index(DATA)

    def test_counts_comments_runs_and_rework(self):
        impact, warnings = measure(finding(refs={"comments": [11, 12, 21], "ciRuns": [900, 901]}),
                                   self.comments, self.runs, self.prs)
        self.assertEqual(warnings, [])
        # The author's own reply is not review feedback.
        self.assertEqual(impact["comments"], 2)
        self.assertEqual(impact["reviewers"], 2)
        self.assertEqual(impact["prs"], 2)
        self.assertEqual(impact["authors"], 2)
        # PR 1 got a commit after the comment; PR 2's last commit came before it.
        self.assertEqual(impact["reworkPrs"], 1)
        self.assertEqual((impact["ciFailures"], impact["ciMinutes"]), (2, 20))
        self.assertTrue(describe(impact, 7).endswith("this week; fixes were pushed after review on 1 of them"))
        self.assertEqual(impact["waitingPrs"], 0)

    def test_waiting_counts_prs_not_summed_hours(self):
        impact, _ = measure(finding(signal="review wait", refs={"prs": [1, 2]}), self.comments, self.runs, self.prs)
        self.assertEqual((impact["waitingPrs"], impact["wholeWindow"], impact["longestWaitHours"]), (2, 1, 840))
        self.assertIn("2 PRs waiting for a first review, 1 of them all week, the oldest for 35 days across 2 PRs",
                      describe(impact, 7))

    def test_review_load_is_one_persons_share_of_feedback(self):
        impact, _ = measure(finding(signal="review load", refs={"reviewer": "ben", "prs": [1]}),
                            self.comments, self.runs, self.prs, 7, DATA)
        self.assertEqual((impact["reviewerItems"], impact["reviewerShare"], impact["waitingPrs"]), (1, 50, 0))
        self.assertIn("one reviewer wrote 50% of the review feedback (1 comments and summaries)", describe(impact, 7))

    def test_warns_on_unknown_ids(self):
        _, warnings = measure(finding(refs={"comments": [99], "ciRuns": [5], "prs": [404]}),
                              self.comments, self.runs, self.prs)
        self.assertEqual(warnings, ["comment 99 not found", "CI run 5 not found", "PR #404 not found"])

    def test_concentrated_ci_cost_outranks_a_few_spread_comments(self):
        ci = {"impact": {"prs": 1, "ciFailures": 29, "ciMinutes": 72}}
        spread = {"impact": {"prs": 4, "comments": 6, "reworkPrs": 2}}
        one_off = {"impact": {"prs": 2, "comments": 2}}
        self.assertGreater(rank_key(ci), rank_key(spread))
        self.assertGreater(rank_key(spread), rank_key(one_off))


class ViewTest(unittest.TestCase):
    def view(self, **kw):
        comments, runs, prs = index(DATA)
        f = finding(**kw)
        f["impact"], _ = measure(f, comments, runs, prs)
        f["impactLine"] = describe(f["impact"], 7)
        return to_view({"reviewedCount": 2, "findings": [f], "observations": [{"text": "Once", "prs": [1]}]}, DATA)

    def test_new_finding_offers_draft_issue_with_the_edited_body(self):
        view = self.view(refs={"ciRuns": [900]})
        item = view["sections"][0]["items"][0]
        self.assertTrue(item["summary"].startswith("**Impact:** 1 failed CI run (12 min) across 1 PR"))
        self.assertIn("> Formatting failed\n>\n> dee, [#2](https://github.com/octo/widgets/pull/2)", item["summary"])
        self.assertIn("**Issue:** Format staged files", item["summary"])
        self.assertEqual(item["draftLabel"], "Issue body")
        self.assertEqual(item["draft"], "Body.\n\n**Done is:**\n- it runs")
        action, revise = item["actions"]
        self.assertEqual((action["type"], action["label"]), ("message", "Draft issue"))
        self.assertEqual(revise["label"], "Revise")
        self.assertIn("{note}", revise["text"])
        self.assertIn("{draft}", revise["text"])
        self.assertEqual(item["note"]["label"], "Revise")
        self.assertIn("{draft}", action["text"])
        # Impromptu UI rejects {note} on an item with no note field.
        self.assertNotIn("{note}", action["text"])
        self.assertIn("octo/widgets", action["text"])
        self.assertEqual(view["sections"][1]["items"][0]["summary"], "#1")

    def test_flow_evidence_has_no_author(self):
        item = self.view(evidence=[{"quote": "18.6h median wait", "url": "https://github.com/octo/widgets/pull/1", "pr": 1}])
        self.assertIn("> 18.6h median wait\n>\n> [#1](https://github.com/octo/widgets/pull/1)",
                      item["sections"][0]["items"][0]["summary"])

    def test_drafted_finding_offers_file_issue(self):
        item = self.view(state={"draftPath": "/Users/x/projects/drafts/issue-widgets-format.md"})["sections"][0]["items"][0]
        self.assertEqual(item["status"]["label"], "Draft ready")
        self.assertEqual([a["label"] for a in item["actions"]], ["File issue", "Redraft", "Revise"])
        self.assertIn("(/Users/x/projects/drafts/issue-widgets-format.md)", item["details"])

    def test_filed_finding_is_complete_and_links_the_issue(self):
        item = self.view(state={"issueUrl": "https://github.com/octo/widgets/issues/5"})["sections"][0]["items"][0]
        self.assertEqual(item["status"], {"label": "Filed", "tone": "success", "complete": True})
        self.assertEqual(item["url"], "https://github.com/octo/widgets/issues/5")
        self.assertNotIn("actions", item)
        self.assertNotIn("note", item)


class FeedbackByPersonTest(unittest.TestCase):
    def test_groups_each_persons_feedback_in_the_window_across_prs(self):
        import importlib.util, os
        spec = importlib.util.spec_from_file_location(
            "collect_repo", os.path.join(os.path.dirname(os.path.abspath(__file__)), "collect-repo.py"))
        collect = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(collect)

        def pr(number, author, comments=(), reviews=()):
            return {"number": number, "title": f"PR {number}", "url": f"https://x/{number}", "author": author,
                    "authorIsBot": False, "comments": list(comments), "reviews": list(reviews)}

        def comment(cid, who, in_window=True, by_author=False):
            return {"id": cid, "author": who, "bot": False, "inWindow": in_window, "byAuthor": by_author,
                    "kind": "review", "path": "a.ts", "line": 3, "at": f"2026-11-0{cid % 9 + 1}", "body": "Use a guard"}

        people = collect.feedback_by_person([
            pr(1, "ana", [comment(1, "rob"), comment(2, "ana", by_author=True), comment(3, "rob", in_window=False)]),
            pr(2, "cy", [comment(4, "rob")], [{"id": 50, "author": "rob", "bot": False, "inWindow": True,
                                                "state": "APPROVED", "at": "2026-11-09", "body": "Looks good"}]),
        ])
        self.assertEqual(set(people), {"rob"})
        self.assertEqual({n: len(e["items"]) for n, e in people["rob"]["prs"].items()}, {1: 1, 2: 2})
        text = collect.reviewer_file("rob", people["rob"])
        self.assertIn("# rob: 3 pieces of review feedback on 2 PRs", text)
        self.assertIn("[50] review summary · APPROVED", text)
        self.assertIn("## [PR 1 (#1)](https://x/1) by ana", text)


if __name__ == "__main__":
    unittest.main()
