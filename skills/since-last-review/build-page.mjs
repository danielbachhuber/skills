#!/usr/bin/env node
// Build the catch-up page from what fetch-since.mjs saved and the judgment in spec.json.
//
// Usage:
//   node build-page.mjs <workdir> --outline   list the hunks and comments to sort, with their ids
//   node build-page.mjs <workdir>             write <workdir>/since-last-review.html from spec.json
//
// spec.json:
// {
//   "headline": "One or two sentences on what changed since the review.",
//   "groups": [
//     { "title": "Exempt reads now return { items, total }",
//       "note": "Optional. What these changes do, in a sentence or two.",
//       "commits": ["b518cad"],
//       "files": ["docs/adr/0005.md", { "path": "docs/adr/README.md", "hunks": [0] }],
//       "comments": ["c4456890103"],
//       "show": "diff" }            // or "summary": the note leads and the diff starts collapsed
//   ],
//   "comments": [
//     { "id": "c4456890103", "status": "addressed", "note": "Optional for addressed, required otherwise." }
//   ]
// }
// Statuses: addressed, partly, not-addressed, replied (an answer with no code change, which
// is the reviewer's call), no-longer-applies.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [dir, mode] = process.argv.slice(2);
if (!dir) {
  console.error("usage: node build-page.mjs <workdir> [--outline]");
  process.exit(2);
}
const read = (f) => JSON.parse(readFileSync(join(dir, f), "utf8"));
const pr = read("pr.json");
const since = read("since.json");
const comments = read("comments.json");
const diffText = readFileSync(join(dir, "since.diff"), "utf8");

// ---- Parse the diff ----------------------------------------------------------

const files = diffText.split(/(?=^diff --git )/m).filter((b) => b.startsWith("diff --git ")).map((block) => {
  const [, oldPath, newPath] = block.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  const status = /^--- \/dev\/null/m.test(block) ? "added" : /^\+\+\+ \/dev\/null/m.test(block) ? "removed"
    : oldPath !== newPath ? "renamed" : "modified";
  const hunks = [];
  let hunk = null;
  for (const line of block.split("\n")) {
    const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (m) {
      hunk = { header: line, oldStart: +m[1], newStart: +m[2], context: m[3].trim(), lines: [] };
      hunks.push(hunk);
    } else if (hunk && /^[ +\-\\]/.test(line)) {
      hunk.lines.push(line);
    }
  }
  return { path: newPath, oldPath, status, hunks, binary: /^Binary files /m.test(block) };
});
const fileByPath = new Map(files.map((f) => [f.path, f]));

// ---- Which comments are worth sorting ----------------------------------------

const sittingStart = since.lastActivityAt
  ? new Date(new Date(since.lastActivityAt).getTime() - 12 * 3600 * 1000).toISOString() : null;
const threadById = new Map(comments.threads.map((t) => [t.id, t]));
// A resolved thread is worth another look only when someone replied since the review,
// or the lines it sits on (at the head) are inside a hunk that changed since.
const inChangedHunk = (t) => {
  const f = fileByPath.get(t.path);
  if (!f || t.line == null) return false;
  return f.hunks.some((h) => {
    const span = h.lines.filter((l) => l[0] !== "-" && l[0] !== "\\").length;
    return t.line >= h.newStart && t.line < h.newStart + span;
  });
};
const othersReplied = (t) => t.comments.some((c) => c.afterReview && c.author !== since.login);
const existedAtReview = (t) => !since.lastActivityAt || t.comments[0].at <= since.lastActivityAt;
const candidateThreads = comments.threads.filter((t) =>
  existedAtReview(t) && (!t.isResolved || othersReplied(t) || inChangedHunk(t)));
// The last sitting: the 12 hours up to the review.
const inSitting = (at) => sittingStart && at >= sittingStart && at <= since.lastActivityAt;
const reviewBodies = comments.reviewBodies.filter((r) => inSitting(r.at));
const conversation = comments.conversation.filter((c) => (c.afterReview && !c.yours) || (c.yours && inSitting(c.at)));
const otherById = new Map([...comments.reviewBodies, ...comments.conversation].map((c) => [c.id, c]));

// Plain text for previews: no Markdown markers, no fenced code.
const plain = (s) => s.replace(/```[\s\S]*?```/g, " [code] ").replace(/^>\s?/gm, "")
  .replace(/\*\*|__|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
const firstLine = (s, n = 140) => plain(s).replace(/\s+/g, " ").trim().slice(0, n);
const myComment = (t) => t.comments.find((c) => c.author === since.login) ?? t.comments[0];

if (mode === "--outline") {
  const short = (s) => s.slice(0, 7);
  console.log(`${since.repo}#${since.number}: ${pr.title}`);
  console.log(`baseline ${short(since.baseline)} (${since.baselineMethod}) -> head ${short(since.head)}`);
  if (since.unchanged) console.log("Nothing pushed since the review.");
  console.log("\nCommits:");
  for (const c of since.commits) {
    const kind = c.merge ? (c.mergesPrWork ? "merge of PR work" : `merge of ${pr.baseRefName}`) : "commit";
    const rebased = since.rewritten ? (c.authoredAfterReview ? " (new)" : " (rebased, authored before review)") : "";
    const by = c.author === since.login ? "YOU" : c.author;
    console.log(`  ${short(c.sha)} ${kind}${rebased} by ${by}: ${c.headline}  [PR files: ${c.prFiles.join(", ") || "none"}]`);
  }
  console.log("\nHunks (every one must be in a group):");
  for (const f of files) {
    console.log(`  ${f.path}${f.oldPath !== f.path ? ` (from ${f.oldPath})` : ""} [${f.status}]`);
    f.hunks.forEach((h, i) => {
      const add = h.lines.filter((l) => l[0] === "+").length, del = h.lines.filter((l) => l[0] === "-").length;
      const first = h.lines.find((l) => l[0] === "+" || l[0] === "-") ?? "";
      console.log(`    [${i}] +${add} -${del} at line ${h.newStart}${h.context ? ` (${h.context.slice(0, 50)})` : ""}: ${firstLine(first, 90)}`);
    });
  }
  console.log("\nThreads to sort (each needs a status):");
  for (const t of candidateThreads) {
    const state = t.isResolved ? `resolved by ${t.resolvedBy}` : t.isOutdated ? "open, outdated" : "open";
    const replies = t.comments.filter((c) => c.afterReview && c.author !== since.login);
    console.log(`  ${t.id} [${state}] ${t.path}:${t.line ?? t.originalLine}`);
    console.log(`      you: ${firstLine(myComment(t).body)}`);
    if (replies.length) console.log(`      since: ${replies.map((c) => `${c.author}: ${firstLine(c.body, 80)}`).join(" | ")}`);
  }
  const resolvedSkipped = comments.threads.filter((t) => existedAtReview(t) && !candidateThreads.includes(t)).length;
  const later = comments.threads.filter((t) => !existedAtReview(t));
  if (resolvedSkipped) console.log(`  (${resolvedSkipped} more threads were resolved with no changed lines or replies since; they are left off the page)`);
  if (later.length) console.log(`  (${later.length} threads you started after the starting point, from ${later.map((t) => t.comments[0].at).sort()[0]}, are left off the page)`);
  if (reviewBodies.length || conversation.length) console.log("\nReview summaries and conversation comments:");
  for (const r of reviewBodies) console.log(`  ${r.id} [your ${r.state} review, ${r.at}]: ${firstLine(r.body)}`);
  for (const c of conversation) console.log(`  ${c.id} [${c.author}, ${c.at}${c.afterReview ? ", since your review" : ""}]: ${firstLine(c.body)}`);
  process.exit(0);
}

// ---- Validate the spec --------------------------------------------------------

if (!existsSync(join(dir, "spec.json"))) {
  console.error("No spec.json yet. Run with --outline, then write it.");
  process.exit(1);
}
const spec = read("spec.json");
const warnings = [];
const STATUSES = {
  "addressed": "Addressed",
  "partly": "Partly addressed",
  "not-addressed": "Not addressed",
  "replied": "Replied, no change",
  "no-longer-applies": "No longer applies",
};

const covered = new Map(files.map((f) => [f.path, new Set()]));
for (const g of spec.groups ?? []) {
  for (const entry of g.files ?? []) {
    const path = typeof entry === "string" ? entry : entry.path;
    const f = fileByPath.get(path);
    if (!f) { warnings.push(`group "${g.title}": ${path} is not in the diff`); continue; }
    const idx = typeof entry === "string" || !entry.hunks ? f.hunks.map((_, i) => i) : entry.hunks;
    for (const i of idx) {
      if (!f.hunks[i]) warnings.push(`group "${g.title}": ${path} has no hunk ${i}`);
      covered.get(path).add(i);
    }
  }
  for (const id of g.comments ?? []) {
    if (!threadById.has(id) && !otherById.has(id)) warnings.push(`group "${g.title}": no comment ${id}`);
  }
  for (const sha of g.commits ?? []) {
    if (!since.commits.some((c) => c.sha.startsWith(sha))) warnings.push(`group "${g.title}": no commit ${sha}`);
  }
}
for (const f of files) f.hunks.forEach((_, i) => {
  if (!covered.get(f.path).has(i)) warnings.push(`${f.path} hunk ${i} is in no group`);
});
const statusById = new Map((spec.comments ?? []).map((c) => [c.id, c]));
for (const c of spec.comments ?? []) {
  if (!threadById.has(c.id) && !otherById.has(c.id)) warnings.push(`comments: no comment ${c.id}`);
  if (!STATUSES[c.status]) warnings.push(`comments: ${c.id} has unknown status "${c.status}"`);
  if (c.status !== "addressed" && !c.note) warnings.push(`comments: ${c.id} is "${c.status}" with no note saying what is left`);
}
for (const t of candidateThreads) {
  if (!statusById.has(t.id)) warnings.push(`thread ${t.id} (${t.path}) has no status in "comments"`);
}

// ---- Render ------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
// Just enough Markdown for review comments: fences, paragraphs, lists, inline code and links.
const md = (s) => {
  const out = [];
  const parts = s.replace(/\r/g, "").split(/^```(\w*)\n([\s\S]*?)^```\s*$/m);
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 1) {
      const lang = parts[i], code = parts[i + 1];
      out.push(`${lang === "suggestion" ? '<div class="label">Suggested change</div>' : ""}<pre>${esc(code.replace(/\n$/, ""))}</pre>`);
      i++;
      continue;
    }
    for (const para of parts[i].split(/\n{2,}/)) {
      const p = para.trim();
      if (!p) continue;
      const lines = p.split("\n");
      if (lines.every((l) => /^\s*[-*] /.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("")}</ul>`);
      else if (lines.every((l) => /^>/.test(l))) out.push(`<blockquote>${inline(lines.map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>`);
      else out.push(`<p>${lines.map(inline).join("<br>")}</p>`);
    }
  }
  return out.join("");
};

const repoUrl = `https://github.com/${since.repo}`;
const commitLink = (sha) => `<a class="sha" href="${repoUrl}/commit/${sha}">${sha.slice(0, 7)}</a>`;
const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

// Mark the part of a changed line that differs from its pair, word by word at the edges.
const markPair = (a, b) => {
  const ta = a.slice(1).split(/(\s+)/), tb = b.slice(1).split(/(\s+)/);
  let p = 0;
  while (p < ta.length && p < tb.length && ta[p] === tb[p]) p++;
  let q = 0;
  while (q < ta.length - p && q < tb.length - p && ta[ta.length - 1 - q] === tb[tb.length - 1 - q]) q++;
  const mark = (t, sign) => sign + esc(t.slice(0, p).join("")) + `<mark>${esc(t.slice(p, t.length - q).join(""))}</mark>` + esc(t.slice(t.length - q).join(""));
  // Leave lines that share little alone: marking all of them adds nothing.
  const changed = Math.max(ta.length, tb.length) - p - q;
  if (changed > Math.max(ta.length, tb.length) * 0.6) return null;
  return [mark(ta, "-"), mark(tb, "+")];
};

const renderHunk = (h) => {
  let o = h.oldStart, n = h.newStart;
  const html = h.lines.map(esc);
  // Pair each run of removed lines with the run of added lines that follows it.
  for (let i = 0; i < h.lines.length;) {
    if (h.lines[i][0] !== "-") { i++; continue; }
    let j = i;
    while (j < h.lines.length && h.lines[j][0] === "-") j++;
    let k = j;
    while (k < h.lines.length && h.lines[k][0] === "+") k++;
    if (k - j === j - i) {
      for (let x = 0; x < j - i; x++) {
        const pair = markPair(h.lines[i + x], h.lines[j + x]);
        if (pair) [html[i + x], html[j + x]] = pair;
      }
    }
    i = k;
  }
  const rows = h.lines.map((l, idx) => {
    const kind = l[0] === "+" ? "add" : l[0] === "-" ? "del" : l[0] === "\\" ? "meta" : "ctx";
    const left = kind === "add" || kind === "meta" ? "" : o++;
    const right = kind === "del" || kind === "meta" ? "" : n++;
    return `<tr class="${kind}"><td class="ln">${left}</td><td class="ln">${right}</td><td class="code">${html[idx]}</td></tr>`;
  }).join("");
  return `<table class="diff"><colgroup><col class="lc"><col class="lc"><col></colgroup>${h.context ? `<tr class="hh"><td colspan="3">${esc(h.context)}</td></tr>` : ""}${rows}</table>`;
};

const renderFile = (path, idx, collapsed) => {
  const f = fileByPath.get(path);
  if (!f) return "";
  const hunks = (idx ?? f.hunks.map((_, i) => i)).map((i) => f.hunks[i]).filter(Boolean);
  const lines = hunks.reduce((n, h) => n + h.lines.length, 0);
  const head = `<a href="${repoUrl}/blob/${since.head}/${encodeURI(path)}">${esc(path)}</a>${f.status !== "modified" ? ` <span class="muted">${f.status}${f.status === "renamed" ? ` from ${esc(f.oldPath)}` : ""}</span>` : ""}`;
  const body = f.binary ? '<p class="muted">Binary file</p>' : hunks.map(renderHunk).join("");
  // Very long diffs start collapsed; the note above them says what they do.
  if (collapsed || lines > 250) {
    return `<details class="file"><summary>${head} <span class="muted">${lines} lines of diff</span></summary>${body}</details>`;
  }
  return `<div class="file"><div class="fh">${head}</div>${body}</div>`;
};

const codeContext = (t) => {
  const lines = (t.diffHunk ?? "").split("\n").filter((l) => !l.startsWith("@@")).slice(-4);
  return lines.length ? `<pre class="ctx">${esc(lines.join("\n"))}</pre>` : "";
};

const renderComment = (id, { withReplies = true } = {}) => {
  const t = threadById.get(id);
  if (t) {
    const mineC = myComment(t);
    const replies = withReplies ? t.comments.filter((c) => c.afterReview && c.author !== since.login) : [];
    // The conversation between your comment and the review, so a reply has something to answer.
    const between = withReplies ? t.comments.filter((c) => c !== mineC && !c.afterReview && c.at > mineC.at) : [];
    const reply = (r) => `<div class="reply"><div class="who">${r.author === since.login ? "You" : esc(r.author)}, ${when(r.at)}</div>${md(r.body)}</div>`;
    const where = `${esc(t.path)}:${t.line ?? t.originalLine}${t.isResolved ? ` · resolved by ${esc(t.resolvedBy)}` : ""}`;
    return `<div class="quote">
      <div class="who">${mineC.author === since.login ? "You" : esc(mineC.author)} on <a href="${t.url}">${where}</a>, ${when(mineC.at)}</div>
      ${codeContext(t)}${md(mineC.body)}
      ${between.length ? `<details class="earlier"><summary>${between.length} earlier ${between.length === 1 ? "reply" : "replies"}, before your review</summary>${between.map(reply).join("")}</details>` : ""}
      ${replies.length ? `<div class="label">Since your review</div>${replies.map(reply).join("")}` : ""}
    </div>`;
  }
  const c = otherById.get(id);
  if (!c) return "";
  const who = c.author ? (c.author === since.login ? "You" : esc(c.author)) : "You";
  return `<div class="quote"><div class="who">${who} in <a href="${c.url}">${c.state ? "a review summary" : "the conversation"}</a>, ${when(c.at)}</div>${md(c.body)}</div>`;
};

const groupOfComment = new Map();
(spec.groups ?? []).forEach((g, gi) => (g.comments ?? []).forEach((id) => groupOfComment.set(id, gi)));

const own = since.commits.filter((c) => !c.merge || c.mergesPrWork);
const baseMerges = since.commits.filter((c) => c.merge && !c.mergesPrWork);
const facts = [];
if (since.unchanged) facts.push("Nothing has been pushed since then.");
else {
  if (since.rewritten) {
    const fresh = own.filter((c) => c.authoredAfterReview).length;
    facts.push(`The branch was rebased${since.forcePushedSince.length > 1 ? ` (${since.forcePushedSince.length} force pushes)` : ""}. ${fresh ? `${fresh} of its ${own.length} commits were written since your review.` : "No commits were written since your review."}`);
  } else {
    facts.push(`${own.filter((c) => !c.merge).length} new commits.`);
  }
  if (baseMerges.length) {
    const touching = baseMerges.filter((m) => m.prFiles.length);
    facts.push(`${baseMerges.length === 1 ? "A merge" : `${baseMerges.length} merges`} from <code>${esc(pr.baseRefName)}</code>${touching.length ? `, which changed ${[...new Set(touching.flatMap((m) => m.prFiles))].map((p) => `<code>${esc(p)}</code>`).join(", ")}` : ", which changed none of the PR's files"}.`);
  }
  facts.push(files.length ? `${files.length} of the PR's files changed.` : "None of the PR's files changed.");
}

const groupsHtml = (spec.groups ?? []).map((g, gi) => {
  const commits = (g.commits ?? []).map((s) => since.commits.find((c) => c.sha.startsWith(s))).filter(Boolean);
  return `<section class="group" id="g${gi}">
    <h2>${inline(g.title)}</h2>
    ${commits.length ? `<div class="meta">${commits.map((c) => `${commitLink(c.sha)} ${esc(c.headline)}`).join("<br>")}</div>` : ""}
    ${g.note ? `<p class="note">${inline(g.note)}</p>` : ""}
    ${(g.comments ?? []).map((id) => renderComment(id)).join("")}
    ${(g.files ?? []).map((e) => typeof e === "string" ? renderFile(e, null, g.show === "summary") : renderFile(e.path, e.hunks, g.show === "summary")).join("")}
  </section>`;
}).join("");

const order = ["not-addressed", "replied", "partly", "no-longer-applies", "addressed"];
const sorted = [...(spec.comments ?? [])].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
const commentsHtml = sorted.map((c) => {
  const gi = groupOfComment.get(c.id);
  const t = threadById.get(c.id);
  const body = t ? myComment(t).body : otherById.get(c.id)?.body ?? "";
  const url = t?.url ?? otherById.get(c.id)?.url;
  return `<li><span class="tag ${c.status}">${STATUSES[c.status] ?? esc(c.status)}</span>
    <span class="q">${esc(firstLine(body, 220))}${plain(body).trim().length > 220 ? "…" : ""}</span>
    ${c.note ? `<div class="n">${inline(c.note)}</div>` : ""}
    <div class="links">${url ? `<a href="${url}">On GitHub</a>` : ""}${gi !== undefined ? ` · <a href="#g${gi}">${inline(spec.groups[gi].title)}</a>` : ""}</div></li>`;
}).join("");
const leftOffResolved = comments.threads.filter((t) => existedAtReview(t) && !candidateThreads.includes(t)).length;
const startedLater = comments.threads.filter((t) => !existedAtReview(t)).length;

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Since your review: ${esc(pr.title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:14px/1.5 var(--font-sans,-apple-system,system-ui,sans-serif);color:var(--foreground,CanvasText)}
.page{max-width:900px}
a{color:var(--brand,LinkText)}
code,pre,.diff{font-family:var(--font-mono,ui-monospace,Menlo,monospace);font-size:12px}
.muted,.meta,.who{color:var(--muted-foreground,GrayText)}
h1{font-size:18px;margin:0 0 4px}
h2{font-size:15px;margin:0 0 6px}
.facts{margin:0 0 6px;color:var(--muted-foreground,GrayText)}
.headline{font-size:15px;margin:10px 0 18px}
.group{border:1px solid var(--border,#8884);border-radius:var(--radius,8px);padding:16px;margin-bottom:14px}
.meta{font-size:12px;margin-bottom:8px}
.sha{font-family:var(--font-mono,ui-monospace,monospace)}
.note{margin:0 0 10px}
.quote{border-left:3px solid var(--brand,#58f);background:var(--surface-recessed,#8881);border-radius:4px;padding:8px 12px;margin:0 0 10px}
.quote p{margin:4px 0}
.who{font-size:12px}
details.earlier summary{font-size:12px;color:var(--muted-foreground,GrayText);cursor:pointer;margin-top:6px}
.reply{border-top:1px solid var(--border,#8884);margin-top:8px;padding-top:6px}
pre{background:var(--surface-recessed,#8881);padding:8px 10px;border-radius:4px;overflow-x:auto;margin:6px 0}
pre.ctx{opacity:.75}
.label{font-size:11px;color:var(--muted-foreground,GrayText);margin-top:6px}
.file{margin-top:10px}
.fh,details.file summary{font-family:var(--font-mono,monospace);font-size:12px;margin-bottom:4px;cursor:pointer}
.diff{border-collapse:collapse;width:100%;margin-bottom:6px;table-layout:fixed}
.diff td{padding:0 6px;vertical-align:top}
.diff col.lc{width:40px}
.diff .ln{text-align:right;color:var(--muted-foreground,GrayText);user-select:none;opacity:.7}
.diff .code{white-space:pre-wrap;word-break:break-word}
.diff .add{background:color-mix(in srgb,var(--diff-added,#2a4) 16%,transparent)}
.diff .del{background:color-mix(in srgb,var(--diff-removed,#d33) 16%,transparent)}
.diff mark{color:inherit;border-radius:2px;padding:0 1px}
.diff .add mark{background:color-mix(in srgb,var(--diff-added,#2a4) 45%,transparent)}
.diff .del mark{background:color-mix(in srgb,var(--diff-removed,#d33) 45%,transparent)}
.diff .hh td{color:var(--muted-foreground,GrayText);padding-top:6px}
.comments ul{list-style:none;padding:0;margin:0}
.comments li{padding:10px 0;border-top:1px solid var(--border,#8884)}
.tag{display:inline-block;font-size:11px;padding:1px 8px;border-radius:10px;margin-right:6px;font-weight:600}
.addressed{background:color-mix(in srgb,var(--success,#2a4) 22%,transparent)}
.partly,.replied{background:color-mix(in srgb,var(--attention,#d90) 28%,transparent)}
.not-addressed{background:color-mix(in srgb,var(--warning,#e60) 30%,transparent)}
.no-longer-applies{background:color-mix(in srgb,var(--muted-foreground,#888) 22%,transparent)}
.n{margin-top:4px}
.links{font-size:12px;margin-top:2px}
</style></head><body><div class="page">
<h1>Since your review on ${since.lastActivityAt ? when(since.lastActivityAt) : `commit ${since.baseline.slice(0, 7)}`}</h1>
<p class="facts"><a href="${pr.url}">${esc(pr.title)} (#${pr.number})</a> </p>
<p class="facts">Compared ${commitLink(since.baseline)}, where the branch was at your review${since.baselineMethod ? ` (${esc(since.baselineMethod)})` : ""}, with ${commitLink(since.head)} now.</p>
<p class="facts">${facts.join(" ")}</p>
${spec.headline ? `<p class="headline">${inline(spec.headline)}</p>` : ""}
${groupsHtml}
${sorted.length ? `<section class="comments"><h2>Your comments</h2><ul>${commentsHtml}</ul>
${leftOffResolved ? `<p class="muted">${leftOffResolved} more threads you took part in were already resolved, with no replies or changed lines since.</p>` : ""}
${startedLater ? `<p class="muted">${startedLater} threads you started after this starting point are not included.</p>` : ""}</section>` : ""}
</div></body></html>`;

const out = join(dir, "since-last-review.html");
writeFileSync(out, html);
for (const w of warnings) console.error(`warning: ${w}`);
console.log(`${out}: ${spec.groups?.length ?? 0} groups, ${sorted.length} comments, ${warnings.length} warnings`);
