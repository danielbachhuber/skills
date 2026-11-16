---
name: copy-edit
description: Use when the user asks to copy edit, edit, proofread, fact-check, critique, or give a read to a piece of their own writing, such as a blog post draft, essay, newsletter, or doc, at any stage from rough draft to final, whether they want feedback on the whole piece's structure, flow, and argument, on one section, or a line edit for typos, grammar, passive voice, consistency, unclear references, and breaks of their writing rules, or a check of facts, links, and images.
---

# Copy edit

The author writes. The editor reads the piece the way a reader will, says what works and
what doesn't, and proposes changes the author can take or leave one at a time. The editor
moves, cuts, and fixes the author's own words. Where something is missing, the editor
proposes a short sentence as an editable diff, never a rewritten paragraph in its own voice.

There are four kinds of edit, and they need different reading. Ask which one the author
wants before reading closely, because a line edit of a piece whose order is wrong wastes
their time, and a flow read buried under forty typo cards gets skipped.

| Scope | What it answers | Steps |
|---|---|---|
| **Whole piece** | Does it hold together? Does each part lead to the next? Is the argument clear and believable? | 1, 2, 3, 6 |
| **One section** | The same questions for one section, and how it connects to the sections around it, then a line edit of it | 1, 2, 3, 4, 6 |
| **Line edit** | Typos, grammar, passive voice, consistency, unclear references, the author's writing rules | 1, 4, 6 |
| **Fact check** | Are the names, numbers, quotes, links, and images right? | 1, 5, 6 |

This is not `unslop` or `humanizer` (cut AI tells) or `claude-for-nonprofits:content-review`
(risk). Run those separately if the user wants them.

## 1. Ask, then read

**Ask the scope.** Skim the file first, so the question can name its sections. Then publish
an inline Impromptu UI question (see the `bb-global-skills:impromptu-ui` skill, "Ask a
question inline") under the key `copy-edit-<slug>-scope`, with two questions:

1. "What kind of edit do you want on <title>?" Buttons: Whole piece (`primary` for a draft
   with an outline or notes still in it), One section, Line edit (`primary` for a draft that
   reads as finished), Fact check.
2. "What do you already suspect isn't working?" Buttons: The flow, The argument, The opening
   or ending, Nothing in particular. The author can type their own answer in the
   "Something else…" field.

Skip the question when the request already says, such as "proofread this" (line edit) or
"does this flow?" (whole piece). For One section, ask which section next, with up to four
headings as buttons; the author can type any other. End the turn after publishing.

Whatever the author says they suspect, the read answers it directly, by name, even when you
disagree.

**Then read the piece:**

- Read the whole file and every image it shows. Open images with the Read tool so you see
  them. For a Hugo page bundle, also look at the images in the post's folder that the post
  doesn't use yet: an unused chart is often the evidence a placeholder is waiting for. Name
  any that fit in the summary.
- Sort the file into **prose meant for readers** and **notes to self**: an outline,
  "Potentially incorporate:", bullet scraps, TODOs, placeholders like "N tables" or
  "(chart)". Notes are the author's statement of where the piece is going. Read them for
  intent and never make line cards for them.
- Work out who the reader is, in one sentence, such as "engineering leaders outside big tech
  who have heard 'AI-native' but haven't seen it in practice."
- Read the author's writing rules: the Writing section of `~/.claude/CLAUDE.md`, and any
  style guide, voice guide, or AGENTS.md in the repo the piece lives in. Their rules beat
  general style advice.
- Never edit the file before the user presses Apply on a card.

## 2. Reverse outline

Flow problems are invisible sentence by sentence. They show up when you see the whole piece
as a list. Build that list before judging anything.

1. **The point.** Write the piece's main point in one sentence, in your words. If you can't,
   that is the first finding: the piece doesn't yet know what it's arguing.
2. **One line per paragraph.** Number every prose paragraph, including headings as
   dividers. For each, write what it says in under 15 words and the job it does: claim,
   evidence, example, setup, definition, transition, aside, or payoff. A paragraph that says
   two things gets both, and a mark that it should split. A paragraph whose job you can't
   name is a candidate to cut.
3. **The joints.** For each pair of neighboring paragraphs, name how the second follows from
   the first: because, so, but, for example, which means, in contrast. Where the only
   honest word is "and also" or "separately," the reader loses the thread there. Mark it.
4. **The section test.** For each section, does its heading match what its paragraphs do?
   Does the section move the main point forward, and could the reader say why it comes
   where it does?

For One section, outline that section and the last paragraph before it and the first after
it, so you can judge its entrance and exit.

## 3. Diagnose structure and flow

Read the outline, not the prose, and find the two to four **root problems**. A root problem
explains several symptoms: three broken joints in a row often mean one paragraph is in the
wrong place, and a section that repeats an earlier one often means the piece is making the
same point twice because it hasn't decided which section owns it. Look for:

| Problem | How it shows in the outline |
|---|---|
| No single point | You couldn't write step 2.1, or the opening promises a different point than the ending delivers |
| Setup after use | A term, name, or idea is used in paragraph 4 and explained in paragraph 9 |
| Wrong order | The joints read better if two paragraphs or sections swap |
| Repeats | Two paragraphs with the same line in the outline |
| Detour | A paragraph whose job doesn't serve the point, or an aside long enough to lose the reader |
| Claim without evidence | A claim paragraph with no evidence or example paragraph after it, or a placeholder where the evidence should be |
| Weak entrance | The opening doesn't tell the reader what the piece is about or why they should care, before the second paragraph |
| Weak exit | The ending stops instead of landing on the point, or introduces something new |
| Pushback | Where a doubtful reader in the audience from step 1 would stop agreeing |

Rank the root problems by how much fixing each would improve the piece. For a rough draft,
measure against the author's notes: what the piece is trying to become, not only what's
there.

Also name what's working, with a quote: the passage, joint, or example the author should
protect while revising.

## 4. Line edit

Read every sentence of prose for:

| Kind | Examples |
|---|---|
| Mechanical | Typos, doubled spaces, doubled words, punctuation, subject-verb agreement, dangling modifiers, mixed comparisons ("equally valuable as"), "-ly" adverb hyphens |
| Consistency | Spelling of names and products, capitalization, italics for titles, one term used two ways |
| Passive voice | "Every pull request is reviewed by a human" where the actor is known. Suggest the active form, naming the actor and keeping the author's other words. Leave passive where the actor is unknown or beside the point |
| Unclear references | A name, acronym, or "we" the reader hasn't been told about yet, a "this" with no clear antecedent |
| Author's rules | Em dashes, mannered phrasing, jargon, assumed context |

Do not make a card for:

- A sentence that is correct and clear but could be phrased differently. That is a rewrite.
- A joke, aside, or figure of speech whose meaning is plain. Mannered prose is a metaphor
  standing in for a statement the reader then has to decode. A joke the reader gets is the
  author's voice.
- Whitespace readers never see, and frontmatter unless readers will see the mistake.
- Placeholders. List the ones still to fill in, once, in the summary.

## 5. Fact check

Check every factual claim in the prose against its source and quote the source on the card.

- **Linked sources**: read the page before saying anything about how the link describes it.
  If you can't read it, say so rather than guess.
- **Names, dates, numbers, quotes, titles**: words in quotation marks credited to a source
  must match it word for word. A number that is off gets a card unless the text marks it as
  rounded ("about 60").
- **Claims with no source**: search the web for general claims; check the author's claims
  about their own work against what you can reach, such as a design doc in the repo.
- **Dates against each other**. A draft's frontmatter date is often the day the author
  started, so a mismatch with it is a suggestion to set the publish date, not an error.
- **Images and charts**: the numbers and labels match what the text says about them, axes
  and legends are labeled, and alt text and captions describe what the image shows.

A wrong fact gets a card with the correction. A claim you couldn't verify gets a card that
says what you tried, with no change. List what you checked and found correct in one
paragraph of the summary.

## 6. Show the results

Publish one Impromptu UI view under the key `copy-edit-<slug>`, where the slug is the file
name, or the folder name for an `index.md` (a Hugo page bundle), with `--replaces
copy-edit-<slug>-scope`. Follow the impromptu-ui skill's "Propose corrections to a document"
pattern and check `bb impromptu-ui schema` for fields. Write the JSON under
`/tmp/copy-edit/<slug>/`.

### Whole piece and One section

- `summary`: a link to the file, then, in short paragraphs:
  1. The main point, in one sentence, and the reader you assumed, so the author can correct
     either.
  2. The answer to what the author said they suspected.
  3. The root problems, most important first, each in two or three sentences that point at
     paragraphs by quoting their first few words.
  4. What's working, quoted.
- **Outline** section, first: one item titled "Outline: now and proposed". Its `changes`
  entry has the label "Outline", `before` as the reverse outline from step 2 (one numbered
  line per paragraph, its job in brackets, broken joints marked "↯ no link to the
  previous"), and `after` as the outline with the proposed moves, cuts, and additions made,
  new paragraphs marked "[new]". The diff shows the author the shape of the change at a
  glance. Buttons: Looks right (`primary`), Revise (`"repeat": true`, `{note}`) for "you
  misread what this paragraph is for." This item is a plan, not an edit: never apply it to
  the file.
- **Structure** section: a card for each change that carries out the proposed outline, in
  the order the author should make them. Each card says which root problem it fixes.
  - A move: one change removing the passage, one inserting it where it goes, the author's
    words unchanged.
  - A cut: the passage, with `after` of `""`.
  - A repeat: keep the version that says more and delete the other. If the deleted one has a
    sentence the kept one lacks, move that sentence over as a second change.
  - A missing joint, entrance, exit, or example: a `draft` card (below) with a one- or
    two-sentence bridge built from the author's words and notes, with a bracketed blank,
    such as "[number] procedures", for facts only the author knows.
  - A paragraph that does two jobs: a split, by inserting a paragraph break.
  - A sentence that should be reworded, such as a transition whose "this" points at nothing:
    a `draft` card whose `before` is that sentence and whose `draft` is the reworded one.
  - A placeholder standing in for evidence, such as "(chart of test growth)": a `draft` card
    replacing it with a sentence that says what the evidence shows, with bracketed blanks.
    Other placeholders and notes get no cards.
  - New prose where no prose sentence comes before it, such as a closing after the notes:
    anchor on the heading it goes under, or on the first line of the notes and put the new
    prose before them.
- For One section, add **Fixes** and **Suggestions** sections for that section's line edit.
- No line edits outside the section, and none at all for Whole piece. Keep any you notice in
  your notes, and say in chat that a line edit can follow once the structure settles.

### Line edit and Fact check

- `summary`: a link to the file, then a sentence or two on the pattern, such as "Most of the
  passive voice is in the second half," then the list of placeholders, or for a fact check
  the paragraph of what you checked and found correct.
- Sections, leaving out empty ones: **Facts** (wrong or unverifiable claims, links, images),
  **Fixes** (mechanical and consistency errors with a clear right answer), **Suggestions**
  (passive voice, unclear references, rule breaks: calls the author may disagree with).

### Every card

- `title`: where it is and what's wrong, such as "Postgres intro: doubled space".
- `summary`: one line on why. For a fact, quote the source.
- `changes`: `{ "label": "<file> › <heading>", "before": ..., "after": ... }`. Use "Opening"
  for text before the first heading and "Frontmatter" for the front matter.
  - `before` is the shortest exact span that contains the problem and occurs once in the
    file, copied character for character. A one-word fix never quotes a paragraph. To delete
    a paragraph, include its trailing blank line.
  - `after` is `before` with only the fix applied.
  - One problem per card, and no two cards' `before` spans overlap, so any card can be
    applied or skipped without breaking another. List a card's deletions before its
    insertions.
- A **`draft` card** adds or rewords. Its change has a `before` and no `after`; the item's
  `draft` is the replacement for `before`. To add a sentence, `before` is the sentence the
  new one follows and `draft` is that sentence plus the addition. Impromptu
  UI shows the insertion as a diff with an Edit tab, so the author can rewrite it before
  applying.
- `note` with a placeholder, and buttons whose `text` names the card id and what it does:
  - A card with `changes`: Apply (`primary`), Skip, Revise (`"repeat": true`, `{note}`).
  - A `draft` card: Apply (`primary`, with `{draft}` in its text), Skip, Revise.
  - A claim you couldn't verify: Checked, it's right (`primary`), Noted, Skip.
- Order Structure cards in the order the author should make them, Facts by importance, and
  Fixes and Suggestions in reading order.
- Authors keep writing while you read. Read the file again just before publishing, drop or
  rebuild cards whose text changed, and check that every `before` occurs exactly once.

After publishing, say in chat how many cards are in each section and that they're above the
composer. Don't repeat the summary or the cards in chat.

## 7. Act on each button

- **Apply**: read the file again, since the author may have kept writing. Replace `before`
  with `after`, or with the `{draft}` text the button sent, and nothing else, matching on
  text, not line numbers. If `before` is gone, tell the user and mark the card `{ "label":
  "Text changed", "tone": "warning" }` rather than guessing.
- **Skip**, **Noted**, **Checked, it's right**, **Looks right**: change nothing.
- **Revise**: publish the item again under the same `id` with the new suggestion. A Revise
  on the outline can change the diagnosis: redo step 3 and republish the Structure cards
  that depend on it.

After each one, publish the view again under the same key with that item's `status` set to
`{ "label": "Applied", "tone": "success", "complete": true }`, `{ "label": "Skipped",
"complete": true }`, or `{ "label": "Noted", "complete": true }`. Keep handled cards in the
view so they read as done.

**A second round** on the same file: read `bb impromptu-ui state --key copy-edit-<slug>`,
keep open cards whose `before` still occurs exactly once under their old ids, drop handled
cards and cards whose text is gone, and give new cards ids no earlier round used.

## Common mistakes

| Mistake | Instead |
|---|---|
| Starting with typos when the author asked whether the piece flows | Ask the scope first; a whole-piece read has no line cards |
| Structure feedback as a list of general questions ("Is the opening strong?") | Build the reverse outline and point at the paragraphs where the thread breaks |
| A card per symptom of one problem | Find the root problem: one misplaced paragraph explains three broken joints |
| Ignoring what the author said they suspected | Answer it by name in the summary, even to disagree |
| "Suggested:" followed by a rewritten paragraph | Moves and cuts of the author's words, plus short bridge sentences as editable drafts |
| Changing a phrase because you'd say it differently | Leave it unless it breaks a rule, is unclear, or is passive with a known actor |
| Line edits in the outline or notes at the end | Read notes as intent; never edit them |
| Saying a link or image is wrong without opening it | Open it and quote what it shows |
| Only criticizing | Say what's working, quoted, so the author protects it |
