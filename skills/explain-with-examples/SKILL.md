---
name: explain-with-examples
description: Use when explaining something to the user, such as how a bug happens, why a review point matters, what a change does, or how part of a system works, and when the user asks for an example, a worked example, or to "show me" what an explanation means.
---

# Explain with examples

An explanation that states only the general rule asks the reader to imagine a case where it
applies. Give them the case. Show the actual thing, such as the row, the request, the file,
or the output, with real names and values, and walk through what happens to it. Then state
the general point, which now reads as a summary of something the reader has already seen.

## What to show

- **The actual data.** A row, a request and its response, a config file, a log line, a
  command and its output. Pull it from the code, the database, the test fixtures, or the
  thread rather than describing it.
- **Real names and values.** `story_id: st_4471`, not `<id>` or `foo`. If you have to make a
  value up, make it look like the real thing and say that you made it up.
- **What happens to it, step by step.** Point at the line or field that changes and say
  what changes it.
- **Then the general point,** in a sentence or two.

## Example

Instead of only saying "an item should show its story's current details on every backend,"
show the Firebase row whose story was deleted:

```
related_content/q_812/items/rc_3
  url:      https://example.org/budget-vote
  story_id: st_4471                 ← stories.delete removed this story
  title:    "Budget vote delayed"   ← copied when the URL was added, so the card still shows it
```

Then the general point: Firebase and MongoDB copy the story's title into the row, so a row
can outlive its story and keep showing the copied title. Reading the title from the story
every time fixes that.

## Illustrations

Add a simple illustration where it helps, such as a small table, a before and after, or a
numbered sequence of what happens. The `show-dont-tell` skill covers when a diagram is
worth drawing.
