# Writing the description

Follow the house style in the `## Writing` section of `~/.claude/CLAUDE.md`.

## The structure

Use these sections, in this order, as `##` headings:

1. **Proposed Changes.** What the PR changes and the impact you expect, with the
   before/after screenshots or screencasts.
2. **Approach.** How the change works: the mechanism, and the files or pieces that carry
   it. Enough for a reviewer to know what to look for in the diff, without restating it.
3. **History.** The prior state: how the code behaved before, and the PRs and commits that
   built it.
4. **Decisions.** Each choice, the alternative considered, and why it lost. Out-of-scope
   work and uncertainties go here too when they are about a choice.
5. **Testing Instructions.** See the section at the end of this file.

Omit a section with nothing real to say rather than padding it. A breaking change adds a
Breaking Changes section after Proposed Changes.

Use the repo's structure instead only when step 2 of the skill found a reason to. The
repo's other rules, such as how it wants testing steps written, apply either way. Where
they disagree with these notes, the repo's rules win.

## The title

A Conventional Commits title, `type(scope): subject`. Imperative, no trailing period. A
breaking change gets `!` after the scope, `type(scope)!: subject`, and a section of its own
in the body saying what breaks and what a caller has to change.

## The body

When the PR works on an issue, the first line of the body links it, and the verb says
whether merging the PR finishes the issue:

- `Fixes <issue URL>` when the PR fully resolves the issue, or is the last PR for it.
  GitHub closes the issue on merge.
- `See <issue URL>` when work on the issue remains after this PR: an umbrella issue the PR
  only advances, or a follow-up the description itself defers, such as an out-of-scope
  item under Decisions.

Front-load. A reviewer should be able to stop reading as soon as they have what they need:
the goal, then the approach, then the detail. Put the detail a reviewer opens on demand
inside `<details>` expanders.

Write the opening so a product owner can follow it: what changes for the people using the
product, and the impact you expect. Implementation detail comes after.

When the change responds to a bug or a behavior change somewhere else, link it: the issue
that reported it, and the PR or commit that caused it or fixed it upstream.

When the PR deletes code, say specifically why each deleted piece is safe to remove: what
used to call it, and why nothing does now.

Use the session's own numbers, paths, and PR references. A description that could be pasted
onto a different pull request says nothing about this one.

Give a figure the provenance it needs to be believed, and give it one clause. "Measured from
draft-state timeline events rather than the current draft flag" earns its place; a sentence
reciting sample sizes, API limits and query shape does not.

Never mention a correction to an earlier analysis.

Carry every caveat. If a figure rests on three outlier branches, the description says so
where the figure appears, not in a footnote. If something was estimated rather than
measured, the word "estimated" appears.

Claim only what you verified. Never write that the change fixes, removes, or resolves
something unless it does. If the work is partial, say what is left.

When there are before/after screenshots or screencasts, lay them out as a two-column
markdown table with `Before` and `After` as the headers, one media reference per column, and
a one-line caption row beneath. Never a stack of labelled paragraphs. Save the files in
`~/projects/drafts/pull-request-<slug>-media/` and reference each one by its absolute path,
so the draft's preview in bb renders it: images as
`![alt](/Users/<you>/projects/drafts/pull-request-<slug>-media/name.png)`, videos as
`<video src="/Users/<you>/projects/drafts/pull-request-<slug>-media/name.mp4" controls></video>`.
A `./name.png` reference shows as a broken image in the preview. The local paths get
replaced with uploaded asset URLs when the PR is created or edited. Put the table in
Proposed Changes, or whichever section describes the change, shown by default rather than
inside a `<details>` expander or a trailing section of its own.

Name changed files by their repo-relative path in backticks. Diff links wait until the pull
request number exists.

Prefer prose to bullet fragments for anything explanatory. Reserve bullets for genuine
lists: affected files, alternatives, out-of-scope items.

Say each thing once, in as few words as carry it. The checklist answers are written to be
complete, not to be published: expect to state their facts in a fraction of the words. A
sentence that needs three subordinate clauses is two sentences. Never pad a section to look
substantial.

Scale to the diff. A two-file change gets a short body and no expanders.

The file holds raw markdown, ready to post: no wrapping code fence, no preamble, no title
line, no closing summary.

## Testing instructions

The section tells a reviewer how to see the change work, which of its behaviors tests
check and which they don't, and why the change is tested the way it is. Do not list the CI
checks every PR runs, such as typecheck and lint. A single "CI covers it" clause is enough.

Write it in two parts, in this order. Manual steps always come first, at the top of the
section, even when the tests cover most of the change.

1. **Manual steps.** Start with the line `**Manual testing steps:**`, then an ordered list
   of what a reviewer does to see the change work, one action per step. Cover everything
   the tests do not, and flag each gap plainly rather than leaving it for the reviewer to
   notice.
2. **What the tests cover.** One group per kind of test the change uses, in this order:
   unit and integration, component, visual, end-to-end. Leave out a kind the change
   doesn't use, unless the reason it doesn't is worth stating (see "Not covered" below).
   Each group is a bold label naming the kind, one sentence on why this kind of test fits
   this change, and a two-column table, Behavior and Test. Keep file links out of the
   label and the sentence; the Test column links the file, so a reviewer can see which
   file covers which row.

   | Kind | One Behavior row per |
   |---|---|
   | Unit and integration | Case the test checks, written as the call and its result in inline code, joined by an arrow: `list({ offset: 5 })` of A, B → `{ items: [], total: 2 }`. When it runs through more than the function, such as an API route, a database, or input validation, say so between them: "through the route". |
   | Component | State the test renders or interaction it performs, and what appears on screen, joined by an arrow: 10 tags → input disabled, "10 tags is the limit." |
   | Visual | Component or screen state whose snapshot changes. Embed the snapshot image when the repo stores it, otherwise link it. |
   | End-to-end | Step of the flow, in order and numbered, with what the spec checks at that step. A reviewer reads the steps to know which of their own manual steps the spec already does. |

   Write unit and integration rows as a small code example rather than a description:
   the call with the arguments that matter, a few plain words for the setup when the call
   alone doesn't show it ("of A, B, C", "at 9 tags"), an arrow, and the result the test
   asserts. Take the values from the test, shortened so the row fits on a line or two:
   single letters or short names for seeded records, and only the fields the test checks.
   Bold a refusal or an error. Put the two sides of a limit on neighboring rows so the
   reader sees where the line is.

   Include existing tests the PR doesn't edit that reach the changed code, such as an
   end-to-end spec that opens a picker whose data now comes through a changed hook. Mark
   the file "(unchanged)" in the Test column. When such a test reaches the changed code
   but doesn't check the behavior the change is about, say what it does check, and put
   the behavior itself under "Not covered".

   Only list a behavior as covered after undoing it and watching its test fail, the way
   the `review-code` skill's "What the tests cover" section describes. Say so once, in a
   line above the groups, rather than on each row. A behavior a test runs but doesn't
   assert on goes under "Not covered".

   End with a **Not covered** table of the same shape. Its rows are each behavior no test
   checks, with the manual step that checks it instead or why it doesn't need one, and
   each kind of test the change skips where a reviewer might expect it, with the reason
   tied to this change.

   For a change that adds tags to tasks, capped at 10 per task:

   ```markdown
   **Manual testing steps:**

   1. Run `npm run dev` and open any task.
   2. Add the tags "work", "Home", and "errands". They show as errands, Home, work.
   3. Add tags until the task has 10. The tag input is disabled and reads "10 tags is
      the limit."
   4. With 10 tags on the task, send `POST /api/tasks/:id/tags` directly. It's refused
      with `TAG_LIMIT_REACHED`.

   **What the tests cover**

   Undoing any behavior below makes its test fail.

   **Unit and integration.** The sort and the cap both live in `addTag`, so each case
   runs in milliseconds.

   | Behavior | Test |
   |---|---|
   | `listTags()` of `work, Home, errands` → `errands, Home, work` | [`addTag.test.ts`](link) |
   | `addTag('urgent')` at 9 tags → 10 tags | [`addTag.test.ts`](link) |
   | `addTag('urgent')` at 10 tags → **`TAG_LIMIT_REACHED`** | [`addTag.test.ts`](link) |
   | `addTag('Work')` with `work` → `[work]` | [`addTag.test.ts`](link) |
   | `POST /tasks/1/tags` at 10 tags, through the route → **409** | [`tags.route.test.ts`](link) |

   **Component.** The tag input is the only place the cap shows.

   | Behavior | Test |
   |---|---|
   | 9 tags → input enabled, no message | [`TagInput.test.tsx`](link) |
   | 10 tags → input disabled, "10 tags is the limit." | [`TagInput.test.tsx`](link) |

   **Visual.** The input's look at the limit is new.

   | Behavior | Test |
   |---|---|
   | `TagInput` at the limit: ![TagInput at the limit](link) | [`TagInput.stories.tsx`](link) |
   | `TagList` wrapping a long tag name: ![TagList wrapping a long tag](link) | [`TagInput.stories.tsx`](link) |

   **End-to-end.** Tags are saved through the API, so only a reload shows they persist.

   | Behavior | Test |
   |---|---|
   | 1. Opens a task with no tags | [`tags.spec.ts`](link) |
   | 2. Adds `work` and `Home` from the tag input | [`tags.spec.ts`](link) |
   | 3. Reloads the page, and the task shows `Home`, `work` | [`tags.spec.ts`](link) |
   | 1. Filters the task list by `work`, and only tasks tagged `work` show | [`task-filters.spec.ts`](link) (unchanged) |

   **Not covered**

   | Behavior or kind of test | Instead |
   |---|---|
   | The `TAG_LIMIT_REACHED` error toast | Manual step 4 checks the refusal. |
   | An end-to-end spec for the cap | Reaching it means adding 10 tags in a browser, and the route and component tests check the refusal and the disabled input. |
   ```

Use an ordered list for the manual testing steps, and tables for what the tests cover.

If no test covers the change, part 2 says so in one line. That gap is worth knowing about.
If CI will not run a suite on this PR, because it is a draft or the workflow's path filters
skip it, say that too.

For documentation, CI configuration, or a refactor with no behavior change, there are no
behaviors to list. The section is the manual testing steps or a command, plus one line
on how you know behavior didn't change, such as the existing tests that pass before and
after.

Manual steps say where to go, what to do, and what the reviewer should see. For behavior
that does not happen on its own, such as a notification, an email, or an error state, give
the steps that trigger it.

When the repo deploys preview environments, link the steps to the preview URLs once the
preview exists. Until then, write the paths.

A dependency bump with no code change gets a short section: "Existing tests pass", expanded
to say which checks exercise the dependency.
