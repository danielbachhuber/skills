---
name: copy-edit
description: Use when the user asks to copy edit, edit, proofread, fact-check, critique, or give a read to a piece of their own writing, such as a blog post draft, essay, newsletter, or doc, at any stage from rough draft to final, and wants feedback on structure and arc as well as typos, grammar, passive voice, consistency, duplicated passages, unclear references, wrong facts, misdescribed links or images, or breaks of their writing rules.
---

# Copy edit

The author writes. The editor suggests. A copy edit reads the piece the way a reader will,
says what works and what doesn't, checks that it is correct, and proposes the smallest
change that fixes each problem, one per card, so the author can take or leave each one.

It never rewrites sentences into the editor's voice. The editor moves, cuts, and fixes the
author's own words. Where something is missing, such as a transition or an example, the
editor describes what the gap needs and leaves the writing to the author, unless the author
asks for a draft on that card.

This is not `unslop` or `humanizer` (cut AI tells) or `claude-for-nonprofits:content-review`
(risk). Run those separately if the user wants them.

Work in this order: read, structure, facts, lines. Structure comes first because polishing a
paragraph the author then cuts wastes their time.

## 1. Read the piece

- Read the whole file, and every image in it (for a Hugo page bundle, the image files in the
  post's folder). Open images with the Read tool so you see them.
- Sort the file into **prose meant for readers** and **notes to self**: an outline,
  "Potentially incorporate:", bullet scraps, TODOs, placeholders like "N tables" or
  "(chart)". Notes to self are the author's statement of intent. Read them to understand
  where the piece is going. Never make line-level cards for them.
- Judge how finished the draft is. A rough draft gets structural feedback on the arc and
  what's missing, measured against the author's notes. A near-final draft gets full weight
  on both structure and lines.
- Work out who the reader is from the piece and where it will be published, in one sentence,
  such as "engineering leaders outside big tech who have heard 'AI-native' but haven't seen
  it in practice". Judge "no assumed context" and "why should I care" against that reader.
- Read the author's writing rules: the Writing section of `~/.claude/CLAUDE.md`, and any
  style guide, voice guide, or AGENTS.md in the repo the piece lives in. Their rules beat
  general style advice. For this user they include no em dashes, plain approachable English,
  no mannered prose, and no assumed context.
- Never edit the file before the user presses Apply on a card.

## 2. Structural read

Read the prose for:

| Question | What to look for |
|---|---|
| Opening | Does the first paragraph make the reader want the second? Does it tell them what the piece is about? |
| Throughline | Can you say the piece's point in one sentence? Does each section move it forward, or wander? |
| Ending | Does it land on the point, or stop? (On a rough draft: does the outline lead to an ending?) |
| Skeptic | Where would a doubtful reader push back? Which claims hand-wave past something? |
| Where to expand | Where does the author move past something interesting too quickly? |
| Examples | Which claims need a concrete example to be believed, such as a number, a specific PR, or a before and after? |
| Why care | Which statements don't say why the reader should care? |
| Order | Would a passage work better elsewhere, such as a definition before the first use of the term? Are two passages saying the same thing? |

Write the results two ways:

- **The read**, a few short paragraphs for the view's summary, ranked by importance:
  1. Who you assumed the reader is, so the author can correct it.
  2. The one thing to fix first, if they fix only one.
  3. What's working and should be protected while they revise. Quote it.
  4. The rest, most important first, each in a sentence or two.
- **A card for each concrete action**: a move, a cut, a duplicate to remove, a gap to fill,
  a claim that needs an example. A point with no single action stays in the read only.

## 3. Fact check

Check every factual claim in the prose against its source and quote the source on the card.

- **Linked sources**: read the page before saying anything about how the link describes it.
  If you can't read it, say so rather than guess.
- **Names, dates, numbers, quotes, titles**: check spelling, attribution, and the figure
  itself. Words in quotation marks that point at a source, such as a definition credited to
  a linked doc, must match it word for word. A number that is off gets a card unless the
  text marks it as rounded ("about 60").
- **Dates against each other**: "today" in a chart, "last week" in the text. In a draft,
  the frontmatter date is often the day the author started, not the publish date, so a
  mismatch with it is not a factual error. Suggest the publish date as a Suggestion card
  instead.
- **The author's own claims about their work**: check them against what you can reach, such
  as a design doc in the repo or a dashboard the post cites.
- **Images and charts**: check that the numbers and labels in the image match what the text
  says about them, that axes and legends are labeled, and that alt text and captions describe
  what the image shows.

A wrong fact gets a card with the correction. A claim you couldn't verify gets a card that
says what you tried, with no suggested change. List what you checked and found correct in
one paragraph of the read, so the author knows what was covered.

## 4. Line-level read

Read every sentence of prose for:

| Kind | Examples |
|---|---|
| Mechanical | Typos, doubled spaces, doubled words, punctuation, subject-verb agreement, dangling modifiers, mixed comparisons ("equally valuable as"), "-ly" adverb hyphens |
| Consistency | Spelling of names and products, capitalization, italics for book and film titles, one term used two ways |
| Passive voice | "Every pull request is reviewed by a human" where the actor is known. Suggest the active form, naming the actor and keeping the author's other words. Leave passive where the actor is unknown or beside the point |
| Unclear references | A name, acronym, or "we" / "our" the reader hasn't been told about yet, a "this" with no clear antecedent |
| Author's rules | Em dashes, mannered phrasing, jargon, assumed context |

Skip any paragraph a structural card proposes cutting.

Do not make a card for:

- A sentence that is correct and clear but could be phrased differently. That is a rewrite.
- A joke, an aside, or a figure of speech whose meaning is plain, such as "Postgres will free
  us from those sins." Mannered prose is a metaphor standing in for a statement the reader
  then has to decode. A joke the reader gets is the author's voice.
- Whitespace readers never see: trailing spaces, extra blank lines between paragraphs.
- Placeholders. List the ones still to fill in, once, at the end of the read. The exception
  is a placeholder that stands in for evidence, such as "For example, (examples)" or
  "(chart or something to back up the claims)": that gets a missing-example card instead of
  a line in the list.
- Frontmatter, unless readers will see the mistake, such as a misspelled title.

## 5. Write each card as the smallest change

- `before` is the shortest exact span that contains the problem plus enough words to find it
  uniquely in the file: usually a phrase or one sentence, never a whole paragraph for a
  one-word fix. Copy it character for character, including doubled spaces.
- `after` is `before` with only the fix applied. Every other word stays the author's.
- One problem per card. A paragraph with a typo and an unclear name gets two cards.
- No two cards' `before` spans overlap, so any card can be applied or skipped without
  breaking another. If two problems sit in the same words, shorten the spans or make them
  one card.
- **Duplicates**: keep the version that says more, as written, and delete the other. If the
  deleted one has a sentence the kept one lacks, move that sentence over unchanged as a
  second change on the same card. If the two word an idea differently, say which wording the
  card keeps. Don't write a merged paragraph.
- **Moves**: one change removing the passage, one inserting it where it goes.
- To delete a whole paragraph, include its trailing blank line in `before`.
- List a card's changes in the order they apply: deletions first, then insertions.
- **Gaps and missing examples** have no `changes`. The summary says where the gap is and
  what it needs to do, such as "Nothing connects 'decisions are the bottleneck' to the
  'AI-native' heading. A sentence here should say why that bottleneck is what AI-native
  means here." A gap between paragraphs has no sentence of its own, so say where it goes by
  quoting the end of the sentence it follows, in the title or the first words of the summary,
  such as "After 'the bottleneck; doing the work is much less so.'". For a missing example,
  quote the claim, say what kind of example would back
  it, and point to a candidate in the author's own notes when there is one.

## 6. Show the cards

Publish one Impromptu UI view, following the `bb-global-skills:impromptu-ui` skill's
"Propose corrections to a document" pattern. Check `bb impromptu-ui schema` for fields.

- Key: `copy-edit-<slug>`, where the slug is the file name, or the folder name for an
  `index.md` (a Hugo page bundle). Write the JSON under `/tmp/copy-edit/<slug>/`.
- `summary`: a link to the file, then the read from step 2.
- Sections, in this order, leaving out empty ones:
  1. **Structure**: moves, cuts, duplicates, gaps, missing examples.
  2. **Facts**: wrong or unverifiable claims, links, and images.
  3. **Fixes**: mechanical and consistency errors. Clear right and wrong.
  4. **Suggestions**: line-level calls the author may disagree with: passive voice, unclear
     references, rule breaks that need rewording.
- Each item:
  - `title`: where it is and what's wrong, such as "Postgres intro: doubled space".
  - `summary`: one line on why. For a fact, quote the source.
  - `changes`: `{ "label": "<file> › <heading>", "before": ..., "after": ... }` entries.
    Use "Opening" for text before the first heading and "Frontmatter" for the front matter.
    An `after` of `""` deletes the text.
  - `note` with a placeholder, and buttons. Each button's `text` names the card id and what
    it does, because the user may press them in any order. Quote short spans in full; for a
    long passage, quote its first and last few words.
    - A card with `changes`: Apply (`primary`), Skip, Revise (`"repeat": true`, `{note}`).
    - A gap, a missing example, or an unclear reference that needs new words, with no
      `changes`: Noted (`primary`, the author will handle it), Draft it (with `{note}`, so
      the author can say what the draft should contain; write a suggestion for this card
      only, then republish it as a card with `changes`), and Skip. Give it a `note` with the
      placeholder "What the draft should say".
    - A claim you couldn't verify: Checked, it's right (`primary`), Noted (the author will
      look into it), and Skip. There is nothing to draft.
  - The section comes from the scale of the problem, the buttons from whether the card has
    `changes`. An unclear reference is a line-level Suggestion even when fixing it needs new
    words.
- Order cards by importance in Structure and Facts, and in reading order in Fixes and
  Suggestions, so the author can apply them top to bottom.
- Before publishing, check that every `before` occurs exactly once in the file.

After publishing, say in chat how many cards there are in each section and that they are
above the composer. Don't repeat the read or the cards in chat.

## 7. Act on each button

- **Apply**: read the file again, since the author may have kept writing while the cards were
  open. Replace `before` with `after` and nothing else, using any exact-match replacement
  (the Edit tool, or a script that first checks `before` occurs exactly once). Match on the
  text, not line numbers. If `before` is no longer in the file, tell the user and mark
  the card `{ "label": "Text changed", "tone": "warning" }` rather than guessing.
- **Skip**, **Noted**, and **Checked, it's right**: change nothing. For Checked, add the
  claim to the read's "checked and correct" paragraph on the next round.
- **Revise** and **Draft it**: publish the item again under the same `id` with the new
  suggestion.

After each one, publish the view again under the same key, with that item's `status` set to
`{ "label": "Applied", "tone": "success", "complete": true }`, `{ "label": "Skipped",
"complete": true }`, or `{ "label": "Noted", "complete": true }`. Keep every handled card in
the file so it reads as done instead of vanishing.

## Running it again on the same file

A second round publishes under the same key. Before publishing, read the current view with
`bb impromptu-ui state --key copy-edit-<slug>` and:

- Keep each open card whose `before` still occurs exactly once in the file, under its old
  `id`, so the user's progress on it survives.
- Drop cards already handled in an earlier round, and open cards whose text is gone.
- Give new cards ids that no earlier round used.

## Common mistakes

| Mistake | Instead |
|---|---|
| "Suggested:" followed by a rewritten paragraph | One card per problem, `after` changed only where the problem is |
| Writing the missing transition or example yourself | Describe what it needs; draft only when the author presses Draft it |
| Changing a phrase because you'd say it differently | Leave it. Flag it only if it breaks a rule, is unclear, or is passive with a known actor |
| Flattening a joke into plain words under the mannered-prose rule | A joke the reader gets is voice, not mannered prose |
| Merging duplicates into a new paragraph you wrote | Keep the author's fuller version, delete the other |
| Line edits in the outline or notes at the end | Read notes as intent; never edit them |
| Line edits in a paragraph a structural card cuts | Skip it |
| Saying a link or image is wrong without opening it | Open it and quote what it shows |
| Reporting a draft's frontmatter date as a factual error | Suggest the publish date |
| Only criticizing | Say what's working in the read, so the author protects it |
| Listing the read or the cards in chat | Above the composer |
