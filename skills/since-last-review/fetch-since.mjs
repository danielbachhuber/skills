#!/usr/bin/env node
// Save what changed on a pull request since the user last reviewed it.
//
// Usage: node fetch-since.mjs <owner/repo> <number> <workdir> [--since <ISO time | commit SHA>] [--user <login>]
//
// Writes into <workdir>:
//   pr.json        PR metadata, plus the PR's own files
//   since.json     when the user last reviewed, the commit the branch was at then
//                  (the baseline) and how it was found, the head now, and the commits
//                  in between with the files each touched
//   since.diff     the diff from the baseline to the head
//   comments.json  the user's review threads, review bodies, and conversation comments,
//                  plus other people's conversation comments since the review
//
// Nothing is checked out. Needs the network (gh).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const sinceArg = flag("--since");
const userArg = flag("--user");
const [repo, number, dir] = args;
if (!repo || !number || !dir) {
  console.error("usage: node fetch-since.mjs <owner/repo> <number> <workdir> [--since <ISO time | SHA>] [--user <login>]");
  process.exit(2);
}
const [owner, name] = repo.split("/");
mkdirSync(dir, { recursive: true });

const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 1 << 28 });
const ghJson = (...a) => JSON.parse(gh(...a));
// gh api --paginate prints one JSON array per page; --slurp joins them.
const ghPages = (path) => ghJson("api", "--paginate", "--slurp", path).flat();
const graphql = (query, vars = {}) => {
  const a = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) a.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  return ghJson(...a).data;
};

const login = userArg ?? gh("api", "user", "--jq", ".login").trim();
const pr = ghJson("pr", "view", number, "--repo", repo, "--json",
  "number,title,url,author,state,isDraft,headRefName,baseRefName,headRefOid,baseRefOid");
const prFiles = ghPages(`repos/${repo}/pulls/${number}/files?per_page=100`)
  .map((f) => ({ path: f.filename, previous: f.previous_filename ?? null, status: f.status }));
pr.files = prFiles;
const prPaths = new Set(prFiles.flatMap((f) => [f.path, f.previous].filter(Boolean)));

// ---- The user's activity -------------------------------------------------

const reviews = ghPages(`repos/${repo}/pulls/${number}/reviews?per_page=100`);
const issueComments = ghPages(`repos/${repo}/issues/${number}/comments?per_page=100`);

const threads = [];
let cursor = null;
do {
  const data = graphql(`query($o:String!,$r:String!,$n:Int!,$c:String){repository(owner:$o,name:$r){pullRequest(number:$n){
    reviewThreads(first:50,after:$c){pageInfo{hasNextPage endCursor} nodes{
      id isResolved isOutdated path line originalLine startLine originalStartLine resolvedBy{login}
      comments(first:100){nodes{databaseId author{login} body createdAt url diffHunk
        originalCommit{oid} commit{oid}}}}}}}}`,
    { o: owner, r: name, n: Number(number), ...(cursor ? { c: cursor } : {}) });
  const page = data.repository.pullRequest.reviewThreads;
  threads.push(...page.nodes);
  cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (cursor);

const mine = (c) => c.author?.login === login;
const myThreads = threads.filter((t) => t.comments.nodes.some(mine));
const myReviews = reviews.filter((r) => r.user?.login === login && r.submitted_at);
const myIssueComments = issueComments.filter((c) => c.user?.login === login);

const activityTimes = [
  ...myReviews.map((r) => r.submitted_at),
  ...myThreads.flatMap((t) => t.comments.nodes.filter(mine).map((c) => c.createdAt)),
  ...myIssueComments.map((c) => c.created_at),
].sort();
const lastActivityAt = activityTimes.at(-1) ?? null;

// ---- Commits and force pushes -------------------------------------------

const prCommits = ghPages(`repos/${repo}/pulls/${number}/commits?per_page=100`).map((c) => ({
  sha: c.sha,
  parents: c.parents.map((p) => p.sha),
  date: c.commit.committer.date,
  authoredAt: c.commit.author.date,
  author: c.author?.login ?? c.commit.author.name,
  headline: c.commit.message.split("\n")[0],
}));
const bySha = new Map(prCommits.map((c) => [c.sha, c]));

const forcePushes = [];
cursor = null;
do {
  const data = graphql(`query($o:String!,$r:String!,$n:Int!,$c:String){repository(owner:$o,name:$r){pullRequest(number:$n){
    timelineItems(first:100,after:$c,itemTypes:[HEAD_REF_FORCE_PUSHED_EVENT]){pageInfo{hasNextPage endCursor}
      nodes{... on HeadRefForcePushedEvent{createdAt actor{login} beforeCommit{oid} afterCommit{oid}}}}}}}`,
    { o: owner, r: name, n: Number(number), ...(cursor ? { c: cursor } : {}) });
  const page = data.repository.pullRequest.timelineItems;
  forcePushes.push(...page.nodes.map((e) => ({
    at: e.createdAt, by: e.actor?.login ?? null,
    before: e.beforeCommit?.oid ?? null, after: e.afterCommit?.oid ?? null,
  })));
  cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (cursor);

// ---- The baseline: where the branch was when the user last reviewed --------
//
// A review's commit_id is not the head at the time: a reply in an older thread is
// recorded against that thread's commit. So:
//  - after a force push, the head just before the first force push after the review;
//  - otherwise, on the head's first-parent chain, the newest commit committed by the
//    time of the review, and never older than a commit the user commented on then.

const head = pr.headRefOid;
let since = lastActivityAt;
let baseline = null;
let method = null;

if (sinceArg && /^[0-9a-f]{7,40}$/i.test(sinceArg)) {
  baseline = ghJson("api", `repos/${repo}/commits/${sinceArg}`).sha;
  since = null;
  method = "given with --since";
} else {
  if (sinceArg) since = new Date(sinceArg).toISOString();
  if (!since) {
    console.error(`${login} has no reviews or comments on ${repo}#${number}. Pass --since <time or SHA>.`);
    process.exit(1);
  }
  const laterForcePush = forcePushes.filter((f) => f.at > since && f.before).sort((a, b) => a.at.localeCompare(b.at))[0];
  if (laterForcePush) {
    baseline = laterForcePush.before;
    method = `the head just before the force push at ${laterForcePush.at}`;
  } else {
    const chain = [];
    for (let c = bySha.get(head); c; c = bySha.get(c.parents[0])) chain.push(c.sha);
    const byDate = chain.find((sha) => bySha.get(sha).date <= since);
    // Commits the user commented on in their last sitting (within 12 hours of it).
    const sittingStart = new Date(new Date(since).getTime() - 12 * 3600 * 1000).toISOString();
    const commented = new Set(myThreads.flatMap((t) => t.comments.nodes
      .filter((c) => mine(c) && c.createdAt >= sittingStart && c.createdAt <= since)
      .map((c) => c.originalCommit?.oid)).filter(Boolean));
    const byComment = chain.find((sha) => commented.has(sha));
    const index = (sha) => (sha ? chain.indexOf(sha) : Infinity);
    if (index(byComment) < index(byDate)) {
      baseline = byComment;
      method = "the newest commit you commented on in your last sitting";
    } else if (byDate) {
      baseline = byDate;
      method = "the newest commit on the branch committed before your review";
    } else {
      baseline = pr.baseRefOid;
      method = "no commit on the branch predates your review, so the PR's base";
    }
  }
}

// ---- The diff and the commits in between -----------------------------------

const unchanged = baseline === head;
const forcePushedSince = since ? forcePushes.filter((f) => f.at > since) : [];
let commits = [];
let diff = "";
let otherFiles = [];
let fromBaseCommits = 0;
let rewritten = false;

// Split a unified diff into one block per file.
const splitDiff = (text) => text.split(/(?=^diff --git )/m).filter((b) => b.startsWith("diff --git "));
const blockPaths = (block) => {
  const m = block.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  return m ? [m[1], m[2]] : [];
};

const fileAt = (path, sha) => {
  try {
    return execFileSync("gh", ["api", `repos/${repo}/contents/${encodeURI(path)}?ref=${sha}`,
      "-H", "Accept: application/vnd.github.raw"], { maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null; // not in this commit
  }
};

if (!unchanged) {
  const compare = ghJson("api", `repos/${repo}/compare/${baseline}...${head}?per_page=100`);
  // The three-dot diff starts from the merge base. That equals the baseline only
  // when the baseline is still in the branch's history, which a rebase breaks.
  rewritten = compare.behind_by > 0;

  if (!rewritten) {
    const full = gh("api", `repos/${repo}/compare/${baseline}...${head}`, "-H", "Accept: application/vnd.github.diff");
    const blocks = splitDiff(full);
    diff = blocks.filter((b) => blockPaths(b).some((p) => prPaths.has(p))).join("");
    otherFiles = [...new Set(blocks.filter((b) => !blockPaths(b).some((p) => prPaths.has(p))).map((b) => blockPaths(b)[1]))];
  } else {
    // Diff each of the PR's files directly between the two commits.
    const tmp = join(dir, ".files");
    mkdirSync(tmp, { recursive: true });
    const parts = [];
    for (const f of prFiles) {
      const before = fileAt(f.previous ?? f.path, baseline);
      const after = fileAt(f.path, head);
      if (before === null && after === null) continue;
      const a = join(tmp, "a"), b = join(tmp, "b");
      writeFileSync(a, before ?? "");
      writeFileSync(b, after ?? "");
      let out = "";
      try {
        execFileSync("git", ["diff", "--no-index", "--no-color", a, b], { encoding: "utf8", maxBuffer: 1 << 28 });
      } catch (e) {
        out = e.stdout; // exit code 1 means the files differ
      }
      if (!out) continue;
      const oldPath = f.previous ?? f.path;
      out = out
        .replace(/^diff --git .*$/m, `diff --git a/${oldPath} b/${f.path}`)
        .replace(/^--- .*$/m, before === null ? "--- /dev/null" : `--- a/${oldPath}`)
        .replace(/^\+\+\+ .*$/m, after === null ? "+++ /dev/null" : `+++ b/${f.path}`);
      parts.push(out);
    }
    diff = parts.join("");
  }

  // The PR's own commits are the ones its commit list has; the rest came from the base branch.
  const listed = rewritten
    ? prCommits.map((c) => ({ ...c, parents: c.parents.map((sha) => ({ sha })) }))
    : compare.commits.filter((c) => bySha.has(c.sha)).map((c) => ({ ...bySha.get(c.sha), parents: c.parents }));
  fromBaseCommits = rewritten ? 0 : compare.commits.length - listed.length;
  // Blob SHAs of the PR's files in a commit, from its tree. The compare and commit
  // endpoints list at most 300 files, which a merge of the base branch often passes.
  const trees = new Map();
  const prBlobs = (sha) => {
    if (!trees.has(sha)) {
      const tree = ghJson("api", `repos/${repo}/git/trees/${sha}?recursive=1`);
      const blobs = new Map();
      if (tree.truncated) {
        for (const p of prPaths) {
          try { blobs.set(p, ghJson("api", `repos/${repo}/contents/${encodeURI(p)}?ref=${sha}`).sha); } catch { /* absent */ }
        }
      } else {
        for (const e of tree.tree) if (prPaths.has(e.path)) blobs.set(e.path, e.sha);
      }
      trees.set(sha, blobs);
    }
    return trees.get(sha);
  };

  commits = listed.map((c) => {
    const merge = c.parents.length > 1;
    let files;
    let prFilesTouched;
    if (merge) {
      // A merge's own changes are what it brought in from its second parent.
      const before = prBlobs(c.parents[0].sha), after = prBlobs(c.sha);
      prFilesTouched = [...prPaths].filter((p) => before.get(p) !== after.get(p));
      files = null;
    } else {
      files = ghJson("api", `repos/${repo}/commits/${c.sha}`).files.map((f) => f.filename);
      prFilesTouched = files.filter((f) => prPaths.has(f));
    }
    return {
      sha: c.sha,
      merge,
      // A merge of another branch of this PR's work, rather than of the base branch.
      mergesPrWork: merge && bySha.has(c.parents[1].sha),
      date: c.date,
      authoredAt: c.authoredAt,
      // After a rebase every commit is rewritten; ones authored before the review are old work.
      authoredAfterReview: since ? c.authoredAt > since : null,
      author: c.author,
      headline: c.headline,
      files, // null for a merge
      prFiles: prFilesTouched,
    };
  });
}

writeFileSync(join(dir, "pr.json"), JSON.stringify(pr, null, 2));
writeFileSync(join(dir, "since.diff"), diff);
writeFileSync(join(dir, "since.json"), JSON.stringify({
  repo, number: Number(number), login,
  lastActivityAt: since, baseline, baselineMethod: method, head, unchanged,
  forcePushedSince, rewritten, fromBaseCommits, otherFiles, commits,
}, null, 2));

// ---- Comments ----------------------------------------------------------------

const comments = {
  threads: myThreads.map((t) => ({
    id: `c${t.comments.nodes[0].databaseId}`,
    url: t.comments.nodes[0].url,
    path: t.path,
    line: t.line,
    originalLine: t.originalLine,
    isResolved: t.isResolved,
    isOutdated: t.isOutdated,
    resolvedBy: t.resolvedBy?.login ?? null,
    startedByYou: mine(t.comments.nodes[0]),
    diffHunk: t.comments.nodes[0].diffHunk,
    comments: t.comments.nodes.map((c) => ({
      author: c.author?.login ?? "ghost", body: c.body, at: c.createdAt, url: c.url,
      afterReview: since ? c.createdAt > since : false,
    })),
  })),
  reviewBodies: myReviews.filter((r) => r.body?.trim()).map((r) => ({
    id: `r${r.id}`, url: r.html_url, state: r.state, at: r.submitted_at, body: r.body,
  })),
  conversation: issueComments
    .filter((c) => c.user?.login === login || (since && c.created_at > since && c.user?.type !== "Bot"))
    .map((c) => ({
      id: `i${c.id}`, url: c.html_url, author: c.user?.login, at: c.created_at, body: c.body,
      yours: c.user?.login === login, afterReview: since ? c.created_at > since : false,
    })),
};
writeFileSync(join(dir, "comments.json"), JSON.stringify(comments, null, 2));

const short = (s) => s?.slice(0, 10);
console.log(`${repo}#${number} for ${login}`);
console.log(`last review or comment: ${since ?? "(not used)"}`);
console.log(`baseline ${short(baseline)}: ${method}`);
console.log(`head     ${short(head)}`);
if (unchanged) console.log("Nothing has been pushed since then.");
else {
  const own = commits.filter((c) => !c.merge);
  const merges = commits.filter((c) => c.merge && !c.mergesPrWork);
  if (rewritten) console.log(`rebased: the PR now has ${own.length} commits, ${own.filter((c) => c.authoredAfterReview).length} authored since then`);
  else console.log(`${own.length} commits, ${merges.length} merges of ${pr.baseRefName} (${merges.filter((m) => m.prFiles.length).length} touching the PR's files), ${fromBaseCommits} commits from ${pr.baseRefName} left out`);
  const files = new Set(splitDiff(diff).map((b) => blockPaths(b)[1]));
  console.log(`${files.size} of the PR's files differ${otherFiles.length ? `; ${otherFiles.length} other files changed only through merges` : ""}`);
}
if (forcePushedSince.length) console.log(`force-pushed ${forcePushedSince.length} time(s) since then`);
if (sinceArg && lastActivityAt && since && lastActivityAt > since) {
  console.log(`note: you also reviewed or commented later, last at ${lastActivityAt}; that activity is after this starting point`);
}
const open = comments.threads.filter((t) => !t.isResolved).length;
console.log(`${comments.threads.length} threads you took part in (${open} unresolved), ${comments.reviewBodies.length} review bodies, ${comments.conversation.length} conversation comments`);
