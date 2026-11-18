---
name: frame
description: Use when a thread starts on a request that is vague, broad, or open-ended, such as "a design for X", "redesign Y", "we should support Z", a feature idea, or a complaint, before any shaping, design options, or code; when the user asks to frame something or asks "what's the problem here?"; and when a thread has run past its goal's estimate and needs to decide whether the work is still worth it.
argument-hint: [request-or-issue]
---

# Frame

Framing decides whether a request is worth working on, and how much. It comes before
shaping (working out a solution) and before building. The output is a short frame: the
problem, the outcome, and the appetite, agreed with the user.

The idea comes from Ryan Singer's work on Shape Up. In
[Framing](https://www.ryansinger.co/framing/) he describes it as "all about the problem and
the business value": the work "to challenge a problem," narrow it, and check that solving
it matters. A finished frame says: "if we can shape this into something doable and execute
within X weeks, that will be meaningful to us." It commits to shaping, not yet to building.

For agent threads, the time budget is turns, tokens, and minutes rather than weeks. A
thread with no appetite keeps taking on each new request until it has run several times
past its estimate. As Singer puts it in
[The cost of not shaping](https://www.ryansinger.co/the-cost-of-not-shaping/), "that time
isn't free."

## 1. Capture the source

Quote the request verbatim: the user's message, the issue body, and any comments or linked
threads that change what it asks for. Everything later in the frame has to trace back to
this material.

If the request points at existing code or a running product, look at the current behavior
before going further, so the problem describes what happens today rather than what you
assume happens.

## 2. Narrow the problem

Don't take the request at face value. Ask what is really going wrong, for whom, and at what
moment the current workflow breaks down. Shape Up's example: a request for complex
permission rules turned out to need a warning on one archive action, a one-day change
instead of a six-week project.

- **Grab-bags.** "Redesign", "v2", "clean up", or a message with several asks in it is not
  one problem. List the separate problems, pick the one to frame now, and say why. Note the
  others without ranking or scheduling them; they are "not now," not "never."
- **Solutions dressed as problems.** "Add a donut to the header" is a solution. Ask what the
  user can't see or do today that the donut would fix. Keep the proposed solution as an
  input to shaping, not as the problem.
- **Evidence, not inference.** Each line of the problem should point to something in the
  source. If a line is your inference, mark it as one. If you can't trace it at all, drop
  it.

Ask the user only what you can't answer from the source, the code, or the thread's history.
One or two questions, asked together.

## 3. Set the appetite

The appetite is how much the outcome is worth spending, chosen before anyone designs a
solution. It is not an estimate. Shape Up puts the difference this way: "Estimates start
with a design and end with a number. Appetites start with a number and end with a design."

Propose an appetite and let the user change it. Choosing it is the user's call, because it
says how much the outcome is worth to them.

- **Small batch:** a few turns, one sitting. Most fixes, single-screen changes, and skill
  edits.
- **Big batch:** a dozen or so turns, maybe across days. New features with a design round.
- **Bigger than that:** split the problem, or frame a smaller first outcome. Don't set an
  appetite the work can't be judged against.

Give the appetite in turns, tokens, and minutes, so it can become the thread goal's
estimate. Check what similar threads used: `bb tokenomics goal set` prints the history of
past threads that started the same way.

## 4. Draw the boundary (when needed)

If the problem and outcome could reasonably lead to the wrong kind of solution, add two
short lists:

- **Less about:** what this work is not trying to solve, and the obvious-but-wrong
  direction.
- **More about:** what kind of solution fits.

Skip this when nobody would head the wrong way.

## 5. Present the frame

Post the frame in chat in this form:

```markdown
## Frame: <short name>

**Source**
> <verbatim request>

**Problem**
- <what goes wrong, for whom, when> (source: <who said it, where>)

**Outcome**
- <what is different when this is solved, without naming a solution>

**Appetite:** <small or big batch>, about <N–M turns>, <tokens>, <minutes>

**Less about / More about** (optional)

**Not now:** <other problems from the request, one line each>
```

Ask for agreement above the composer with an Impromptu UI inline question: agree and shape
it, change the appetite, narrow further, or drop it. A frame can end in "not worth it now."
That is a good outcome, not a failure.

## 6. Record it

Once the user agrees:

- Set or refine the thread goal with the outcome as the goal text and the appetite as the
  estimate (`--turns`, `--tokens`, `--minutes`). The appetite is the circuit breaker the
  `shape` skill and later work check against.
- If the work is tied to a GitHub issue, offer to add the frame to the issue with the
  `draft-issue-description` skill.
- Move on to the `shape` skill. For a small-batch fix whose solution is already obvious,
  shaping can be a sentence; go straight to `work-on`.

## Reframing a thread that ran long

When a thread is past its goal's estimate, `bb tokenomics goal show` reports "past
estimate". Stop taking new requests and reframe:

1. List what the thread has done, and what is left, against the frame's outcome.
2. Ask whether the remaining work serves the original outcome or a new one. New requests
   that crept in often belong to a different problem.
3. Offer the user three choices: ship what is done and cut the rest, set a new appetite for
   the remaining work, or split the new problem into its own thread.

Extending the appetite is the user's decision, made out loud. Don't keep working past it by
default.

## What framing doesn't do

- It doesn't design the solution. Proposed solutions from the source are inputs to `shape`.
- It doesn't plan the other problems it set aside.
- It doesn't summarize the conversation. The source is quoted; the rest is a distillation.
