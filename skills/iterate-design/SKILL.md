---
name: iterate-design
description: Use when deciding how something should look or work in a user interface, such as a new page, section, chart, dashboard, warning, or control; a question like "how might this show up" or "how should we visualize this"; a request for mockups, design options, or more directions; or when the user has rejected a round of options with "none of these" or "give me more options".
---

# Iterate design

## Overview

The goal is the interface that solves the user's problem and is pleasant to use, reached in as few rounds as possible. Most wasted rounds come from three gaps, and each one shows up later as a visual correction:

- **Framing.** The design shows information when the user needed an action at a specific moment.
- **Grounding.** The design ignores where it will live, the project's existing patterns, or what the real data looks like.
- **Options.** The options are described in words, or are near-copies of each other, so the user can only reject them.

Work through the steps in order. Each one ends with something the user can correct before the next one starts.

**Size the work to the change.** A change to an existing screen, such as a color, a label, or one more column, follows the existing design: do steps 2 and 5, show the change, and skip the rounds of options. A new screen, section, chart, or warning gets every step.

## 1. Frame the moment

Before drawing anything, write back a short framing for the user to correct. Propose your own answer to each line instead of asking open questions:

```
Who:      <the person, and what they are in the middle of>
Moment:   <when this matters to them: while working, at a weekly review, when something goes wrong>
Next:     <what they do about it once they see it>
Working:  <how they would know the design is doing its job>
Words:    <the terms for each concept, taken from the user's own documents and code>
```

The **Next** line decides the shape of the design:

- If the answer is an action, such as compacting, unblocking, or replying, the design leads with that action at the moment it matters. A number on a page the user has to remember to visit is the wrong answer.
- If the answer is "understand a pattern", the design is a view to explore, and the comparison it supports is the main thing.
- If the problem lives in a few outliers, the design flags the outliers. Totals and averages across everything hide them.

For **Words**, search the user's documents, README, and code for the names they already use, and pick one word per concept. A dashboard that uses the document's vocabulary supports the document. If the user has described the request as one part of a larger product or page, name the larger thing now and treat the request as its first section. Don't invent a larger umbrella the user hasn't described.

Ask one question at a time when something can't be inferred. Do not move to step 2 until the user has accepted or corrected the framing. Then start the design's section in the design log (see below).

## 2. Ground it before drawing

Gather three things. Report them in a few lines, since they constrain every option that follows.

**Where it could live.** List every place the user could meet this: the existing screens and the rows, headers, and toolbars on them; a new page or tab; inline next to the thing it describes; a banner, toast, or notification; a menu bar or status bar; an email or message; a command-line output. For each, note what the user is doing there and how much space it has. If the user mentions a surface you didn't list, add it and check what it can hold before mocking anything for it.

**The design language.** Look for a design library first: a component library, design tokens, a Storybook, or a style guide in the repository or its dependencies. Use its components and tokens. If there isn't one, read the most recently written screens and note the patterns they share:

- severity and status colors, and how they are applied (tint, border, text weight)
- how numbers, dates, and durations are formatted
- controls for time ranges, filters, and paging
- empty, loading, and error states

Prefer what exists over something new. When an option breaks an existing pattern, say so on the option.

**The real data.** Query the real data before any mockup. Record:

- minimum, typical, and maximum values, and how long the tail is (median, p75, p90, max)
- how many items a list will hold, at the smallest and largest realistic scope
- empty and missing values
- relationships that look like fractions but aren't, such as "given" exceeding "requested"
- the longest realistic names and labels

Invented mockup data must reproduce this shape: the outliers, the near-empty rows, the 150-item list. Data that only shows the pleasant case hides the problems the user will find on the first real page.

## 3. Widen: first round of options

Build candidates across two axes, **where it lives** (from step 2) and **what form it takes** (from [ui-forms.md](ui-forms.md)). Read the catalog section for each job the design has to do, and consider every form there before choosing.

Show **5 to 8 options** that differ in form or location, not in styling. Three tints of the same card count as one option. Each option has:

- a one-line label naming its form and location, such as "Banner above the composer with a Compact button"
- one sentence on when it would be the right choice
- what it gives up

Then recommend one, and say why in terms of the framing from step 1.

## 4. Show every option as a real render

Every option is an image, never only a description. Render it in the real screen, next to the real header and surrounding content, using the components from step 2 and data shaped like step 2's findings. A mockup on a blank page makes every option look fine.

For each option, show:

- the current design first, so the change is visible
- the typical case and the extreme cases from step 2: the outlier, the empty state, the longest list
- a wide and a narrow layout, when the surface can be narrow

Use the review surface the environment provides, such as a review panel or a page of side-by-side screenshots, so the user can pick and comment on each item. For charts, follow the dataviz skill if it is available.

## 5. Narrow: second round

When the user picks a form, show **3 or 4 versions of it** that vary the details that change how it reads:

- density and how much is shown before a click
- labels and units, read aloud as a sentence ("148 requested · 241 given", not "241 of 148")
- how severity or state is shown, using the existing colors from step 2
- the threshold or rule that makes it appear

When the user combines parts of several options, such as "B's layout with D's numbers", build the combination as its own render before building it for real.

## When a round is rejected

"None of them yet", "I don't love these", and "more options" mean the round missed. Don't produce near-copies of the rejected options. Instead:

1. Ask which option came closest and what was wrong with it, unless the feedback already says.
2. Check whether the miss is in the framing (step 1) or the grounding (step 2), such as a surface or an existing pattern you missed. Fix that first.
3. Widen to forms and locations from [ui-forms.md](ui-forms.md) that no earlier round tried.

Record the rejection and its reason in the design log (see below). Never show a rejected option again without saying what changed.

## Keep a design log

Keep the state of every design in one markdown file, not only in the chat. Chat history gets compacted or scrolls away, and feedback that lives only there gets lost: a naming the user doubted comes back two rounds later, or a request inside a longer comment never gets built. Put the file outside the repository, in the thread's storage directory if the environment has one, otherwise in `/tmp/<topic>-design-log.md`, and tell the user where it is.

Read the log at the start of every turn that touches a design, and always after the conversation has been compacted. Update it before reporting.

The log has one section per design, and every design in it has a status:

```markdown
## Context warning (round 2, waiting on the user's pick)
Framing: <the five lines from step 1>
Depends on: Page row tint (should use the same colors)

- Round 1: strip, card, meter. Picked: meter.
- Round 2: amber vs red thresholds. Open.

Asks:
- [x] One-click Compact (round 1 feedback)
- [ ] Hide on archived threads (round 2 feedback)

Rejected, with reasons:
- Badge on the header button: "doesn't work for the menu bar"

## Ambition view (parked: user switched to review velocity)
```

Rules for the log:

- **Each design has a short name**, used everywhere: review items, image captions, messages. Rounds are numbered, such as "Context warning, round 2". When the user renames something, rename it in the log and on the review surface in the same turn.
- **Every design has one status:** exploring, waiting on the user, building, built, parked, or dropped. When the user changes direction, mark the old design parked or dropped with the reason. Never leave it open by default.
- **Split each round of feedback into separate asks**, one checkbox each. A comment such as "A's labels, add issues, show trends, let me click into the list" is four asks, and each is either done, scheduled into a later round, or confirmed as dropped.
- **Your own open questions count as asks.** When you raise a problem, such as charts flattening on a shared scale, it goes in the log until the user decides it.
- **Check the log for related work** before starting a new design. If an earlier, parked design covered the same ground, say so and carry over its findings and rejections.
- **A pick in one design doesn't decide another.** When two designs depend on each other, record it under both and ask which one leads.

**Close or park, don't carry.** Don't repeat a list of open items at the end of every message. When an item has stayed open for two rounds of other work, ask once whether to do it now, park it, or drop it, and record the answer. To keep to one question per message, state a default instead of asking, such as "I'll park the flat-lines fix unless you want it now". Keep the review surface matching the log: when a design is picked, built, renamed, parked, or dropped, update or remove its open items there.

End each report with a short status line for each active design: its name, its round, and what it is waiting on.

## 6. Check the build against the moment

After building, open it in the real app with real data, and read it as the user would at the moment from step 1:

- Does every number and label read correctly as a sentence, without explanation?
- Do the longest lists page or truncate, and does the emptiest case say something useful?
- Are the outliers visible, rather than hidden by a median or a shared scale?
- Can the user take the action from step 1 right where they see the problem, and does it work?

Fix what fails before reporting. In the report, show the result as images, following show-dont-tell if it is available, and say which checks were done on real data and which only on fixtures.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Adding numbers to every row when the problem is a few outliers | Flag the outliers where the user will see them, with the action next to the flag |
| Mocking only the target surface, then learning about another one | List every surface in step 2 and confirm which ones matter |
| Inventing a new color or badge style | Use the design library, or the pattern the newest screens use |
| Mockup data that is evenly spread and well behaved | Copy the real distribution: tails, empties, long lists, long names |
| Describing options in a list and asking the user to pick | Render each one, current design first |
| Five options that are the same layout restyled | Vary form and location; use the catalog |
| Using a mean, or a median alone, for durations | Show median with p75 and p90, or a count past a threshold |
| Repeating "still open" items at the end of every message | Ask once whether to do, park, or drop each one, and record it in the design log |
| Losing earlier feedback after the chat is compacted | Read the design log before continuing any design |
| Naming the feature after its first part | Name the larger thing in step 1; the first part becomes a section |
