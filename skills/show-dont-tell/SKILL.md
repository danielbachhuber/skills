---
name: show-dont-tell
description: Use when explaining something with structure a reader has to hold in their head, such as a chain of calls or components waiting on each other, requests over time, state transitions, or a data model, in an issue, PR description, code review finding, review reply, or chat message; whenever a change alters what a user sees on screen; and whenever you report work that produced something visual, such as screenshots, Storybook stories, UI states, or rendered diagrams.
---

# Show, don't tell

When the thing you are explaining has a shape, draw the shape. A paragraph that says "A
waits on B, which renders inside C, which waits on D" asks the reader to build the diagram
themselves. A table of start and end times asks them to picture the timeline. Do that work
for them.

The prose around a diagram gets shorter, not longer. The paragraph states the point in one
or two sentences and keeps the links. The diagram carries the detail the paragraph used to.

## Lead with the visuals

When a message reports something visual, the images are in the message, near the top. A
chat report that has screenshots, stories, or diagrams to show is shaped like this:

1. One sentence saying what the user is looking at.
2. The images, embedded with `![alt](/absolute/path.png)`, several side by side in a
   table. Pick the ones that answer the user's question, such as one baseline per panel,
   or before and after.
3. The prose: what changed, what you checked, what you noticed.
4. Links to everything else: the folder with the rest of the images, the stories file,
   the commits.

bb renders an image embedded by absolute path. A link to a folder, a Storybook command,
or a commit in a screenshots repo does not show the user anything. If a sentence asks the
user to look at something, it goes below that thing, in the same message.

## Pick the form

| You are explaining | Show it as |
| --- | --- |
| What waits on what: layers, providers, a call chain, a pipeline, a decision with branches | Mermaid `flowchart` |
| Calls a change adds, removes, or moves inside a request or render | A call tree: Mermaid `flowchart` or a `diff` text tree (see below) |
| A stack of pull requests, each built on the one before | Mermaid `gitGraph` |
| Messages between actors in order: client, server, queue, third party | Mermaid `sequenceDiagram` |
| Measured timings, or what runs in parallel versus in series | Mermaid `gantt` with the real numbers |
| States and the events that move between them | Mermaid `stateDiagram-v2` |
| Tables and their relations | Mermaid `erDiagram` |
| Numbers across categories or over time | A chart. Load the `dataviz` skill first. |
| Anything a user sees: layout, styling, loading and empty states, copy on screen | Screenshots, before and after |
| What a user sees change over time: a flash of the wrong state, a spinner that never clears, steps through a flow | A filmstrip (see below) |
| One or two specific lines of code | An annotated excerpt: the real lines with line numbers, and a `// ←` note on the one that matters |
| A proposed fix | A `diff` block with short lines, not one line that scrolls sideways |
| Behavior that depends on conditions, such as a flag or a loading, error, or success state | A scenario table: one row per case, with columns for the inputs, what happens, and what should happen. Bold the broken row. |
| Something that breaks under a condition you can reproduce | A failing test, quoted with its output |
| Requests in an order you can reproduce | The captured network log, trimmed to the requests that matter |

A comparison of a few values across two or three options is still a table. Draw when the
reader would otherwise have to picture an order, a dependency, or overlap in time. Prefer
evidence to a drawing when you can get it: a failing test, a network log, or a screenshot
shows what happens, and a diagram only claims it.

In a code review, most findings are about specific code or behavior, so the annotated
excerpt, the scenario table, and the `diff` fix come up most. Save Mermaid for findings
about order and dependency.

## Diagrams

Label every node with the real name (`useSettings`, `settings/get`), plus a short note on
what it does when that is the point: `useSettings<br/>returns undefined until settings/get
finishes`. Mark the part you are arguing about. `:crit` makes a gantt bar red. In a
flowchart, `classDef crit fill:#fde2e2,stroke:#c0392b,color:#000` and `class <node> crit`
do the same for a node. A dotted edge (`-. "label" .->`) shows a branch.

For a gantt of measured milliseconds, use `dateFormat x` and `axisFormat %L`, and give each
bar as `name :id, start, end`. Put the current and the proposed version in two `section`s
so the change reads top to bottom.

### Call trees

A call tree shows where in a request or render the change sits, which a diff spread across
files cannot. Draw it one of two ways:

- **A Mermaid `flowchart TD`** when the tree is a few levels deep and the point is where the
  change sits. Color changed calls with one `classDef` and new calls with another.
- **An indented text tree in a `diff` block** when the tree is deep, or when calls were
  removed. GitHub and bb color the `+` and `-` lines, and a flowchart has no clear way to
  show a call that no longer exists. Start unchanged lines with a space so they line up.

```diff
 createPost()                  POST /posts
   validatePost()
   savePost()
     db.insert()
     notifyFollowers()
-      sendEmails()            inline, blocked the response
+      queue.enqueue()         emails sent by a worker
+  moderatePost()
```

GitHub renders fenced `mermaid` blocks in issues, PRs, and comments, and bb renders them in
chat. Before showing any diagram to the user, render it and look at the image. A diagram can
parse cleanly and still come out wrong, such as a gantt with an empty axis:

```bash
node ~/.claude/skills/show-dont-tell/render-mermaid.mjs /tmp/<topic>/flow.mmd /tmp/<topic>/timeline.mmd
```

It writes a PNG beside each file, prints the parse error for any that fail, and needs the
network (run it with the sandbox disabled). Read each PNG. When the diagram belongs to a
draft, put the same `mermaid` block in the chat message too, so the user sees it without
opening the draft.

## Screenshots

When a change alters what a user sees, capture it rather than describe it. Take the same
view before and after: stash or check out `main` for the before, and hold a request open
with Playwright's `page.route` to catch a loading state. Look at each image yourself before
you claim anything about it.

Show them side by side, never stacked:

```markdown
| Before | After |
|:------:|:-----:|
| ![before](/Users/<you>/projects/drafts/<draft>-media/before.png) | ![after](/Users/<you>/projects/drafts/<draft>-media/after.png) |
```

Keep the files in `~/projects/drafts/<draft>-media/` when they belong to a draft, and in
`/tmp/<topic>/` otherwise. Embed by absolute path, which is the only form bb renders. For
posting to a PR, the `draft-pr-description` skill covers uploading with `--attach`.

### Filmstrips

When the problem happens over time, such as a flash of an empty state before content loads
or a screen that lands in the wrong place after a few steps, one screenshot can't show it.
Capture a filmstrip: a sequence of screenshots of the same view, in one row, each captioned
with the step or the time since the action started.

```markdown
| 0 ms: tap Reply | 120 ms | 480 ms | 900 ms: settled |
|:---:|:---:|:---:|:---:|
| ![](/tmp/<topic>/f1.png) | ![](/tmp/<topic>/f2.png) | ![](/tmp/<topic>/f3.png) | ![](/tmp/<topic>/f4.png) |
```

Use three to six frames, and keep only the ones where something changes. With Playwright,
take a screenshot after each step, or hold a request with `page.route` and capture before
and after releasing it, rather than sampling on a timer and hoping to catch the frame. For a
before and after of something that moves, put two filmstrips in rows labeled `Before` and
`After` so the frames line up.

For a quick look at a public URL, `node ~/.claude/tools/playwright/browse.mjs <url>
--screenshot /tmp/<topic>` is enough. For the app itself, use the repo's Storybook or dev
server, or the `run` skill.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| A dependency chain written as a paragraph | A flowchart, with the paragraph cut to the point it makes. |
| Timings in a table when the argument is about order or overlap | A gantt with before and after sections. |
| A diagram posted without rendering it | Run `render-mermaid.mjs` and read the PNG first. |
| Diagram and prose both carrying every detail | The diagram holds the detail; the prose says why it matters. |
| "The skeleton now matches the layout" with no image | Screenshot it, look at it, then say what the image shows. |
| Before and after screenshots stacked vertically | A two-column `Before` / `After` table. |
| Screenshots taken, then linked as a folder or left for `npm run storybook` | Embed the ones that answer the question at the top of the message. Link the rest below. |
| "Now that you can see them" with no image in the message | Put the images above that sentence. |
| Generic node labels such as "Service A" or "Step 2" | The real component, hook, or endpoint names. |
| A flash or a stuck state described in words, or shown in one screenshot | A filmstrip of the frames where it changes. |
| A review finding listing which cases work and which break in a paragraph | A scenario table with the broken row in bold. |
| A Mermaid diagram for a finding about one line of code | The annotated excerpt and a `diff` fix. |
