---
name: codebase-overview
description: Use when the user wants a high-level understanding of a codebase they don't know or are returning to, such as "give me an overview of this repo", "help me understand this codebase", "what is this project and how is it put together", or "map out this repo".
---

# Codebase overview

Write `OVERVIEW.md` at the repo root: a fast, high-level picture of what the
codebase is, what it's built with, how its parts connect, and how it's tested.
The user reads it while you write it, so fill it in one section at a time.

It should take a minute or two. Read manifests, config, CI files, and git
history, not source code. Open a source file only when config leaves a
specific question about how two parts connect, and read only as much of it as
answers that question. Do the work yourself in this thread, without subagents.

`OVERVIEW.md` is for the user only. It is never committed.

## 1. Write the skeleton

Before reading anything else, run:

```bash
cd "$(git rev-parse --show-toplevel)"
grep -qxF 'OVERVIEW.md' .git/info/exclude 2>/dev/null || echo 'OVERVIEW.md' >> "$(git rev-parse --git-path info/exclude)"
```

Then write `OVERVIEW.md` with this content, replacing an existing file:

```markdown
# <repo name> overview

_Generated <YYYY-MM-DD> from commit <short sha>._

_In progress…_

## Technologies
_In progress…_

## Systems diagram
_In progress…_

## Start here
_In progress…_

## Directory tree
_In progress…_

## Data model
_In progress…_

## Running locally
_In progress…_

## Tests
_In progress…_

## Recent activity
_In progress…_

## Open questions
_In progress…_
```

Tell the user in one line that the file is started, with a link to its
absolute path, so they can open it now.

## 2. Gather, in one parallel batch

Send these as parallel tool calls in a single message:

- `git ls-files | awk -F/ 'NF>1{print $1"/"$2} NF==1{print $1}' | sort | uniq -c | sort -k2`
  for the shape of the tree with file counts. It skips ignored files
  (`node_modules`, build output, local logs) without a list of exclusions.
- `git ls-files | grep -E '(^|/)(package\.json|pnpm-workspace\.yaml|go\.mod|Cargo\.toml|pyproject\.toml|requirements[^/]*\.txt|Gemfile|composer\.json|pom\.xml|build\.gradle[^/]*|mix\.exs|pubspec\.yaml|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|\.env\.example|\.env\.sample|Makefile|Procfile|mprocs[^/]*\.yaml|turbo\.json|nx\.json|firebase[^/]*\.json|fly\.toml|vercel\.json|netlify\.toml|app\.ya?ml|schema\.prisma|schema\.rb|[^/]*\.config\.[cm]?[jt]s)$' | grep -v -E '(^|/)(fixtures?|__fixtures__|testdata)/'`
  to find the manifests and config worth reading.
- `ls .github/workflows .circleci .gitlab-ci.yml 2>/dev/null`
- The README, top to bottom. Also `CLAUDE.md` or `AGENTS.md` if present: they
  often name the commands and the parts of the system.
- `git log -1 --format='%h %cs'`
- `git log --since=90.days --no-merges --name-only --format= | awk -F/ 'NF>1{print $1"/"$2} NF==1{print $1}' | sort | uniq -c | sort -rn | head -15`
- `git log --since=30.days --no-merges --format='%s' | head -40`

Then read the manifests and config the second call found, in one more
parallel batch. For a `package.json` in a monorepo, read `name`, `scripts`,
`dependencies`, and `devDependencies` with `jq` rather than the whole file. Read
each CI workflow far enough to see its jobs and the commands they run.

## 3. Fill in sections, saving after each

Fill in one section per Edit, made right after you write that section, so the
file changes ten times. Go cheapest first: the intro paragraph, Technologies,
Running locally, Tests, Recent activity, Directory tree, Start here, Data
model, Systems diagram, Open questions last.

Whenever you can't confirm something from what you read, write it as a
question under **Open questions** and leave it out of the section, or add
"(see Open questions)" where the detail belongs. Never write "unknown",
"unclear", or a guess presented as fact.

**Intro (under the title).** Two or three sentences: what the product does, who
uses it, and whether this is a monorepo, a single app, a library, or a
service. Take this from the README, not from the directory names.

**Technologies.** A table with columns Layer, Technology, and Where. Layers
are language, frameworks, data stores, infrastructure and hosting, and the
handful of libraries that shape how code gets written (state management, ORM,
API layer, styling). Give versions only when a manifest pins a major version.
Skip utility libraries.

**Systems diagram.** Box-and-arrow text in a fenced code block, drawn with
`┌ ─ ┐ │ └ ┘ ► ▼`, at most 100 characters wide. Boxes are things that run or
store data: apps, servers, workers, databases, caches, queues, and outside
services. Label each arrow with how they talk (HTTPS, WebSocket, SQL, queue,
SDK). Infer the boxes from workspace packages, `docker-compose` services,
deploy config, and env var names in `.env.example` (`DATABASE_URL`,
`REDIS_URL`, `SENTRY_DSN`, `STRIPE_SECRET_KEY`). Under the block, add one line
per box naming the directory it lives in.

```
┌──────────────┐  HTTPS   ┌──────────────┐   SQL   ┌────────────┐
│  web (Next)  │ ───────► │  api (Node)  │ ──────► │  Postgres  │
└──────────────┘          └──────┬───────┘         └────────────┘
                                 │ queue
                                 ▼
                          ┌──────────────┐  REST   ┌────────────┐
                          │    worker    │ ──────► │   Stripe   │
                          └──────────────┘         └────────────┘
```

Every arrow starts and ends on a box's edge. When a box would have more than
three outgoing arrows, group the outside services it calls into one box and
list their names inside it, one per line.

After saving the diagram, measure its widest line:

```bash
awk '/^## Systems diagram/{s=1} s&&/^```/{c++;next} s&&c==1' OVERVIEW.md | python3 -c 'import sys; print(max(len(l.rstrip("\n")) for l in sys.stdin))'
```

If the result is over 100, redraw it narrower (shorter labels, grouped boxes,
or stacked rows) and measure again.

**Start here.** 5 to 10 files to open first, each a link with one line on
what it shows: app entry points, the router or route table, the API
definition, the schema, the main server config. Find them from manifest
`main` and `bin` fields, framework conventions (`app/`, `pages/`, `src/main.*`,
`server/index.*`), and files the README or CLAUDE.md names. Confirm each path
exists in the `git ls-files` output before listing it.

**Directory tree.** A fenced block, two levels deep, three where a top-level
folder is a workspace root such as `packages/`. Put a short comment after each
folder that needs one. Skip folders whose purpose is obvious from their name
(`scripts/`, `docs/`, `.github/`) and folders with only a few files of no
consequence. Include file counts from the `git ls-files` output for the large
folders, so the user can see where the bulk of the code is.

**Data model.** If there is one schema file (`schema.prisma`, `schema.rb`,
a single `models.py`, SQL migrations, a Drizzle or Mongoose schema directory
with a few files), read it and list the main entities with one line each on
what they hold and how they relate. Skip join tables and audit tables. If the
models are spread across many files, list them by file name and add an open
question about how they relate instead of reading each one.

**Running locally.** The commands to install, set up, and start the app for
development, in order, taken from package scripts, the Makefile,
`docker-compose`, process-manager config such as `mprocs.yaml`, or the README.
List the environment variables `.env.example` names, grouped by what they
configure. Give names only, never values, and never read a real `.env`.

**Tests.** A table with columns Kind, Framework, Location, and Command, with
one row per kind of test (unit, integration, end-to-end, visual, lint and type
checks). Below it, list the CI workflows: what triggers each one and which of
those commands it runs.

**Recent activity.** The 5 to 10 areas with the most changes in the last 90
days, with change counts, then three to five bullets summarizing what the last
30 days of commit subjects say the team is working on. Name themes, not
individual commits.

**Open questions.** A numbered list of every question collected along the way,
each with a pointer to where the answer probably is ("`server/src/jobs/`
likely shows whether jobs run in-process"). Write "None" if there are none.

## 4. Finish

Reply with one line: the file's absolute path as a link, and how many open
questions it lists.

## Common mistakes

- **Filling in several sections in one Edit.** The user is watching the file.
  One section per Edit.
- **Reading source to fill in detail.** Ten source files turn a two-minute run
  into ten. When config doesn't answer it, it's an open question.
- **Restating the README.** The intro takes a sentence or two from it; the
  rest of the file describes structure the README leaves out.
- **Annotating every folder.** Notes go on folders whose name doesn't explain
  them.
- **Listing every dependency.** Technologies covers what shapes the code, not
  the lockfile.
- **Using Mermaid.** The diagram is plain text in a code block.
