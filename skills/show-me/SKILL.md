---
name: show-me
description: Use only when the user asks to be shown a pull request visually, such as "show me #6169", "/show-me <PR>", or a request for a visual version, map, or overview page of a PR's changes, whether the PR changes the UI, the server, or both. Not for ordinary code reviews or PR descriptions unless the user asks for the page.
argument-hint: <PR number or URL>
---

# Show me a pull request

Build a private HTML page that shows what a pull request changes, for the user to read
before or during a review. One sentence says what the PR does. Screenshots show what
changed on screen, a diagram shows how the code changed, and each claim sits next to the
lines that prove it. It is not a prettier copy of the diff in file order.

Every PR gets a page, including one that changes only server code. A server-only PR has
no screenshots; diagrams of the request or data flow, tables, and before/after examples do
the showing instead. Never skip the page because nothing on screen changed.

The page is about the PR's changes, not a review of them. Anything that looks wrong goes
to the user in chat as a draft inline review comment (step 7), not onto the page.

The page goes in bb's thread storage and is shown inline. Nothing is committed, posted, or
checked out.

## 1. Fetch

```bash
bash ~/.claude/skills/show-me/fetch-pr.sh <owner/repo> <number> /tmp/show-me/<repo>-<number>
bash ~/.claude/skills/show-me/fetch-visuals.sh <owner/repo> <number> /tmp/show-me/<repo>-<number>
node ~/.claude/skills/show-me/build-page.mjs /tmp/show-me/<repo>-<number> --hunks
```

`fetch-pr.sh` saves `pr.json`, `files.json` (every file, with the old path of each move),
`pr.diff`, `commits.json` (each non-merge commit with its files), and `description.md` (the
PR body). `fetch-visuals.sh` looks in the PR's comments for visual regression reports (an
`index.html` beside a reg-suit `out.json`), downloads the before and after of every
screenshot they flag, and lists them in `visuals.json`. Both need the network, so run them
with the sandbox disabled. `--hunks` lists every
file with its hunks numbered from 0, and marks lockfiles, snapshots, and generated files as
noise.

Do not open `description.md` or read the commit messages yet. The PR title is already in
front of you and hints at the author's framing; that can't be helped. The page's grouping has to
come from the diff, so that comparing it with the author's grouping in step 3 means
something.

Read the diff. Read closely the hunks the change depends on, and skim the mechanical ones:
translation strings, whole files deleted, fixture lists. To check a claim, read files at
the head or base SHA from `pr.json`, including files the PR does not touch, without checking
anything out:

```bash
gh api "repos/<owner>/<repo>/contents/<path>?ref=<sha>" --jq .content | base64 -d | grep -n '<symbol>'
```

To search the whole repo for leftover references, `gh api search/code` indexes only the
default branch, not the PR's head. Search the base with it, then read the files it finds at
the head SHA.

## 2. Write the headline and the grouping

Write one sentence saying what the PR changes, and name its type: `fix`, `feature`, or
`refactor`. If you cannot write the sentence, you do not understand the PR yet. Keep
reading.

The type decides what the diagram contrasts:

| Type | The diagram shows |
| --- | --- |
| `fix` | The broken path before and the corrected path after |
| `feature` | The new flow, with new nodes marked |
| `refactor` | Where each responsibility lived before and lives after, and that the same inputs still give the same outputs |

For server code, pick the form from what changed: a `sequenceDiagram` for a request, job,
or webhook moving between services; an `erDiagram` for a schema change; a
`stateDiagram-v2` for a record's lifecycle; a flowchart for a decision such as a
permission check.

Then group the hunks into concerns by what they are for, and write the titles and the files
for each into `spec.json` (the `concerns` field in step 5's shape).

## 3. Compare with the author's grouping

Now read `description.md` and the commit messages in `commits.json`. The author has a
grouping when the description walks through the change in parts, or when the PR has two or
more commits whose messages each name one part of the change. A single commit, or commits
like "wip" and "fix tests", is no grouping: leave out `comparison` and `author`, and move
on.

When there is one, compare it with yours:

- **On each concern,** write an `author` note: "Matches commit 2.", "Commit 2 covers this
  and the next concern.", or "No commit covers this on its own; it is spread across
  commits 3 and 4." The builder lists, under each concern, the commits that touched its
  files.
- **Where they differ,** decide which is right. Keep your grouping where it better shows
  what the change does, and say why in the note. Change yours only where the author's
  shows you misread the diff, and say that too. Do not change yours just to agree.
- **A mismatch the reviewer should know about,** such as a commit that changes more than
  its message says or a claim in the description the diff does not support, is a draft
  review comment for step 7. It does not go on the page.
- **Commits that undo each other,** such as a move and then its revert, cancel out. Say
  so in the note on the concern they touched, rather than counting them as a part of the
  author's grouping.
- **In `comparison`,** write one or two sentences on how the two groupings line up, such
  as "Five of the six concerns match the author's commits; commit 2 is split here into the
  mode switch and the removed config slots."

The description can also point you at behavior to check for `kept` and `changed`. Each
claim still needs lines from the code, not the description.


## 4. Show what changed on screen

If the PR changes anything a user sees, the page shows it in screenshots, not words. Each
entry in `visuals` is a pair (one frame) or a film strip (one frame per step of a flow):

```json
"visuals": [
  { "title": "The composer in a space with no stored mode",
    "caption": "The AI moderation notice is gone.",
    "source": "E2E visual regression, perspectives/composer-open",
    "crop": [0, 0, 1280, 900],
    "frames": [{ "before": "visuals/e2e-visual-regression/before/perspectives/composer-open.png",
                 "after": "visuals/e2e-visual-regression/after/perspectives/composer-open.png" }] }
]
```

Paths are relative to the work directory. `before` or `after` is `null` for a screen that
exists on only one side. `crop` is `[x, y, width, height]` in the source's pixels, applied
to both sides, for a screenshot that is mostly empty space. The builder resizes and embeds
every image, so the page stays one file.

Get the screenshots in this order:

1. **The PR's visual regression reports,** from `visuals.json`. Read each pair and keep the
   ones that show a change this PR makes, with a caption saying what changed.
2. **A film strip from an E2E test,** for a flow the PR changes: a sequence of screens, such
   as composing, posting, and the modal that follows. Look for a spec that walks the flow,
   by searching the E2E tests for the components, routes, or test IDs the concern touches.
   Then:
   - Ask the user first. E2E suites usually reset test users and write test data on the
     deployment they run against.
   - Run the spec at the PR's head against the PR's preview deploy, and at the base against
     the base's deployment, with tracing on (`--trace on`). The repo's E2E docs say how to
     point the suite at a deployment. Run each side from a temporary worktree at its SHA,
     `git worktree add /tmp/show-me/wt-<side> <sha>`, never the user's own checkout, and
     remove the worktrees afterwards.
   - Pull a frame per step out of each trace, then pair the frames by step:

     ```bash
     node ~/.claude/skills/show-me/trace-frames.mjs <trace.zip> /tmp/show-me/<repo>-<number>/visuals/strip-before --match 'goto|click|fill'
     ```
3. **Nothing on screen changed,** as in a server-only PR. Leave out `visuals` and carry on:
   the diagrams, examples, and tables in step 5 show the change.

A table that describes what a screen shows in words is a sign a screenshot is missing.

## 5. Write the rest of `spec.json`

`/tmp/show-me/<repo>-<number>/spec.json` holds only the judgment. The builder makes the
header, the file map, and the diff rendering itself:

```json
{
  "headline": "The composer reads the moderation mode from the space instead of from feature flags.",
  "type": "refactor",
  "summary": "Optional. One to three sentences of context.",
  "diagrams": [
    { "title": "Where the mode comes from", "caption": "Optional.",
      "mermaid": "flowchart LR\n  before[\"feature flags\"] --> composer" },
    { "title": "Composer call tree", "tree": " PostComposer()\n-  useFeatureFlags()\n+  useSpaceModerationMode()" }
  ],
  "kept": [
    { "claim": "The post button reads \"Submit\" in both manual modes.",
      "evidence": [{ "path": "client/component/comment.tsx", "line": 212 }] }
  ],
  "changed": [
    { "claim": "The client default `ai_moderation: true` is gone.",
      "evidence": [{ "path": "client/util/features.ts", "line": 40, "side": "old" }] }
  ],
  "tables": [
    { "title": "Where each mode's settings come from", "caption": "Optional.",
      "columns": ["Mode", "Read from", "Server enforces"],
      "rows": [["AI", "feature flag", "yes"],
               ["None stored", { "text": "nothing (was: client default)", "changed": true }, "no"]] }
  ],
  "examples": [
    { "title": "`settings.get` for a space with no stored mode",
      "caption": "Optional.", "source": "server/orpc/routers/settings.test.ts",
      "before": "{ \"moderationMode\": null, \"ai_moderation\": true }",
      "after": "{ \"moderationMode\": null }" }
  ],
  "trivial": [
    { "title": "Translation strings: drop the `question.moderation_*` keys",
      "files": ["packages/shared/src/translations/humantranslations/ui_human_fr-FR.json"] }
  ],
  "unverified": ["Tests and E2E were not run."],
  "comparison": "How your grouping lines up with the author's. Leave out when there is none.",
  "concerns": [
    { "title": "Read the mode from the space",
      "note": "What these hunks do, and why they belong together.",
      "author": "Matches the first half of commit 2.",
      "files": ["client/structure/question/moderation/mode-banners.tsx",
                { "path": "client/component/comment.tsx", "hunks": [0, 2] }] }
  ]
}
```

- **Diagrams.** One or two, for the change the headline names, not the whole system.
  Load the `show-dont-tell` skill to pick the form: a flowchart, a `diff` text tree for a
  call tree, or a sequence diagram. Quote every Mermaid label that holds `(`, `)`, `[`,
  `]`, `:`, or `#`, as in `a["useSettings()"]`, and never use `end` as a node ID.
  - For before and after side by side, use `flowchart LR` with two subgraphs, each set to
    `direction TB`, joined by an invisible link: `before ~~~ after`. `flowchart TB` stacks
    them or puts After first.
  - If the diagram is too small to read in `.narrow.png`, cut nodes rather than shrinking
    labels. A diagram with more than about eight nodes a side is showing too much.
- **Tables.** For behavior that varies by case, such as by mode, role, or state, and that a
  screenshot cannot show, a table with a row per case beats a list. Mark the cells the PR
  changes with `"changed": true`. What a screen shows belongs in `visuals`.
- **Examples.** When the change is to the shape of data, such as what a function sends,
  returns, or stores, lead with an example of that data and leave out the diagram. A
  flowchart of "writes, then update, then accepted" has nearly the same boxes on both
  sides; the payload itself shows the difference.

  An example is the same input before and after, side by side: a request and its response,
  a stored record before and after a migration, a job's log line, a command's output. They
  are the server-side counterpart of a screenshot. Take them from the PR where you can: a
  test's input and expected output, a fixture, a documented payload. If you write one
  yourself, say so in the caption and keep it true to the code at each SHA. `before` or
  `after` is `null` for something new or removed.
- **Kept and changed.** Each item is one behavior, with the lines that show it.
  - `line` is the line number in the file at the head SHA, or at the base SHA with
    `"side": "old"` for code the PR removed. Add `"end"` to link a range. Evidence can be
    any file in the repo, not only files the PR changes.
  - A claim about removed code links the old side. Link the new side too when it shows
    where that behavior went.
  - Refactors are where behavior changes by accident, so an item goes under `kept` only
    after you read both versions of the code. Mark anything you have not confirmed with
    `"inferred": true`.
- **Concerns.** Group hunks by what they are for, not by folder, and put the most important
  concern first; it is the one that opens by default.
  - A file that serves two purposes is split by hunk number, from `--hunks`.
  - A snapshot or fixture that shows the change can go in a concern like any other file.
    Otherwise noise files collect in their own collapsed group.
  - Every non-noise hunk belongs to a concern. The builder warns about any that do not and
    puts them under "Not grouped". Incidental changes, such as translation strings or a
    doc tweak, get their own small concern rather than being left there.
- **Routine changes.** The file map puts files with meaningful changes first, grouped by
  folder, and collapses the rest into one row per kind of routine change. The builder finds
  files whose changes are all imports or all comments. Name the other kinds in `trivial`,
  each with its files: translation strings, fixtures dropping a deleted flag, READMEs
  following a move. A file with even one meaningful change stays out of `trivial`.
- **Unverified.** What you did not check: tests not run, behavior inferred from reading.

## 6. Build and check

```bash
node ~/.claude/skills/show-me/build-page.mjs /tmp/show-me/<repo>-<number>
node ~/.claude/skills/show-me/check-page.mjs /tmp/show-me/<repo>-<number>/show-me.html
```

Fix every builder warning and every problem the check reports. The check is the gate for
the page. While drafting a diagram, `render-mermaid.mjs` from the `show-dont-tell` skill
renders it on its own, which is quicker than rebuilding the page each time.

The check needs the network for the Mermaid and `@pierre/diffs` CDN imports, so run it with
the sandbox disabled. It saves screenshots of the page as a reader first sees it, beside the page: `.desktop.png`,
`.desktop-dark.png`, and `.narrow.png`. Read the desktop and narrow ones. A page that loads
without errors can still have a diagram too small to read or a claim in the wrong column.

## 7. Show it

```bash
mkdir -p "$BB_THREAD_STORAGE/show-me"
cp /tmp/show-me/<repo>-<number>/show-me.html "$BB_THREAD_STORAGE/show-me/<repo>-<number>.html"
```

Open the message with the preview, on its own line, then the headline, then a link to open
the page full size by its absolute path:

::inline-vis{source="thread-storage" file="show-me/<repo>-<number>.html" height="1200"}

The directive must not sit inside a code block, or it shows as text. Outside bb, there is
no preview: link the file by absolute path instead.

After the link, list anything you noticed that a reviewer would raise, as draft inline
review comments: the file, the line at the head SHA, and the comment text. A stale
reference the PR left behind, a commit message that does not match its diff, or a test that
was dropped without a replacement all go here. Post nothing; the user decides which go into
the review.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Concerns named after folders, or the diff in file order | Group by purpose. A reader should be able to review one concern at a time. |
| Reading the description before grouping | The grouping then echoes the author's, and the comparison shows nothing. Group from the diff, then read `description.md`. |
| Changing your grouping to match the author's | Keep yours where it shows the change better, and note the difference. |
| A claim under `kept` from reading only the new code | Read the old code too, or mark it `"inferred": true`. |
| A diagram of the whole system | Draw only the slice the headline is about. |
| Leaving files under "Not grouped" | Give incidental changes their own small concern. |
| Evidence links to a line number taken from a hunk header | Hunk headers give where a hunk starts, not the claim's line. Find the line with `gh api .../contents?ref=<sha>`. |
| Reporting the page before looking at the screenshots | Read `.desktop.png` and `.narrow.png` first. |
| A before/after diagram whose two sides look alike | The diagram is not showing the change. Replace it with an example of the data on each side. |
| Skipping the page because the PR is server-only | Every PR gets a page. Use a sequence diagram, examples, and tables where screenshots would go. |
| Review findings on the page | The page shows the change. Findings go in chat as draft inline review comments. |
| A table describing what each screen shows | Screenshots of those screens, from the visual regression reports or an E2E film strip. |
| Running an E2E suite against a deployment without asking | It resets test users and writes data there. Ask first. |
| Writing the page into the repo, or posting it | It goes in thread storage. It is the user's to share. |
