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

When the PR closes an issue, the first line of the body is `Fixes <issue URL>`.

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

The section tells a reviewer how to see the change work. Do not list the CI checks every
PR runs, such as typecheck, lint, and unit tests. A single "CI covers it" clause is enough.

When the repo has end-to-end tests and the change affects behavior a user can see or
trigger, split the section in two, in this order:

1. **Manual steps.** What a reviewer does to see the change work, one action per step.
   Cover everything the specs do not, and flag each gap plainly rather than leaving it for
   the reviewer to notice.
2. **Covered by E2E.** The user behaviors or journeys the specs assert, each naming the
   spec that covers it. Go into some detail on what the spec actually checks: the states
   it sets up, the actions it takes, and what it asserts at the end. "Covered by
   `comments.spec.ts`" alone tells the reviewer nothing about what they can skip.

Use ordered lists for steps a reviewer follows in order, and bulleted lists for things that
have no order, such as the behaviors a spec asserts.

If no spec covers the change, the second part says so in one line. That gap is worth
knowing about. If CI will not run the suite on this PR, because it is a draft or the
workflow's path filters skip it, say that too.

Leave end-to-end tests out entirely when no user journey can reach the change, such as
documentation, CI configuration, or a refactor with no behavior change. Then the section is
just the manual steps, or a command.

Manual steps say where to go, what to do, and what the reviewer should see. For behavior
that does not happen on its own, such as a notification, an email, or an error state, give
the steps that trigger it.

When the repo deploys preview environments, link the steps to the preview URLs once the
preview exists. Until then, write the paths.

A dependency bump with no code change gets a short section: "Existing tests pass", expanded
to say which checks exercise the dependency.
