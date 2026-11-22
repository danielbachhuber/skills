---
name: shape
description: Use when a thread starts on a request that is vague, broad, or open-ended, such as "a design for X", "redesign Y", "we should support Z", a feature idea, or a complaint, before any design options or code; when the user asks to shape or frame something, or asks "what's the problem here?" or "how should we approach this?"; when a build keeps surfacing unanswered questions or scope keeps growing; and when a thread has run past its goal's estimate and needs to decide whether the work is still worth it.
argument-hint: [request-or-issue]
---

# Shape

Shaping takes a request from "someone asked for something" to work that is ready to build.
It starts with the problem: what is really going wrong, whether solving it is worth the
time, and how much time it is worth. Then it works out a solution concrete enough that
building it holds no big surprises, and rough enough that the details are left to the
build. It ends with a spec: the behaviors the work must have, and how each one will be
checked.

The problem statement drives everything after it. Every requirement traces to it, every
shape is judged against it, and when a shape shows the problem was stated wrong, you go
back and fix the problem statement instead of forcing a shape to fit.

The method comes from Ryan Singer's Shape Up. In
[Framing](https://www.ryansinger.co/framing/) he describes the first half as the work "to
challenge a problem," narrow it, and check that solving it matters. In
[What's the right level of detail when shaping?](https://www.ryansinger.co/whats-the-right-level-of-detail-when-shaping/)
he describes the second half: work is shaped enough when the mechanics are proven, the
boundaries of what we're doing and not doing are explicit, and the builder can start with
confidence.

For agent threads, the time budget is turns, tokens, and minutes rather than weeks. A
thread with no appetite keeps taking on each new request until it has run several times
past its estimate. As Singer puts it in
[The cost of not shaping](https://www.ryansinger.co/the-cost-of-not-shaping/), "that time
isn't free."

## Where the work lives

Write the shaping document to `$BB_THREAD_STORAGE/shape.md` and keep it current as you go.
Post each section in chat when you reach a checkpoint, but the file is the version of
record: later steps read from it, and revisions edit it rather than reposting from
memory. When you revise a table, post the whole table again and mark the rows that
changed with 🟡.

The document becomes the thread goal (`bb tokenomics goal`):

| Shaping document | Thread goal |
|------------------|-------------|
| Outcome | The goal text, in one sentence |
| Appetite | The estimate: `--turns`, `--tokens`, `--minutes` |
| Scope pieces | One "Done is" entry each, written as an end state |
| No-gos | The `--reason` on the refine, so the goal's history records what was cut |
| "Not worth it now" | The goal closed as `not` |

## 1. Capture the source

Quote the request verbatim: the user's message, the issue body, and any comments or linked
threads that change what it asks for. Everything later has to trace back to this material.

If the request points at existing code or a running product, look at the current behavior
before going further, so the problem describes what happens today rather than what you
assume happens.

## 2. Narrow the problem

Don't take the request at face value. Ask what is really going wrong, for whom, and at what
moment the current workflow breaks down. Shape Up's example: a request for complex
permission rules turned out to need a warning on one archive action, a one-day change
instead of a six-week project.

- **Grab-bags.** "Redesign", "v2", "clean up", or a message with several asks in it is not
  one problem. List the separate problems with who each one affects and how strong the
  signal is: did several people raise it, or did one mention it and nobody pick it up? Pick
  the one to shape now and say why. Note the others without ranking or scheduling them;
  they are "not now," not "never."
- **Solutions dressed as problems.** "Add a donut to the header" is a solution. Ask what the
  user can't see or do today that the donut would fix. Keep the proposed solution as one
  shape to consider in step 5, not as the problem.
- **Evidence, not inference.** Each line of the problem should point to something in the
  source. If a line is your inference, mark it as one. If you can't trace it at all, drop
  it.

Ask the user only what you can't answer from the source, the code, or the thread's history.
One or two questions, asked together.

## 3. Set the outcome and appetite

The **outcome** is what is different when the problem is solved, without naming a
solution. It has to fit in one sentence, because it becomes the goal text.

The **appetite** is how much the outcome is worth spending, chosen before anyone designs a
solution. It is not an estimate. Shape Up: "Estimates start with a design and end with a
number. Appetites start with a number and end with a design." Propose one and let the user
change it; choosing it is their call.

- **Small batch:** a few turns, one sitting. Most fixes, single-screen changes, and skill
  edits.
- **Big batch:** a dozen or so turns, maybe across days. New features with a design round.
- **Bigger than that:** split the problem, or pick a smaller first outcome.

Give the appetite in turns, tokens, and minutes. `bb tokenomics goal set` prints what past
threads that started the same way used.

If the problem and outcome could lead someone to the wrong kind of solution, add two short
lists: **Less about** (what this is not trying to solve, and the obvious-but-wrong
direction) and **More about** (what kind of solution fits). Skip them when nobody would
head the wrong way.

### Checkpoint: is it worth it?

Post the problem, outcome, appetite, and "not now" list, and ask above the composer with an
Impromptu UI inline question: shape it, change the appetite, narrow further, or drop it.
"Not worth it now" is a good outcome, not a failure: close the goal with
`bb tokenomics goal close not --note "<why>"` and stop.

Once the user agrees, record the goal. Most threads already have one from their first
response, so replace it with `refine`:

```bash
bb tokenomics goal refine "<outcome in one sentence>" \
  --stage "Problem and appetite agreed" --stage "Shaped" \
  --stage "<end state of the work>" --stage "<entry that ends the thread>" \
  --turns 4-10 --tokens 5M-20M --minutes 30-90 \
  --reached 1 --reason "Problem: <a few words>, appetite <small|big> batch"
```

Use `goal set ... --by agent` instead when the thread has no goal yet. The middle entries
are placeholders that step 8 replaces. When the user will review what gets made, the last
entry is their acceptance, such as "Refined on your feedback."

**Small batch with an obvious fix:** write the real end states now, leave out "Shaped",
write the spec in step 7 as a few lines, and go to `work-on`. Steps 4 to 6 can be a
sentence each.

## 4. List requirements and read the current system

Turn the outcome into a numbered list of requirements (R0, R1, ...): what any solution has
to do, without saying how. R0 is the core goal. Mark each as must-have or nice-to-have.
Keep it to nine or fewer; group related ones if there are more.

Read the code, screens, or documents the change would touch, and note what you find with
`file:line` references. Call the existing system CURRENT. It may already meet some
requirements, or a small change to CURRENT may be a shape of its own.

## 5. Sketch shapes and check fit

Sketch two or three different approaches (A, B, C), each with a short title that says what
it does, such as "B: Warn on archive instead of new permissions". Each shape is a table of
parts, and each part is a mechanism: something to build or change, not a wish.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | Show a confirm dialog in `archive()` when the project has active members | |
| B2 | Count active members from the existing membership query | ⚠️ |

- A ⚠️ flag means you can say what the part does but not yet how.
- A part must add information its requirement doesn't. "R2: users can undo" with "B3: add
  undo" is a restatement, not a mechanism.
- Cut parts as vertical slices through the system, not as layers such as "backend" and
  "frontend".

Keep shapes at the level of the main pieces and how they connect. For interfaces, sketch a
breadboard: a table of places, the affordances in each (what a user can do there), and
where each affordance leads. The tables are the source of truth; any drawing is made from
them. Not mockups: visual direction is for the `iterate-design` skill once the shape is
chosen. For code and data, name the modules, data, and calls involved, and how data flows
between them.

Then compare the shapes against the requirements in one table. Each cell is ✅ or ❌, with
no third value. A flagged part can't earn a ✅, because a ✅ claims you know how the shape
meets the requirement.

| Req | Requirement | Status | A | B |
|-----|-------------|--------|---|---|
| R0 | Members don't lose access to projects they still use | Core goal | ✅ | ✅ |
| R1 | Fits a small batch | Must-have | ❌ | ✅ |

Explain each ❌ in one line under the table. Recommend one shape, comparing cost against
the appetite rather than against perfection. The best shape is often the one that does
less.

**When the fit check teaches you something about the problem,** go back. A shape that
passes every row but still feels wrong means a requirement is missing. A requirement no
shape can meet within the appetite may mean the problem is stated too broadly. Edit the
problem or requirements in `shape.md`, mark what changed, and run the fit check again.

## 6. Deal with rabbit holes, then set no-gos and scope

A rabbit hole is an unknown that could swallow the appetite: an unclear mechanism, an edge
case nobody has decided, a dependency on code nobody has read. For each one in the chosen
shape, pick one way out before building starts:

- **Spike it.** Read the code, run a quick experiment, or build a throwaway prototype until
  you can describe how the part works. Write down what you found.
- **Decide it.** Pick the simple answer and write it down, such as "imported items keep
  their original dates."
- **Cut it.** Move it to the no-gos.

The chosen shape should have no ⚠️ flags left.

- **No-gos:** what the work deliberately leaves out to fit the appetite. Requests that
  arrive during the build and match a no-go get pointed back to this list.
- **Scope:** group the work into a few pieces that can each be finished and shown on their
  own. Mark nice-to-haves with `~`; they are the first to go. Write each must-have as an
  end state someone could check, such as "Archive warns when members are active", and
  keep to five or fewer. More than that means the shape is too big for the appetite.

## 7. Write the spec

The spec says what the built work must do and how each behavior will be checked. It is the
only plan the build gets: no task lists, no code, no step-by-step instructions. How to
build it is left to the build.

Write it as one table in `shape.md`:

| # | Behavior | Req | Check |
|---|----------|-----|-------|
| 1 | Archiving a project with active members shows "3 members are still active" and a Cancel button | R0 | `archive.test.ts` › "warns when members are active" |
| 2 | Archiving a project with no active members archives it with no dialog | R0 | `archive.test.ts` › "archives silently when empty" |
| 3 | The dialog matches the shaped breadboard | R1 | Screenshot of the dialog in the PR |

- **Exact values.** "Returns 404 with `{error: "not_found"}`", not "handles errors". A
  behavior a reviewer can't check is a wish.
- **One check per behavior,** naming the single test (file and test name) or the screenshot
  that proves it. A whole suite passing doesn't settle any one behavior. Use test commands
  the repo already has; don't invent them.
- **What must not change.** Add rows for existing behavior the change could break.
- **Gaps.** Look for the few failure cases the shape implies but no row covers (an empty
  list, a second click, a missing permission), and add a row for the ones a user is most
  likely to hit.

Keep the spec to one screen. If it won't fit, the shape is too big for the appetite: cut
scope rather than growing the spec.

During the build, the checks become tests, and the table becomes the verification section
of the PR description, with each row's result and evidence. When the build finds a
behavior the spec missed, add a row and its test; don't quietly drop a row.

## 8. Present the package and hand off

Post the package in chat, from `shape.md`:

```markdown
## Shaped: <name>

**Problem:** <one or two lines>
**Appetite:** <small or big batch, turns, tokens, minutes>

**Solution: <shape letter and title>**
<parts table, and the breadboard>

**Fit check:** <the table, chosen shape and the runners-up>

**Rabbit holes**
- <unknown> → <spiked: what we found | decided: answer | cut>

**No-gos**
- <out of scope>

**Scope**
1. <piece> 2. <piece> 3. ~<nice-to-have>

**Spec**
<the behavior table>
```

Ask for approval above the composer with an Impromptu UI inline question: build it, pick a
different shape, change what's cut, or rethink the problem.

Once the user approves, rewrite the goal's list from the scope. Keep the goal text and
leave the estimate flags out, so the appetite stays as agreed:

```bash
bb tokenomics goal refine \
  --stage "Problem and appetite agreed" --stage "Shaped" \
  --stage "<piece 1 as an end state>" --stage "<piece 2 as an end state>" \
  --stage "<entry that ends the thread>" \
  --reached 2 --reason "Shaped as <shape title>. No-gos: <cut items>"
```

If the chosen shape can't fit the appetite even after cutting, don't stretch the estimate
here. Go back to step 3 and ask the user for a bigger appetite or a smaller outcome.

Then:

- If the work is tied to a GitHub issue, offer to add the problem and package to it with
  the `draft-issue-description` skill.
- Build with `work-on`, passing it `shape.md`. Use `iterate-design` first if a piece needs a
  visual direction.

## During the build: the circuit breaker

- Mark entries as pieces finish (`goal entry done N`), and check `bb tokenomics goal show`
  at the end of each round.
- When feedback asks for something new, check it against the no-gos and requirements. If it
  is outside them, say so and offer to shape it separately instead of folding it in.
- When `goal show` reports "past estimate", stop taking new requests and re-plan:
  1. List what the thread has done, and what is left, against the outcome.
  2. Ask whether the remaining work serves the original outcome or a new one. Requests that
     crept in often belong to a different problem.
  3. Offer three choices, each of which changes the goal:
     - **Ship what is done and cut the rest:** `goal entry drop N` for the cut entries,
       then finish and close the goal as `met` or `partly`.
     - **Set a new appetite for the remaining work:** `goal estimate` with the new numbers,
       or `goal refine` if the outcome changed too, with a `--reason` that says what grew.
     - **Split the new problem into its own thread,** shaped on its own.

  Extending the appetite is the user's decision, made out loud. Don't keep working past it
  by default.

## What shaping doesn't do

- It doesn't produce mockups, task lists, or code. Details that don't change the shape are
  left to the build.
- It doesn't estimate. The appetite is fixed; the scope bends to fit it.
- It doesn't plan the problems it set aside.
