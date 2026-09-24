# Writing the issue

Follow the house style in the `## Writing` and `## GitHub Issues` sections of
`~/.claude/CLAUDE.md`. This repo documents no issue format, so the format lives here.

## The format

**No headings by default.** An issue body is prose, then optional bullets, then the
`**Done is:**` block. Most issues are short enough that a heading only breaks up two
paragraphs. Use headings when an issue is long enough that the reader needs them to find
their way through it.

The shape, in order:

1. **Prose.** One to three short paragraphs. What exists now, why it matters, what is
   believed and on what basis. Lead with the thing that is wrong or unowned, not with
   background.
2. **Bullets, only if they earn it.** Considerations, scope, or the specific unknowns.
   Skip them when the prose already carries it.
3. **`**Done is:**`** followed by a blank line and a short bulleted list of concrete,
   verifiable completion criteria.

Every code reference is a link, using the SHA-pinned permalinks from `permalink.sh`, inline
on the symbol or path rather than as a footnote. Link only what you generated a permalink
for. A name with no permalink stays a plain backticked name: pointing it at a file that does
not contain it is worse than not linking it.

An issue is usually shorter than you expect. Two paragraphs and three criteria is a normal,
good issue in this repository. Length is not thoroughness.

## Worked example

This is the target, in full:

> [`useLegacyLoader`](https://github.com/acme/widgets/blob/1a2b3c4/client/hooks/legacy-loader.ts#L22) reads the `loaded` instance property and calls the legacy `loader.runLoader` when it is falsy, gating render until the loader finishes. [`client/pages/settings.tsx`](https://github.com/acme/widgets/blob/1a2b3c4/client/pages/settings.tsx#L106) is its only caller.
>
> It seems like we might be able to remove it now. The only path it exercises is [`settingsLoaderAsync`](https://github.com/acme/widgets/blob/1a2b3c4/server/loaders/settings-loader.ts), and everything that writes already has another writer or no reader. If that holds up, removing the hook takes the last client caller of `loader.runLoader`. Work out whether it really does, and what the render gate should become in its place.
>
> **Done is:**
>
> - A recorded answer on whether `useLegacyLoader` can go, and if not, what still depends on it.
> - If it can, the hook is gone, no client code calls `loader.runLoader`, and the settings page still loads whether or not setup is complete.

Note what it does: states the code as fact, then the hypothesis as a hypothesis ("It seems
like we might be able to"), then hands the reader the actual question. The criteria allow
for the answer being no.

## Rules

State each thing once, in as few words as carry it. A sentence needing three subordinate
clauses is two sentences.

Where something is a hypothesis, keep it a hypothesis. Do not promote "it
looks like X" into "X". An issue that overstates its own confidence sends someone down the
wrong path.

Write completion criteria from your `Done is` answers. Where the work is an investigation, a
recorded answer is a legitimate criterion. Criteria are about code and answers: never make
updating a tracking document or inventory a criterion.

Give a figure the provenance it needs to be believed, in one clause. Never mention a
correction to an earlier analysis.

Claim only what you confirmed by reading the code or what the trigger states.

## Output

The file holds raw markdown, ready to post: no wrapping code fence, no preamble, no title
line, no closing summary. The title goes to `gh issue create`, not the file.
