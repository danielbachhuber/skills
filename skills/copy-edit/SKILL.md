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
| **Whole piece** | What is the piece trying to be, and does it get there? Is the thesis clear, the strongest material up front, and each section earning its place? What shapes could it take? | 1, 2, 3, 6 |
| **One section** | The same questions for one section, judged against the piece's thesis, then a line edit of it | 1, 2, 3, 4, 6 |
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

## 2. Judge the piece as a whole

A whole-piece read is an editor's judgment of what the piece is and whether it works, not a
list of local fixes. Work from the top down. Don't start with paragraph links: a piece whose
links all hold can still be about the wrong thing.

1. **What is it trying to be?** An argument, a report, a how-to, a story. Does the body
   deliver what the title and opening promise? A post titled as an essay that reads as a
   project status report has a problem no transition can fix.
2. **The thesis.** Look for it anywhere: the title, the opening, a line in the middle, the
   ending, the notes. Quote it in the author's words. If you find two that disagree, the
   piece may be two pieces; say so. If you find none, say so, and propose one built from
   the author's own sentences. Two that differ but fit together, such as a definition early
   and a fuller one at the end, are a finding too: the piece should connect them.
3. **Test everything against the thesis.** Does the title promise it? Does the opening
   promise it before the reader's attention runs out? Does each section serve a part of it?
   Name the sections that serve none (detours) and the parts of the thesis that no section
   serves (gaps). Does the ending deliver it?
4. **The strongest material.** Rank the examples, stories, and evidence by how well each
   proves the thesis to this reader. Is the strongest one where the reader will meet it
   early and remember it, or is it buried in a subsection while a weaker one makes the
   case?
5. **The reader's experience.** Read as the reader from step 1. Where do they first stop
   knowing why they should keep reading? Where does insider context (names, tools, project
   history) arrive before they care about it? Where does density (a run of charts, a wall
   of numbers) bury the argument?
6. **Pushback.** Where would a doubtful reader in that audience stop agreeing?

Then write **three to five findings**, most important first. Each is a claim about the
piece, with quoted evidence and why it matters to the reader. The first is the one to fix
if the author fixes only one. Don't call the structure sound unless the title, opening,
sections, and ending all serve one thesis; "the bones are sound, the problems are at the
edges" is almost always a sign you read paragraph by paragraph.

Also name what's working, with a quote, so the author protects it while revising.

**Then propose shapes.** Unless the current structure already serves the thesis, propose two
or three shapes the piece could take, built from material it already has. A shape is a
pitch in one sentence ("Lead with the rest-of-us problem, and use the Postgres port as the
case study"), a section-by-section outline of what goes where, and what it costs: what gets
cut, moved, or written new. Recommend one and say why. When a shape needs only a few moves,
offering "Keep this shape, fix the links" as one of the options is fine.

## 3. Reverse outline

Use a reverse outline to locate the findings in the text and to show the shapes. Number
every prose paragraph, with headings as dividers. For each, write what it says in under 15
words and the job it does: claim, evidence, example, setup, definition, transition, aside,
or payoff. Between neighbors, name how the second follows from the first: because, so, but,
for example. Where the only honest word is "and also," mark the break "↯".

For One section, outline that section plus the paragraph before it and the one after it,
and judge the section against the piece's thesis, not only on its own.

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

This takes two rounds, because the cards depend on which shape the author picks.

**Round 1: the read and the shapes.**

- `summary`: a link to the file, then, in short paragraphs:
  1. The thesis, quoted, and the reader you assumed, so the author can correct either.
  2. The answer to what the author said they suspected.
  3. The findings from step 2, most important first, each in two to four sentences that
     point at passages by quoting their first few words.
  4. What's working, quoted.
  5. One closing paragraph: unused images that fit, and placeholders still to fill.

  Keep each finding to what the author needs to act on it; the summary should read in two
  minutes. Tell the author they can correct the thesis or reader by replying in chat.
- A **Shapes** section with one item per shape, recommended first. Its `title` is the pitch.
  Its `summary` says what it costs and, for the recommended one, why. Its `changes` entry
  has the label "Outline", `"format": "code"` so each outline line diffs on its own, `before` as the current reverse outline from step 3 (the same on
  every shape), and `after` as the outline in this shape, with moved paragraphs marked
  "(moved from 5)", split ones "(part of 7)", and new ones "[new]". List cut paragraphs at
  the end as "Cut: 12". Buttons: Use this shape (`primary` on the
  recommended one), and Revise (`"repeat": true`, `{note}`). These items are plans, never
  applied to the file.

Say in chat that the read and the shapes are above the composer, and end the turn.

**Round 2: the cards for the chosen shape.** When the author picks one, mark it `{ "label":
"Chosen", "tone": "success", "complete": true }` and the others `{ "label": "Not chosen",
"complete": true }`, and add a **Structure** section to the same view: a card for each
change that carries out that shape, in the order the author should make them.

  - A move: one change removing the passage, one inserting it where it goes, the author's
    words unchanged.
  - A cut: the passage, with `after` of `""`.
  - A repeat: keep the version that says more and delete the other. If the deleted one has a
    sentence the kept one lacks, move that sentence over as a second change.
  - A missing thesis statement, link, entrance, exit, or example: a `draft` card (below)
    with one or two sentences built from the author's words and notes, with a bracketed
    blank, such as "[number] procedures", for facts only the author knows.
  - A paragraph that does two jobs: a split, by inserting a paragraph break.
  - A sentence that should be reworded, such as a transition whose "this" points at nothing:
    a `draft` card whose `before` is that sentence and whose `draft` is the reworded one.
  - A placeholder standing in for evidence, such as "(chart of test growth)": a `draft` card
    replacing it with a sentence that says what the evidence shows, with bracketed blanks.
    Other placeholders and notes get no cards.
  - New prose where no prose sentence comes before it, such as a closing after the notes:
    anchor on the heading it goes under, or on the first line of the notes and put the new
    prose before them.

A new section the shape needs that only the author can write gets a card with no change: a
heading, what it should argue, and which of their notes and material belong in it.

- For One section, add **Fixes** and **Suggestions** sections for that section's line edit
  in round 2.
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
- **Use this shape**: round 2 of step 6.
- **Skip**, **Noted**, **Checked, it's right**: change nothing.
- **Revise**: publish the item again under the same `id` with the new suggestion. A Revise
  on a shape that corrects your thesis or reader changes the read: redo step 2 and
  republish the summary and the shapes.

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
| A whole-piece read made of paragraph moves and transition fixes | Start from what the piece is trying to be, its thesis, and its strongest material; the links come last |
| "The bones are sound" when the title promises one thing and the body delivers another | Say the piece hasn't decided what it's about, and propose shapes that decide |
| Assuming the thesis is in the opening, or at the end | Look everywhere, including the notes; quote it |
| Cards before the author has picked a shape | Round 1 is the read and the shapes; cards come in round 2 |
| A card per symptom of one problem | Find the root problem: one misplaced paragraph explains three broken links |
| Ignoring what the author said they suspected | Answer it by name in the summary, even to disagree |
| "Suggested:" followed by a rewritten paragraph | Moves and cuts of the author's words, plus short bridge sentences as editable drafts |
| Changing a phrase because you'd say it differently | Leave it unless it breaks a rule, is unclear, or is passive with a known actor |
| Line edits in the outline or notes at the end | Read notes as intent; never edit them |
| Saying a link or image is wrong without opening it | Open it and quote what it shows |
| Only criticizing | Say what's working, quoted, so the author protects it |
