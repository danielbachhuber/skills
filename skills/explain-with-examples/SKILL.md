---
name: explain-with-examples
description: Use when explaining something to the user, such as how a bug happens, why a review point matters, what a change does (including one an end user sees on screen), or how part of a system works, and when the user asks for an example, a worked example, or to "show me" what an explanation means.
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

## Changes a user sees

When the change is something an end user sees, the example is the screen. Show it as
annotated screenshots, and when it plays out over several steps or over time, as a
filmstrip. Words about a screen ask the reader to picture it; a screenshot with the changed
part marked shows them.

- **Annotate what changed.** Before you take the screenshot, mark the element with an
  outline and a numbered badge, then explain each number under the image. With Playwright,
  add the marks to the page itself so they line up with the element:

  ```js
  await page.locator('[data-testid="reply-button"]').evaluate((el, n) => {
    el.style.outline = '3px solid #e5484d';
    el.style.outlineOffset = '2px';
    const badge = document.createElement('div');
    badge.textContent = n;
    const r = el.getBoundingClientRect();
    Object.assign(badge.style, {
      position: 'fixed', left: `${r.right - 4}px`, top: `${r.top - 14}px`,
      background: '#e5484d', color: '#fff', font: 'bold 13px/22px system-ui',
      width: '22px', height: '22px', borderRadius: '11px', textAlign: 'center', zIndex: 99999,
    });
    document.body.append(badge);
  }, '1');
  ```

  For a screenshot you already have, draw the box with ImageMagick:
  `magick in.png -fill none -stroke '#e5484d' -strokewidth 3 -draw 'rectangle 120,80 340,130' out.png`.
- **Before and after, side by side.** Mark the same element in both, so the reader compares
  one spot rather than hunting for the difference.
- **A filmstrip for anything that moves.** A loading state, a flash of the wrong content,
  or a flow through several screens gets three to six frames in one row, each captioned with
  the step or the time.
- **The key goes under the image.** One line per number, saying what the reader sees there
  and why it changed.

For example, instead of only saying "the Reply button no longer jumps when the thread
loads," show:

| 0 ms: open thread | 300 ms: replies load | 600 ms: settled |
|:---:|:---:|:---:|
| ![](/tmp/reply-jump/f1.png) | ![](/tmp/reply-jump/f2.png) | ![](/tmp/reply-jump/f3.png) |

1. The Reply button sits under the first message while the replies load.
2. It stays in the same place once they arrive, because the list now reserves their height.

Look at every image yourself before you describe it. The `show-dont-tell` skill covers how
to capture the before, catch a loading state with `page.route`, and where to keep the files.

## Illustrations

Add a simple illustration where it helps, such as a small table, a before and after, or a
numbered sequence of what happens. The `show-dont-tell` skill covers when a diagram is
worth drawing.
