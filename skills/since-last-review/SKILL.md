---
name: since-last-review
description: Use when the user wants to catch up on a pull request they already reviewed, such as "what's changed since my last review", "show me what's new since I reviewed", "catch me up on this PR", or "did they address my comments", after the author pushed more commits or replied.
argument-hint: <PR number or URL> [--since <time or SHA>]
---

# Since last review

Build a page that catches the user up on a pull request they reviewed earlier. The page
shows what changed since that review as real diffs, grouped by what each change does. Each of
the user's comments is quoted beside the change that answers it. The page ends with every
comment's status, so the user can see what's left.

Catching up comes first and the comment statuses second. The page is not a new review:
anything that looks wrong goes to chat as a draft review comment, not onto the page.

Nothing is posted and nothing is checked out. The page goes in bb's thread storage.

## 1. Fetch

```bash
node ~/.claude/skills/since-last-review/fetch-since.mjs <owner/repo> <number> /tmp/since/<repo>-<number>
node ~/.claude/skills/since-last-review/build-page.mjs /tmp/since/<repo>-<number> --outline
```

The fetch needs the network, so run it with the sandbox disabled. It finds the user's latest
review or comment on the PR, works out which commit the branch was on at that time (the
baseline), and saves the diff from there to the head, the commits in between, and the
user's comments with any replies. It prints how it chose the baseline. A review's own
`commit_id` is not used, because a reply in an older thread records that thread's commit.

Pass `--since <ISO time or SHA>` when the user names a different starting point, such as "since
my review on Monday", or when the baseline it printed looks wrong. If the fetch then notes that
the user reviewed or commented again later, the page covers only the named starting point.
Say in chat that there is newer activity of theirs and when it was, so they know the page
leaves it out.

If it prints `Nothing has been pushed since then`, or `0 of the PR's files differ` (a rebase
or a merge of the base branch that changed none of the PR's files), say so in chat, along with any replies
since the review from the outline, and stop. No page is needed.

`--outline` lists every commit, every hunk numbered from 0, and the threads to sort, with
their ids. These threads are the open ones, plus resolved ones that have a reply since the
review or whose lines changed.

## 2. Read the changes

Read `since.diff` closely. Use the outline to keep track of which commit made each change:

- **Commits marked `by YOU`** are the user's own, such as a fix they pushed or a PR of theirs
  merged into this branch. Say "your commit" in the group's note. Never credit it to the
  author.
- **Merges of the base branch** are not the author's work. The outline names the PR files a
  merge changed. Hunks that came from a merge go in their own group, titled after what they
  are, such as "From main: a new ADR index entry". Merges that changed none of the PR's files
  get one line in the header and nothing more.
- **After a rebase** (`rewritten` in `since.json`), the diff compares each PR file directly
  between the two commits. It can include changes from the base branch to those files, so
  check a hunk that doesn't match any commit message before you credit it to the author.
  Commits marked `authored before review` are old work replayed by the rebase.
- To check a claim, read files at the baseline or head SHA without checking anything out:
  `gh api "repos/<owner>/<repo>/contents/<path>?ref=<sha>" --jq .content | base64 -d`.

## 3. Group the changes

Group hunks by what they do, not by commit or by file. A commit that does two things is split
across two groups, and three commits that make one change share a group. Put the change the
user will care about most first.

Each group gets:

- **A title** that says what is different now, in plain words: "Exempt reads now return
  `{ items, total }`", not "Update ADR" or "Commit b518cad".
- **A note** of one or two sentences, when the title alone doesn't explain why. Leave it out
  when the diff is obvious.
- **The comments it answers**, by id. A comment answered by this change is quoted above its
  diff.
- **`"show": "summary"`** when the diff is long and mechanical, such as a regenerated file or a
  big move. The note then carries the group, and the diff starts collapsed. The builder also
  collapses any file with more than 80 lines of diff.

Every hunk belongs to a group. A one-line typo fix still gets a small group. When one hunk
mixes two changes, put it in the group for the larger change and name the other change in
that group's note. A hunk can be listed in two groups when both need it to make sense.

## 4. Decide each comment's status

For every thread in the outline, and for any review summary or conversation comment that
asked for something, read the comment, the replies since the review, and the code as it is
now at the head. A reply or a changed line is not proof: check that the current code does
what the comment asked.

| Status | When |
| --- | --- |
| `addressed` | The code now does what the comment asked. A question that asked for no change counts too, once the reply answers it in full. |
| `partly` | Some of it was done. The note says what is missing. |
| `not-addressed` | No change and no reply. The note says so, plus anything that has changed near it. |
| `replied` | The comment asked for a change, or its answer belongs in the code or doc, and the author replied without making one, such as pushback, "will do in a follow-up", or an answer left only in the thread. The note sums up the reply, since what happens next is the user's call. |
| `no-longer-applies` | The code the comment was about is gone, or the PR's scope changed around it. |

A resolved thread is not automatically `addressed`: an author can resolve a thread they
disagree with. Comments that were only praise ("Good explanation") are `addressed` with no
note.

## 5. Write `spec.json` and build

`/tmp/since/<repo>-<number>/spec.json`:

```json
{
  "headline": "The retry loop now backs off exponentially and the timeout moved into config. Your question about idempotency is still open.",
  "groups": [
    { "title": "Retries back off exponentially, capped at 30 seconds",
      "note": "Replaces the fixed one-second delay.",
      "commits": ["a1b2c3d"],
      "files": [{ "path": "server/jobs/retry.ts", "hunks": [0, 2] }],
      "comments": ["c1234567890"] },
    { "title": "From main: a lockfile update",
      "commits": ["e4f5a6b"],
      "files": ["pnpm-lock.yaml"],
      "show": "summary" }
  ],
  "comments": [
    { "id": "c1234567890", "status": "addressed" },
    { "id": "c1234567999", "status": "not-addressed", "note": "No reply. `sendWebhook` can still run twice for one event." }
  ]
}
```
The headline is one or two sentences on what changed and what's left. `files` entries are a
path (every hunk) or `{ "path", "hunks" }`. Commit SHAs can be short.

```bash
node ~/.claude/skills/since-last-review/build-page.mjs /tmp/since/<repo>-<number>
```

Fix every warning. The builder warns about a hunk in no group, a thread with no status, a
status other than `addressed` with no note, or an id that doesn't exist. The builder quotes
comments and renders diffs straight from the fetched data, so never retype either one into
the spec.

Look at the page before showing it:

```bash
node ~/.claude/skills/since-last-review/shoot-page.mjs /tmp/since/<repo>-<number>/since-last-review.html
```

It saves desktop, dark, and narrow screenshots beside the page. Read the desktop and narrow
ones. Check that the groups read in a sensible order and that no group is just
a wall of diff without a title that explains it.

## 6. Show it

```bash
mkdir -p "$BB_THREAD_STORAGE/since-last-review"
cp /tmp/since/<repo>-<number>/since-last-review.html "$BB_THREAD_STORAGE/since-last-review/<repo>-<number>.html"
```

Open the message with the page on its own line:

::inline-vis{source="thread-storage" file="since-last-review/<repo>-<number>.html" height="1200"}

The directive must not be inside a code block. Outside bb, link the file by its absolute
path instead.

After the page, write what's left in a few lines: the comments that are `not-addressed`,
`partly`, or `replied`, each in a phrase. Then add anything you noticed in the new changes
that a reviewer would raise, as draft inline review comments with the file, the line at the
head, and the text. Post nothing.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| A list of commit SHAs with one-line summaries | The user wants the diffs. Group the hunks and let the builder show them. |
| Groups named after commits or files | Name what is different now. |
| Taking a review's `commit_id` as the baseline | Use the baseline `fetch-since.mjs` prints. Override with `--since` only when it is wrong. |
| Saying a merge of main changed none of the PR's files without checking | The outline lists the PR files each merge changed. A merge can add a line to one of them. |
| Marking a resolved thread `addressed` | Check the code at the head. Resolved is the author's opinion. |
| Retyping a comment or a diff into `spec.json` | Refer to it by id or hunk number. The builder quotes it exactly. |
| Review findings on the page | The page shows what changed. Findings go in chat as draft review comments. |
| Crediting the author with base-branch changes after a rebase | Check hunks against the commit messages; label base-branch changes as such. |
| Crediting the author with the user's own commit | Commits marked `by YOU` in the outline are the user's. |
