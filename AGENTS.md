# AGENTS.md

Agent skills, one per directory under `skills/`. Each skill is a `SKILL.md`
plus any helper files it references, and `~/.claude/skills/<name>` symlinks to
it here.

## Look for prior art on skills.sh first

Before writing or reworking a skill here, search [skills.sh](https://skills.sh/),
the public directory of agent skills, for ones that cover similar ground, and
read the most relevant. The point is to learn from how they handle the problem:
how they break the task into steps, what helper scripts they ship, which
mistakes they warn about. Do not install them with `npx skills add`; the skill
here is still our own.

Search from the CLI. Matching is loose, so try several short queries and skim
past unrelated hits:

```bash
npx -y skills find "<query>" < /dev/null
```

Each result is `<owner>/<repo>@<skill>` with an install count. Read a skill
from its GitHub repo rather than installing it:

```bash
gh api "repos/<owner>/<repo>/git/trees/HEAD?recursive=1" --jq '.tree[].path' | grep '<skill>/'
gh api "repos/<owner>/<repo>/contents/<path>/SKILL.md" --jq .content | base64 -d
```

Say what you found, and what you took from it, when you present the design.

## Push after you commit

A commit stays local until it is pushed, so work that looks finished in this
checkout is still invisible everywhere else. When you have been asked to
commit, push the branch in the same step rather than leaving the commit sitting
here.
