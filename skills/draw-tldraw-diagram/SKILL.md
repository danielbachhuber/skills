---
name: draw-tldraw-diagram
description: Use when a blog post, essay, or document needs a hand-drawn-style explanatory diagram as a PNG, such as a flow with a bottleneck, a dependency graph, or a before and after comparison, or when the user asks to draw, sketch, or diagram something with tldraw, or to re-export a .tldr file they edited.
---

# Draw a tldraw diagram

`render.mjs` in this folder draws with the real tldraw SDK in headless Chrome. You
write a small JSON spec of shapes and arrows; it writes a PNG and a `.tldr` file
that opens in tldraw for hand editing. Once a `.tldr` exists, it is the source:
re-render from it, not from the spec.

```bash
node ~/.claude/skills/draw-tldraw-diagram/render.mjs /tmp/<name>.json --out <dir>/<name>.png
node ~/.claude/skills/draw-tldraw-diagram/render.mjs <dir>/<name>.tldr --out <dir>/<name>.png
```

Run it with the sandbox disabled: tldraw loads its fonts from its CDN, and the first
run installs tldraw and Playwright into this folder. It uses Google Chrome. Options:
`--transparent` (default is a white background), `--tldr <path>` (default is next to
the PNG), `--pixel-ratio` (default 2), `--padding` (default 32).

## The spec

```json
{
  "defaults": { "font": "draw", "size": "m", "fill": "semi", "color": "grey" },
  "shapes": [
    { "id": "build",  "x": 0,   "y": 0, "w": 140, "h": 100, "text": "Build", "color": "blue" },
    { "id": "review", "x": 200, "y": 0, "w": 140, "h": 100, "text": "Code review", "color": "red", "fill": "solid" },
    { "from": "build", "to": "review", "text": "", "dash": "dashed" },
    { "id": "note", "type": "text", "x": 0, "y": 130, "w": 340, "align": "middle", "text": "Caption" }
  ]
}
```

- `type: "line"` takes `points`, `[x, y]` pairs relative to its `x`/`y`, for axes,
  gridlines, and data lines in a hand-drawn chart. `dash: "draw"` smooths the corners;
  `solid` keeps them sharp. Map data to coordinates in a script rather than by hand.
- Shapes are `geo` unless `type` is `text`, `note`, `line`, or `frame`. `geo` takes `geo`
  (`rectangle`, `ellipse`, `diamond`, `cloud`, `oval`, `hexagon`, `x-box`, `check-box`, ...).
  A `note` is a sticky note fixed at about 200×200 that ignores `w` and `h`; use a
  `geo` box when you need a smaller callout.
- `\n` in `text` forces a line break. Use it to keep a word from wrapping alone.
- An item with `from` and `to` is an arrow bound to those shape ids. Optional: `text`,
  `bend` (curve, in px), `kind: "elbow"`, `arrowheadStart`, `fromAnchor`/`toAnchor`
  (`{"x":0..1,"y":0..1}`).
- Styles on any shape or in `defaults`: `color` (`black`, `grey`, `blue`, `light-blue`,
  `violet`, `light-violet`, `red`, `light-red`, `orange`, `yellow`, `green`,
  `light-green`, `white`), `fill` (`none`, `semi`, `solid`, `pattern`), `dash`
  (`draw`, `solid`, `dashed`, `dotted`), `size` (`s`, `m`, `l`, `xl`), `font` (`draw`,
  `sans`, `serif`, `mono`). Also `rotation` (radians), `parent` (a frame id; then `x`/`y`
  are relative to the frame), and `props` for raw tldraw props.
- Mark shapes that overlap on purpose, such as a pile of cards, with `"overlapOk": true`.
- Later shapes draw on top of earlier ones.

## Size for a blog

danielbachhuber.com's text column is about 680px wide, so the image is shown at
roughly that width. Keep the drawing 700 to 1000 units wide and use text size `m` or
larger; `s` only reads well when the drawing is under 700 wide. The default pixel
ratio of 2 gives a 1400 to 2000px PNG, sharp on high-density screens. If the drawing
is wider than 1000, break it into two rows or two diagrams.

## Steps

1. Lay out on a grid: boxes of one size, even gaps (about 60 units), one main
   direction. A box with a two-word label needs about 140×100 at size `m`.
2. Write the spec to `/tmp/<name>.json` and render to `/tmp/<name>.png` while you
   iterate.
3. Fix every line under "Layout problems" in the output. A clean run prints "No
   overlapping shapes or overflowing labels found." "tldraw grew it" means the
   label didn't fit, so make the box bigger or the label shorter.
4. Read the PNG and look at it. Check for: labels cut off or hidden under another
   shape, a single word wrapped onto its own line, arrows crossing labels or
   unrelated shapes, cramped or uneven gaps, anything too small to read at 680px wide.
   Fix the spec, re-render, and Read again until none remain.
5. Move both files into place under one descriptive kebab-case name that says what
   the diagram shows, such as `review-bottleneck`, not `diagram-1`. For a Hugo post
   that is `content/posts/<slug>/images/<name>.png` and `<name>.tldr` side by side.
   Render the final version there with `--out`, which writes both files.
6. Give the user the Markdown line with alt text that says what the diagram shows,
   not what it is, and the PNG embedded by absolute path so they can see it:

   ```markdown
   ![Five stages from plan to ship, with a pile of pull requests stacked up waiting at code review](images/review-bottleneck.png)
   ```

## Editing by hand later

Open the `.tldr` on [tldraw.com](https://www.tldraw.com) (main menu, Open file) or with
the tldraw VS Code extension, edit, save it back over the same file, then re-render
from the `.tldr` (second command above).

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Reporting the diagram without looking at the PNG | Read it every render. The layout check misses arrows through labels and orphaned words. |
| Fonts look like a system font | Fonts failed to load: re-run with the sandbox disabled. |
| Editing the spec after the user changed the `.tldr` by hand | Their edits only live in the `.tldr`. Render from it. |
| Text too small on the blog | Drawing too wide. Narrow it or use size `m`+. |
