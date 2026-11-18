---
name: shape
description: Use after a frame is agreed and before building, to work out a solution that fits the appetite, such as "shape this", "how should we approach this", "what are our options", or when a framed request moves toward design or code; also when a build keeps surfacing unanswered questions or scope keeps growing, which means the work was not shaped enough.
argument-hint: [frame-or-topic]
---

# Shape

Shaping works out a solution to a framed problem at the right level of detail: concrete
enough that building it holds no big surprises, rough enough that the details are left to
the build. The output is a package: the problem, the solution's main elements, the rabbit
holes already dealt with, what is out, and the appetite it has to fit.

The idea comes from Ryan Singer's Shape Up. In
[What's the right level of detail when shaping?](https://www.ryansinger.co/whats-the-right-level-of-detail-when-shaping/)
he separates the two steps: a frame is for deciding the work is worth doing, and shaping is
for the mechanics, with "more diagrams, dataflow, and explanation of how the pieces
connect." Work is shaped enough when the mechanics are proven ("Prove it out"), the
boundaries of what we're doing and not doing are explicit, and the builder can start with
confidence.

If there is no agreed frame, use the `frame` skill first. Shaping without an appetite has
nothing to cut against.

## The package finishes the thread goal

`frame` sets the thread goal's text and estimate, with placeholder "Done is" entries.
Shaping replaces the placeholders with the real list:

| Package | Thread goal |
|---------|-------------|
| Scope pieces (must-haves) | One "Done is" entry each, written as an end state |
| Nice-to-haves (`~`) | Left off the list; added with `goal entry add` only if they get built |
| Appetite | The estimate, unchanged |
| No-gos | The `--reason` on the refine, so the goal's history records what was cut |

So shape the scope into pieces that read as end states someone could check, such as
"Archive warns when members are active", and keep the must-haves to what fits the
tokenomics guide's limit (five entries at low detail). More pieces than that means the
shape is too big for the appetite, or the pieces need grouping.

## 1. Restate the frame and list requirements

Start from the frame's problem, outcome, and appetite. Turn the outcome into a short,
numbered list of requirements (R0, R1, ...): what any solution has to do, without saying
how. R0 is the core goal. Mark each as must-have or nice-to-have. Keep it to nine or fewer;
group related ones if there are more.

## 2. Read the current system

Read the code, screens, or documents the change would touch, and note what you find with
`file:line` references. Call the existing system CURRENT. You may find it already meets
some requirements, or that a small change to CURRENT is a shape of its own.

## 3. Sketch shapes

Sketch two or three different approaches (A, B, C), each with a short title that says what
it does, such as "B: Warn on archive instead of new permissions". Each shape is a table of
parts, and each part is a mechanism: something to build or change, not a wish.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | Show a confirm dialog in `archive()` when the project has active members | |
| B2 | Count active members from the existing membership query | ⚠️ |

A ⚠️ flag means you can say what the part does but not yet how. Keep the shapes at the
level of the main pieces and how they connect:

- **Interfaces:** sketch places, the things a user can do in each, and how they move
  between them (a breadboard), or a rough layout in text. Not mockups. Visual direction is
  for the `iterate-design` skill once the shape is chosen.
- **Code and data:** name the modules, data, and calls involved, and how data flows
  between them. A short diagram helps when more than three pieces connect.

## 4. Check fit

Compare the shapes against the requirements in one table. Each cell is ✅ or ❌, with no
third value. A flagged part can't earn a ✅, because a ✅ claims you know how the shape
meets the requirement.

| Req | Requirement | Status | A | B |
|-----|-------------|--------|---|---|
| R0 | Members don't lose access to projects they still use | Core goal | ✅ | ✅ |
| R1 | Fits a small batch | Must-have | ❌ | ✅ |

Explain each ❌ in one line under the table. If a shape passes every row but still feels
wrong, a requirement is missing: write it down and check again.

Recommend one shape. Compare cost against the appetite, not against an estimate of
perfection. The best shape is often the one that does less.

## 5. Deal with rabbit holes

A rabbit hole is an unknown that could swallow the appetite: an unclear mechanism, an
edge case nobody has decided, a dependency on code nobody has read, a technical approach
nobody has tried. Go through the chosen shape and look for them.

For each one, pick one way out before building starts:

- **Spike it.** Read the code, run a quick experiment, or build a throwaway prototype until
  you can describe how the part works. Write down what the spike found.
- **Decide it.** Pick the simple answer and write it down, such as "imported items keep
  their original dates."
- **Cut it.** Move it to the no-gos.

The chosen shape should have no ⚠️ flags left when you hand it off.

## 6. Set no-gos and scope

- **No-gos:** what the package deliberately leaves out to fit the appetite. Name the
  features, edge cases, and polish that are out. Requests that arrive during the build and
  match a no-go get pointed back to this list.
- **Scope:** group the work into a few pieces that can each be finished and shown on their
  own, not into layers such as "backend" and "frontend". Mark nice-to-haves with `~`. When
  time runs short, they are the first to go.

## 7. Present the package

Post the package in chat:

```markdown
## Shaped: <name>

**Problem:** <one or two lines from the frame>
**Appetite:** <from the frame>

**Solution: <shape letter and title>**
<parts table, and the breadboard or diagram>

**Fit check:** <the table, chosen shape and the runners-up>

**Rabbit holes**
- <unknown> → <spiked: what we found | decided: answer | cut>

**No-gos**
- <out of scope>

**Scope**
1. <piece> 2. <piece> 3. ~<nice-to-have>

**Thread goal after this**
- Done is: Frame agreed ✓ → Shaped ✓ → <piece 1> → <piece 2> → <entry that ends the thread>
- Estimate: <the frame's appetite, unchanged>
```

Ask for approval above the composer with an Impromptu UI inline question: build it, pick a
different shape, change what's cut, or reframe.

## 8. Hand off and set the circuit breaker

Once the user approves:

- Rewrite the goal's list from the package. Keep the goal text and leave the estimate
  flags out, so the appetite stays as `frame` set it:

  ```bash
  bb tokenomics goal refine \
    --stage "Frame agreed" --stage "Shaped" \
    --stage "<piece 1 as an end state>" --stage "<piece 2 as an end state>" \
    --stage "<entry that ends the thread>" \
    --reached 2 --reason "Shaped as <shape title>. No-gos: <cut items>"
  ```

  If the chosen shape can't fit the appetite even after cutting, don't stretch the estimate
  here. Go back to `frame` and ask the user for a bigger appetite or a smaller outcome.
- Build with `work-on`, or `iterate-design` first if a piece needs a visual direction.
- Mark entries as pieces finish (`goal entry done N`), and check `bb tokenomics goal show`
  at the end of each round. When it reports the thread past its estimate with entries
  left, stop. Show what is done, what is left, and what you would cut.
  Ask the user to ship what's done, cut more scope, or reframe with the `frame` skill. Don't
  extend the appetite by continuing to work.
- When feedback during the build asks for something new, check it against the no-gos and
  the requirements. If it is outside them, say so and offer to frame it separately instead
  of folding it in.

## What shaping doesn't do

- It doesn't decide whether the problem is worth solving. That is the frame's job.
- It doesn't produce mockups, task lists, or a full spec. Details that don't change the
  shape are left to the build.
- It doesn't estimate. The appetite is fixed; the scope bends to fit it.
