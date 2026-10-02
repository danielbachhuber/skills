// Build a show-me page from a work directory.
// Usage: node build-page.mjs <workdir> [out.html]
//        node build-page.mjs <workdir> --hunks   (list each file's hunks, numbered from 0)
// Reads pr.json, files.json, and pr.diff (from fetch-pr.sh) and spec.json (written by
// the agent), and writes a standalone HTML page, by default <workdir>/show-me.html.
// Prints a warning for every changed file no concern claims, and exits 1 on a bad spec.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildTestsSection, TESTS_CSS } from './tests-section.mjs';

const [dir, outArg] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node build-page.mjs <workdir> [out.html]');
  process.exit(2);
}
const out = outArg ?? path.join(dir, 'show-me.html');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
const pr = JSON.parse(read('pr.json'));
const files = JSON.parse(read('files.json'));
const diff = read('pr.diff');
const commits = fs.existsSync(path.join(dir, 'commits.json')) ? JSON.parse(read('commits.json')) : [];
const repo = new URL(pr.url).pathname.split('/').slice(1, 3).join('/');

// Lockfiles, build output, snapshots, and minified files: listed, but last and collapsed.
const NOISE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json|go\.sum|Cargo\.lock|composer\.lock|Gemfile\.lock|poetry\.lock)$|\.(min\.js|min\.css|map|snap)$|(^|\/)(dist|build|out|vendor|node_modules|\.next|coverage|__snapshots__)\//;
const isNoise = (p) => NOISE.test(p);

// Split the patch into one block per file, keyed by its new path, then into hunks.
const patches = new Map();
for (const block of diff.split(/^(?=diff --git )/m)) {
  const m = block.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (!m) continue;
  const lines = block.replace(/\n$/, '').split('\n');
  const first = lines.findIndex((l) => l.startsWith('@@'));
  const header = (first === -1 ? lines : lines.slice(0, first)).join('\n');
  const hunks = [];
  if (first !== -1) {
    for (const l of lines.slice(first)) {
      if (l.startsWith('@@')) hunks.push([l]);
      else hunks[hunks.length - 1].push(l);
    }
  }
  patches.set(m[2], { header, hunks: hunks.map((h) => h.join('\n')) });
}

if (outArg === '--hunks') {
  for (const f of files) {
    const p = patches.get(f.path);
    console.log(`${f.status.padEnd(8)} +${f.additions} -${f.deletions}  ${f.previous ? `${f.previous} -> ` : ''}${f.path}${isNoise(f.path) ? '  (noise)' : ''}`);
    (p?.hunks ?? []).forEach((h, i) => console.log(`    ${i}: ${h.split('\n')[0]}`));
  }
  process.exit(0);
}
const spec = JSON.parse(read('spec.json'));
const problems = [];
const warnings = [];
for (const key of ['headline', 'type']) if (!spec[key]) problems.push(`spec.json needs "${key}"`);
if (spec.findings) problems.push('spec.json has "findings": review findings go in chat as draft inline review comments, not on the page');
if (!Array.isArray(spec.concerns) || !spec.concerns.length) problems.push('spec.json needs at least one concern');
if (problems.length) {
  problems.forEach((p) => console.error(`error: ${p}`));
  process.exit(1);
}

const byPath = new Map(files.map((f) => [f.path, f]));
const claimed = new Map(); // path -> Set of hunk indexes, or 'all'
const concerns = spec.concerns.map((c, ci) => {
  const entries = (c.files ?? []).map((e) => (typeof e === 'string' ? { path: e } : e));
  const parts = [];
  for (const e of entries) {
    const file = byPath.get(e.path);
    const patch = patches.get(e.path);
    if (!file) {
      problems.push(`concern "${c.title}" names ${e.path}, which the PR does not change`);
      continue;
    }
    const all = patch ? patch.hunks.map((_, i) => i) : [];
    const picked = e.hunks ?? all;
    for (const i of picked) if (!(i in (patch?.hunks ?? []))) problems.push(`concern "${c.title}": ${e.path} has no hunk ${i}`);
    const seen = claimed.get(e.path) ?? new Set();
    picked.forEach((i) => seen.add(i));
    if (!patch || !patch.hunks.length) seen.add('empty');
    claimed.set(e.path, seen);
    parts.push({ path: e.path, previous: file.previous ?? null, status: file.status,
      patch: patch ? [patch.header, ...picked.map((i) => patch.hunks[i])].join('\n') + '\n' : '',
      hunkNote: e.hunks ? `hunks ${e.hunks.map((i) => i + 1).join(', ')} of ${all.length}` : '' });
  }
  return { id: `concern-${ci + 1}`, title: c.title, note: c.note ?? '', author: c.author ?? '', parts };
});
if (problems.length) {
  problems.forEach((p) => console.error(`error: ${p}`));
  process.exit(1);
}

// Anything no concern claimed goes to a catch-all group, so every line of the diff is on the page.
const leftovers = { noise: [], other: [] };
for (const f of files) {
  const patch = patches.get(f.path);
  const seen = claimed.get(f.path);
  const missing = patch ? patch.hunks.map((_, i) => i).filter((i) => !seen?.has(i)) : [];
  if (seen && !missing.length) continue;
  const part = { path: f.path, previous: f.previous ?? null, status: f.status,
    patch: patch ? [patch.header, ...missing.map((i) => patch.hunks[i])].join('\n') + '\n' : '',
    hunkNote: seen ? `hunks ${missing.map((i) => i + 1).join(', ')} of ${patch.hunks.length}` : '' };
  if (isNoise(f.path)) leftovers.noise.push(part);
  else {
    leftovers.other.push(part);
    warnings.push(`no concern claims ${f.path}${seen ? ` (${part.hunkNote})` : ''}`);
  }
}
if (leftovers.other.length) concerns.push({ id: 'concern-ungrouped', title: 'Not grouped', note: 'Changes no concern claimed.', parts: leftovers.other });
if (leftovers.noise.length) concerns.push({ id: 'concern-noise', title: 'Lockfiles, snapshots, and generated files', note: '', parts: leftovers.noise, collapsed: true });

// Which concern each file lands in, for links from the file map.
const concernOf = new Map();
for (const c of concerns) for (const p of c.parts) if (!concernOf.has(p.path)) concernOf.set(p.path, c.id);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Plain text with `code` spans and **bold**.
const text = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const blob = (ev) => {
  const sha = ev.ref ?? (ev.side === 'old' ? pr.baseRefOid : pr.headRefOid);
  const range = ev.end ? `#L${ev.line}-L${ev.end}` : ev.line ? `#L${ev.line}` : '';
  return `https://github.com/${repo}/blob/${sha}/${ev.path}${range}`;
};
const evidence = (list = []) =>
  list.map((ev) => `<a class="ev" href="${esc(blob(ev))}" target="_blank" rel="noopener">${esc(ev.label ?? `${ev.path.split('/').pop()}${ev.line ? `:${ev.line}` : ''}`)}${ev.side === 'old' ? ' (before)' : ''}</a>`).join(' ');
const claims = (items = []) =>
  items.length
    ? `<ul class="claims">${items.map((i) => `<li><span>${text(i.claim)}${i.inferred ? ' <em class="inferred">inferred</em>' : ''}</span> ${evidence(i.evidence)}</li>`).join('')}</ul>`
    : '<p class="muted">None listed.</p>';

const treeHtml = (tree) =>
  `<pre class="tree">${tree.replace(/\n$/, '').split('\n').map((l) => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')}</pre>`;
const diagrams = (spec.diagrams ?? []).map((d, i) => `
  <figure>
    <figcaption><strong>${text(d.title)}</strong>${d.caption ? ` ${text(d.caption)}` : ''}</figcaption>
    ${d.mermaid ? `<pre class="mermaid" id="diagram-${i}">${esc(d.mermaid)}</pre>` : treeHtml(d.tree ?? '')}
  </figure>`).join('');

// Screenshots: a pair is one frame; a film strip is several, one per step of a flow.
// Images are resized and embedded, so the page stays one file.
const imgDir = fs.mkdtempSync('/tmp/show-me-img-');
let imageBytes = 0;
const embed = (src, crop) => {
  if (!src) return null;
  const file = path.isAbsolute(src) ? src : path.join(dir, src);
  if (!fs.existsSync(file)) {
    problems.push(`image not found: ${src}`);
    return null;
  }
  const outFile = path.join(imgDir, `${imageBytes}-${path.basename(file)}.jpg`);
  const filters = [crop ? `crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}` : null, "scale='min(1400,iw)':-2"].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', filters, '-q:v', '4', outFile]);
  const data = fs.readFileSync(outFile);
  imageBytes += data.length;
  return `data:image/jpeg;base64,${data.toString('base64')}`;
};
const shot = (src, crop, alt) => {
  const uri = embed(src, crop);
  return uri ? `<a href="${uri}" target="_blank"><img src="${uri}" alt="${esc(alt)}"></a>` : `<div class="noimg muted">${src === null ? 'Not on this side' : 'Missing'}</div>`;
};
const visuals = (spec.visuals ?? []).map((v) => {
  const frames = v.frames ?? [];
  const strip = frames.length > 1;
  const row = (side) => frames.map((f) => `<div class="frame">${shot(f[side], v.crop, `${side}: ${f.label ?? v.title}`)}${strip && f.label ? `<div class="flabel">${text(f.label)}</div>` : ''}</div>`).join('');
  return `<figure class="visual${strip ? ' strip' : ''}">
    <figcaption><strong>${text(v.title)}</strong>${v.caption ? ` ${text(v.caption)}` : ''}${v.source ? ` <span class="muted">${text(v.source)}</span>` : ''}</figcaption>
    ${strip
      ? `<div class="striprow"><div class="side">Before</div><div class="frames">${row('before')}</div></div><div class="striprow"><div class="side">After</div><div class="frames">${row('after')}</div></div>`
      : `<div class="pair"><div><div class="side">Before</div>${shot(frames[0]?.before, v.crop, 'before')}</div><div><div class="side">After</div>${shot(frames[0]?.after, v.crop, 'after')}</div></div>`}
  </figure>`;
}).join('');
if (problems.length) {
  problems.forEach((p) => console.error(`error: ${p}`));
  process.exit(1);
}
if (imageBytes > 3.5 * 1024 * 1024) warnings.push(`screenshots add ${(imageBytes / 1048576).toFixed(1)} MB; the inline preview stops at 5 MB, so crop or drop some`);

// Tables, such as behavior by mode or by case. A cell is a string, or { text, changed: true }.
const cell = (c) => (typeof c === 'object' && c !== null
  ? `<td class="${c.changed ? 'changed' : ''}">${text(c.text)}</td>`
  : `<td>${text(c)}</td>`);
// Examples: the same input before and after, such as a request and its response, a
// stored record, or a command's output. Either side can be empty for something new or gone.
const examples = (spec.examples ?? []).map((x) => `
  <figure>
    <figcaption><strong>${text(x.title)}</strong>${x.caption ? ` ${text(x.caption)}` : ''}${x.source ? ` <span class="muted">${text(x.source)}</span>` : ''}</figcaption>
    <div class="pair">
      <div><div class="side">Before</div>${x.before == null ? '<div class="noimg muted">Not on this side</div>' : `<pre class="example">${esc(x.before)}</pre>`}</div>
      <div><div class="side">After</div>${x.after == null ? '<div class="noimg muted">Not on this side</div>' : `<pre class="example">${esc(x.after)}</pre>`}</div>
    </div>
  </figure>`).join('');

const tables = (spec.tables ?? []).map((t) => `
  <figure>
    <figcaption><strong>${text(t.title)}</strong>${t.caption ? ` ${text(t.caption)}` : ''}</figcaption>
    <div class="tablewrap"><table><thead><tr>${t.columns.map((c) => `<th>${text(c)}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table></div>
  </figure>`).join('');

// File map: files grouped by folder, moves shown as old -> new.
const STATUS = { added: 'A', removed: 'D', modified: 'M', renamed: 'R', copied: 'C', changed: 'M' };
const maxChurn = Math.max(1, ...files.map((f) => f.additions + f.deletions));
const bar = (f) => {
  const w = (n) => Math.max(n ? 2 : 0, Math.round((n / maxChurn) * 80));
  return `<span class="bar"><span class="a" style="width:${w(f.additions)}px"></span><span class="d" style="width:${w(f.deletions)}px"></span></span>`;
};
const fileRow = (f, fullPath = false) => {
  const name = f.previous
    ? `${esc(f.previous)} <span class="arrow">→</span> ${esc(f.path)}`
    : esc(fullPath ? f.path : f.path.split('/').pop());
  const where = concernOf.get(f.path);
  return `<li class="st-${f.status}"><span class="badge">${STATUS[f.status] ?? '?'}</span>
    <a href="#${where}" class="fname">${name}</a>
    <span class="nums"><span class="plus">+${f.additions}</span> <span class="minus">−${f.deletions}</span></span>${bar(f)}</li>`;
};
// Files with only one kind of routine change collapse into one row per kind. The agent
// names kinds in spec.trivial; source files whose changes are all imports, or all
// comments, are found here.
const CODE = /\.(m?[jt]sx?|cjs)$/;
const IMPORT_LINE = /^\s*(import\b.*|export\b.*\bfrom\b.*|\}\s*from\s+['"].*|(type\s+)?[A-Za-z_$][\w$]*(\s+as\s+[\w$]+)?,?|)\s*;?\s*$/;
const COMMENT_LINE = /^\s*(\/\/.*|\/\*.*|\*.*|)$/;
const changedLines = (p) => {
  const patch = patches.get(p);
  if (!CODE.test(p) || !patch?.hunks.length) return [];
  return patch.hunks.flatMap((h) => h.split('\n').slice(1)).filter((l) => /^[+-]/.test(l)).map((l) => l.slice(1));
};
const importsOnly = (p) => {
  const changed = changedLines(p);
  return changed.length > 0 && changed.some((l) => /\b(import|from)\b/.test(l)) && changed.every((l) => IMPORT_LINE.test(l));
};
const commentsOnly = (p) => {
  const changed = changedLines(p);
  return changed.length > 0 && changed.some((l) => l.trim()) && changed.every((l) => COMMENT_LINE.test(l));
};
const trivialKinds = (spec.trivial ?? []).map((t) => ({ title: t.title, files: t.files.filter((p) => byPath.has(p)) }));
for (const t of spec.trivial ?? []) for (const p of t.files) if (!byPath.has(p)) warnings.push(`trivial kind "${t.title}" names ${p}, which the PR does not change`);
const inKind = new Set(trivialKinds.flatMap((t) => t.files));
const autoImports = files.filter((f) => !inKind.has(f.path) && !isNoise(f.path) && !f.previous && importsOnly(f.path)).map((f) => f.path);
if (autoImports.length) trivialKinds.push({ title: 'Imports only', files: autoImports });
const autoComments = files.filter((f) => !inKind.has(f.path) && !isNoise(f.path) && !f.previous && !autoImports.includes(f.path) && commentsOnly(f.path)).map((f) => f.path);
if (autoComments.length) trivialKinds.push({ title: 'Comments only', files: autoComments });
const noisePaths = files.filter((f) => isNoise(f.path) && !inKind.has(f.path)).map((f) => f.path);
if (noisePaths.length) trivialKinds.push({ title: 'Lockfiles, snapshots, and generated files', files: noisePaths });
const trivialSet = new Set(trivialKinds.flatMap((t) => t.files));

const groups = new Map();
for (const f of files.filter((f) => !trivialSet.has(f.path))) {
  const folder = f.previous ? 'Moved' : path.dirname(f.path);
  if (!groups.has(folder)) groups.set(folder, []);
  groups.get(folder).push(f);
}
const sum = (list) => list.reduce((s, p) => [s[0] + byPath.get(p).additions, s[1] + byPath.get(p).deletions], [0, 0]);
const meaningful = [...groups.entries()]
  .sort(([a], [b]) => (a === 'Moved' ? -1 : b === 'Moved' ? 1 : a.localeCompare(b)))
  .map(([folder, list]) => `<div class="folder"><h4>${esc(folder)}</h4><ul class="files">${list.map((f) => fileRow(f)).join('')}</ul></div>`)
  .join('');
const trivial = trivialKinds.map((t) => {
  const [a, d] = sum(t.files);
  return `<details class="kind"><summary><strong>${text(t.title)}</strong> <span class="muted">${t.files.length} file${t.files.length === 1 ? '' : 's'}</span> <span class="plus">+${a}</span> <span class="minus">−${d}</span></summary>
    <ul class="files">${t.files.map((p) => fileRow(byPath.get(p), true)).join('')}</ul></details>`;
}).join('');
const fileMap = `${meaningful ? `<h3>Meaningful changes <span class="muted">${files.length - trivialSet.size} files</span></h3>${meaningful}` : ''}
  ${trivial ? `<h3>Routine changes <span class="muted">${trivialSet.size} files</span></h3>${trivial}` : ''}`;

// The author's commits that touched a concern's files. File-level, so a commit that
// touched one hunk of a shared file shows up in every concern that file is in.
const commitNumber = new Map(commits.map((c, i) => [c.sha, i + 1]));
const touching = (parts) => commits.filter((c) => parts.some((p) => c.files.includes(p.path)));
const commitLinks = (list) => list.map((c) =>
  `<a href="${esc(pr.url)}/commits/${c.sha}" target="_blank" rel="noopener" title="${esc(c.headline)}">${commitNumber.get(c.sha)}. ${esc(c.headline)}</a>`).join('<br>');
const authorLine = (c) => {
  const list = touching(c.parts);
  if (!list.length && !c.author) return '';
  return `<div class="author"><span class="muted">Author's commits touching these files:</span><br>${list.length ? commitLinks(list) : '<span class="muted">none</span>'}${c.author ? `<p>${text(c.author)}</p>` : ''}</div>`;
};

const churn = (parts) => parts.reduce((s, p) => { const f = byPath.get(p.path); return f ? [s[0] + f.additions, s[1] + f.deletions] : s; }, [0, 0]);
const concernHtml = concerns.map((c, i) => {
  const [a, d] = churn(c.parts);
  return `<details class="concern" id="${c.id}"${!c.collapsed && i === 0 ? ' open' : ''}>
    <summary><strong>${text(c.title)}</strong> <span class="muted">${c.parts.length} file${c.parts.length === 1 ? '' : 's'}</span> <span class="plus">+${a}</span> <span class="minus">−${d}</span></summary>
    ${c.note ? `<p class="note">${text(c.note)}</p>` : ''}
    ${authorLine(c)}
    ${c.parts.map((p, j) => `<div class="part"><div class="phead"><span class="badge">${STATUS[p.status] ?? '?'}</span> ${p.previous ? `${esc(p.previous)} <span class="arrow">→</span> ` : ''}<a href="https://github.com/${repo}/blob/${pr.headRefOid}/${esc(p.path)}" target="_blank" rel="noopener">${esc(p.path)}</a>${p.hunkNote ? ` <span class="muted">${p.hunkNote}</span>` : ''}</div>
      <div class="diff" data-concern="${c.id}" data-part="${j}">${p.patch ? '' : '<p class="muted">No text diff (binary or mode change).</p>'}</div></div>`).join('')}
  </details>`;
}).join('');

// Tests: what each group of tests covers and does not, from tests.json (parse-tests.mjs),
// spec.testGroups, and any coverage summaries (summarize-coverage.mjs).
const testsSection = buildTestsSection({ dir, spec, pr, files, esc, text, evidence, blob });
problems.push(...testsSection.problems);
warnings.push(...testsSection.warnings);
if (problems.length) {
  problems.forEach((p) => console.error(`error: ${p}`));
  process.exit(1);
}

const patchData = Object.fromEntries(concerns.map((c) => [c.id, c.parts.map((p) => p.patch)]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const shortSha = pr.headRefOid.slice(0, 9);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>#${pr.number} ${esc(pr.title)}</title>
<style>
:root { --bg:#fff; --fg:#1f2328; --muted:#656d76; --line:#d0d7de; --soft:#f6f8fa; --add:#1a7f37; --del:#cf222e; --addbg:#dafbe1; --delbg:#ffebe9; --accent:#0969da; }
@media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --fg:#e6edf3; --muted:#8d96a0; --line:#30363d; --soft:#161b22; --add:#3fb950; --del:#f85149; --addbg:#12261e; --delbg:#25171c; --accent:#4493f8; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 1180px; margin: 0 auto; padding: 20px; }
a { color: var(--accent); text-decoration: none; } a:hover { text-decoration: underline; }
code, pre, .tree { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
code { background: var(--soft); padding: 1px 4px; border-radius: 4px; }
header .meta { color: var(--muted); }
header h1 { font-size: 20px; margin: 4px 0; }
.headline { border-left: 4px solid var(--accent); background: var(--soft); padding: 10px 14px; border-radius: 6px; font-size: 16px; margin: 14px 0 4px; }
.type { display: inline-block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; border: 1px solid var(--line); border-radius: 10px; padding: 0 8px; margin-right: 8px; color: var(--muted); vertical-align: 2px; }
h2 { font-size: 16px; border-bottom: 1px solid var(--line); padding-bottom: 6px; margin-top: 28px; }
h4 { margin: 12px 0 4px; font-size: 12.5px; color: var(--muted); font-family: ui-monospace, Menlo, monospace; font-weight: 600; }
figure { margin: 0 0 18px; } figcaption { margin-bottom: 8px; }
pre.mermaid { background: var(--bg); text-align: center; margin: 0; }
.tree { background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 0; }
.tree .add { background: var(--addbg); color: var(--add); display: inline-block; min-width: 100%; }
.tree .del { background: var(--delbg); color: var(--del); display: inline-block; min-width: 100%; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
.cols h3 { font-size: 14px; margin: 0 0 6px; }
.claims { margin: 0; padding-left: 18px; } .claims li { margin-bottom: 8px; }
.ev { font-size: 12px; overflow-wrap: anywhere; font-family: ui-monospace, Menlo, monospace; }
.inferred { font-size: 11px; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; padding: 0 6px; font-style: normal; }
.muted { color: var(--muted); }
.files { list-style: none; margin: 0; padding: 0; }
.files li { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 90px; gap: 8px; align-items: center; padding: 2px 0; font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; }
.files .fname { overflow-wrap: anywhere; }
@media (max-width: 560px) { .files li { grid-template-columns: 22px minmax(0, 1fr) auto; } .bar { display: none; } }
.badge { display: inline-block; width: 18px; text-align: center; border-radius: 4px; font-size: 11px; font-weight: 700; color: #fff; background: var(--muted); font-family: ui-monospace, Menlo, monospace; }
.st-added .badge { background: var(--add); } .st-removed .badge { background: var(--del); } .st-renamed .badge { background: var(--accent); }
.plus { color: var(--add); } .minus { color: var(--del); } .arrow { color: var(--accent); font-weight: 700; }
.bar { display: flex; height: 8px; } .bar .a { background: var(--add); } .bar .d { background: var(--del); }
details.folder summary { cursor: pointer; color: var(--muted); margin-top: 12px; }
.concern { border: 1px solid var(--line); border-radius: 8px; margin-bottom: 10px; }
.concern > summary { cursor: pointer; padding: 10px 14px; background: var(--soft); border-radius: 8px; }
.concern[open] > summary { border-bottom: 1px solid var(--line); border-radius: 8px 8px 0 0; }
.concern .note { margin: 10px 14px; }
.author { margin: 0 14px 10px; padding: 8px 10px; background: var(--soft); border-radius: 6px; font-size: 13px; }
.author p { margin: 6px 0 0; }
.comparison { margin: 0 0 12px; }
.part { margin: 10px 14px 14px; }
.phead { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; margin-bottom: 4px; overflow-wrap: anywhere; }
.error { color: var(--del); border: 1px solid var(--del); border-radius: 6px; padding: 8px; white-space: pre-wrap; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 760px) { .pair { grid-template-columns: 1fr; } }
.visual img { width: 100%; border: 1px solid var(--line); border-radius: 6px; display: block; }
.side { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
.striprow { display: grid; grid-template-columns: 56px 1fr; gap: 8px; margin-bottom: 10px; align-items: start; }
.frames { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(180px, 1fr); gap: 8px; overflow-x: auto; }
.flabel { font-size: 12px; color: var(--muted); margin-top: 3px; }
.noimg { border: 1px dashed var(--line); border-radius: 6px; padding: 30px 8px; text-align: center; font-size: 12px; }
details.kind { border: 1px solid var(--line); border-radius: 6px; margin-bottom: 6px; }
details.kind > summary { cursor: pointer; padding: 6px 10px; }
details.kind .files { padding: 0 10px 8px; }
h3 { font-size: 14px; margin: 16px 0 4px; }
pre.example { background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.tablewrap { overflow-x: auto; }
table { border-collapse: collapse; font-size: 13px; }
th, td { border: 1px solid var(--line); padding: 5px 8px; text-align: left; vertical-align: top; }
th { background: var(--soft); }
td.changed { background: #fff8c5; }
@media (prefers-color-scheme: dark) { td.changed { background: #3b2e00; } }
footer { color: var(--muted); font-size: 12px; margin: 30px 0 10px; }
${TESTS_CSS}
</style></head>
<body><main>
<header>
  <div class="meta"><a href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(repo)}#${pr.number}</a> by ${esc(pr.author?.login)} · ${esc(pr.headRefName)} → ${esc(pr.baseRefName)} · <span class="plus">+${pr.additions}</span> <span class="minus">−${pr.deletions}</span> · ${files.length} files · at <code>${shortSha}</code></div>
  <h1>${esc(pr.title)}</h1>
  <div class="headline"><span class="type">${esc(spec.type)}</span>${text(spec.headline)}</div>
  ${spec.summary ? `<p>${text(spec.summary)}</p>` : ''}
</header>
${visuals ? `<section><h2>On screen</h2>${visuals}</section>` : ''}
${diagrams || tables || examples ? `<section><h2>Before and after</h2>${diagrams}${examples}${tables}</section>` : ''}
${testsSection.html}
<section><h2>Kept and changed</h2>
  <div class="cols"><div><h3>Behaves as before</h3>${claims(spec.kept)}</div><div><h3>Changes</h3>${claims(spec.changed)}</div></div>
  ${spec.unverified?.length ? `<p class="muted"><strong>Not checked:</strong> ${spec.unverified.map(text).join(' · ')}</p>` : ''}
</section>
<section><h2>Files</h2>${fileMap}</section>
<section><h2>Diff by concern</h2>${spec.comparison ? `<p class="comparison">${text(spec.comparison)}</p>` : ''}${concernHtml}</section>
<footer>Built by show-me from ${esc(repo)}#${pr.number} at ${esc(pr.headRefOid)}.</footer>
</main>
<script type="application/json" id="patches">${json(patchData)}</script>
<script type="module">
const status = { state: 'loading', errors: [] };
window.__showme = status;
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const fail = (where, e) => { status.errors.push(where + ': ' + (e?.message ?? e)); };

async function diagrams() {
  const blocks = [...document.querySelectorAll('pre.mermaid')];
  if (!blocks.length) return;
  const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', securityLevel: 'strict' });
  for (const el of blocks) {
    try {
      await mermaid.parse(el.textContent);
      await mermaid.run({ nodes: [el] });
    } catch (e) {
      fail(el.id, e);
      el.outerHTML = '<div class="error">Diagram failed to render: ' + String(e?.message ?? e).replace(/</g, '&lt;') + '</div>';
    }
  }
}

const patches = JSON.parse(document.getElementById('patches').textContent);
let lib;
async function renderDiffs(concern) {
  lib ??= await import('https://esm.sh/@pierre/diffs@1.2.10?bundle');
  for (const el of concern.querySelectorAll('.diff[data-part]:not([data-done])')) {
    el.dataset.done = '1';
    const patch = patches[el.dataset.concern][Number(el.dataset.part)];
    if (!patch) continue;
    try {
      const file = lib.parsePatchFiles(patch, undefined, true)[0]?.files[0];
      if (!file) throw new Error('no file in patch');
      new lib.FileDiff({ theme: { light: 'github-light', dark: 'github-dark' }, themeType: 'system', diffStyle: 'unified', overflow: 'wrap', disableFileHeader: true })
        .render({ fileDiff: file, containerWrapper: el });
    } catch (e) {
      fail(el.dataset.concern + '/' + el.dataset.part, e);
      el.innerHTML = '<pre class="tree">' + patch.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';
    }
  }
}
document.querySelectorAll('details.concern').forEach((d) => d.addEventListener('toggle', () => d.open && renderDiffs(d)));
// A link from the file map opens the concern it points to.
// A link opens every collapsed section around what it points to, such as a step in a storyboard.
const reveal = () => {
  for (let el = document.getElementById(decodeURIComponent(location.hash.slice(1))); el; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true;
  document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: 'center' });
};
addEventListener('hashchange', reveal);
document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a && a.getAttribute('href') === location.hash) reveal(); });

try {
  await Promise.all([diagrams(), ...[...document.querySelectorAll('details.concern[open]')].map(renderDiffs)]);
} catch (e) { fail('page', e); }
status.state = status.errors.length ? 'error' : 'ready';
</script>
</body></html>
`;

fs.writeFileSync(out, html);
warnings.forEach((w) => console.warn(`warning: ${w}`));
console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB, ${concerns.length} concern groups, ${files.length} files`);
