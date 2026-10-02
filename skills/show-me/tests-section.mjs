// The Tests section of a show-me page: for each group of tests, what it covers and what it
// does not, the facts the parser and coverage run found, and a storyboard of every step.
// build-page.mjs calls buildTestsSection; nothing here reads the network.
import fs from 'node:fs';
import path from 'node:path';
import { TEST_FILE, levelOf, patternsKey } from './parse-tests.mjs';

export const REASONS = {
  untested: 'Untested',
  'never-run': 'Never run',
  unchecked: 'Run but unchecked',
  'outside-layer': 'Outside this layer',
};
const LEVELS = {
  specified: ['Specified', 'An assertion says what the value should be.'],
  characterized: ['Characterized only', 'A snapshot records the value; nothing says why it is right.'],
  weak: ['Weak', 'Checked only for being there.'],
  unchecked: ['Unchecked', 'The cited steps assert nothing.'],
};
const KIND = { exact: 'exact', error: 'error', mock: 'mock call', helper: 'helper', snapshot: 'snapshot', truthy: 'exists', none: 'not checked' };

/**
 * Returns { html, problems, warnings }. `ctx` carries what build-page.mjs already has:
 * dir, spec, pr, files, esc, text, evidence (renders a list of { path, line } links), blob.
 */
export function buildTestsSection(ctx) {
  const { dir, spec, pr, files, esc, text, evidence, blob } = ctx;
  const problems = [];
  const warnings = [];
  const testsPath = path.join(dir, 'tests.json');
  // A renamed test file with no changes is a move, not new test work.
  const changedTests = files.filter((f) => f.status !== 'removed' && TEST_FILE.test(f.path) && !(f.previous && f.additions + f.deletions === 0));
  const groupsSpec = spec.testGroups ?? [];
  if (!fs.existsSync(testsPath)) {
    if (groupsSpec.length) problems.push('spec.json has testGroups but tests.json is missing: run parse-tests.mjs');
    else if (changedTests.length) warnings.push(`the PR changes ${changedTests.length} test files, but there is no Tests section: run parse-tests.mjs and write testGroups`);
    return { html: '', problems, warnings };
  }
  const parsed = JSON.parse(fs.readFileSync(testsPath, 'utf8'));
  if (parsed.sha !== pr.headRefOid) problems.push(`tests.json was parsed at ${parsed.sha.slice(0, 9)}, not the head ${pr.headRefOid.slice(0, 9)}: run parse-tests.mjs again`);
  if (parsed.patterns !== patternsKey(spec.testPatterns)) problems.push('testPatterns changed since tests.json was written: run parse-tests.mjs again');
  if (!groupsSpec.length) {
    if (changedTests.length) warnings.push('tests.json exists but spec.json has no testGroups, so the page has no Tests section');
    return { html: '', problems, warnings };
  }

  const byFile = new Map(parsed.files.map((f) => [f.path, f]));
  const stepById = new Map();
  const testById = new Map();
  for (const f of parsed.files) for (const t of f.tests ?? []) {
    testById.set(t.id, { test: t, file: f });
    for (const s of t.steps) stepById.set(s.id, { step: s, test: t, file: f });
  }
  // A cited id is a step (`a.test.ts:1.4`) or a whole test (`a.test.ts:1`).
  const resolve = (id) => (stepById.has(id) ? [stepById.get(id).step] : testById.has(id) ? testById.get(id).test.steps : null);
  const anchor = (id) => `step-${id.replace(/[^\w-]+/g, '-')}`;

  const grouped = new Set();
  const groups = groupsSpec.map((g, gi) => {
    const where = `test group "${g.title}"`;
    const gfiles = [];
    for (const p of g.files ?? []) {
      if (!byFile.has(p)) problems.push(`${where} names ${p}, which is not a test file the PR changes`);
      else { gfiles.push(byFile.get(p)); grouped.add(p); }
    }
    // Only the tests this PR adds or touches. A modified file's other tests are counted, not shown.
    const tests = gfiles.flatMap((f) => (f.tests ?? []).filter((t) => t.changed !== false));
    const untouched = gfiles.reduce((n, f) => n + (f.tests ?? []).filter((t) => t.changed === false).length, 0);
    const steps = tests.flatMap((t) => t.steps);
    const cited = new Set();
    const covered = (g.covered ?? []).map((c) => {
      const ids = c.steps ?? [];
      const found = [];
      for (const id of ids) {
        const r = resolve(id);
        if (!r) problems.push(`${where}: covered item "${c.claim}" cites ${id}, which is not a step or test (see parse-tests.mjs output)`);
        else {
          found.push(...r);
          const testId = id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : id;
          cited.add(testId);
        }
      }
      if (!ids.length) warnings.push(`${where}: covered item "${c.claim}" cites no steps`);
      return { ...c, level: levelOf(found.flatMap((s) => s.kinds)) };
    });
    for (const t of tests) if (!cited.has(t.id)) warnings.push(`${where}: no covered item cites test ${t.id} "${t.name}"`);
    if (!Array.isArray(g.notCovered)) warnings.push(`${where} has no notCovered list; write [] with a notCoveredNote if nothing is missing`);
    else if (!g.notCovered.length && !g.notCoveredNote) warnings.push(`${where}: notCovered is empty; add a notCoveredNote saying why`);
    for (const n of g.notCovered ?? []) if (!REASONS[n.reason]) problems.push(`${where}: not-covered item "${n.claim}" has reason "${n.reason}"; use one of ${Object.keys(REASONS).join(', ')}`);
    let coverage = null;
    if (g.coverage) {
      const cp = path.join(dir, g.coverage);
      if (!fs.existsSync(cp)) problems.push(`${where}: coverage file ${g.coverage} not found`);
      else coverage = JSON.parse(fs.readFileSync(cp, 'utf8'));
    }
    return { ...g, id: `tests-${gi + 1}`, gfiles, tests, steps, covered, coverage, untouched };
  });
  for (const f of changedTests) if (!grouped.has(f.path)) warnings.push(`no test group claims ${f.path}`);

  const count = (list, pred) => list.filter(pred).length;
  const stepLevels = (steps) => {
    const asserted = steps.filter((s) => !s.unchecked);
    return { specified: count(asserted, (s) => s.level === 'specified'), characterized: count(asserted, (s) => s.level === 'characterized'), weak: count(asserted, (s) => s.level === 'weak'), unchecked: count(steps, (s) => s.unchecked) };
  };

  const summaryRows = groups.map((g) => {
    const lv = stepLevels(g.steps);
    return `<tr><td><a href="#${g.id}">${text(g.title)}</a></td><td>${text(g.layer ?? '')}</td><td>${g.tests.length}</td>
      <td>${lv.specified}</td><td>${lv.characterized}</td><td>${lv.weak || ''}</td><td>${lv.unchecked || ''}</td>
      <td>${count(g.covered, () => true)}</td><td class="${(g.notCovered ?? []).length ? 'gap' : ''}">${(g.notCovered ?? []).length}</td></tr>`;
  }).join('');
  const summary = `<div class="tablewrap"><table class="tsum"><thead><tr><th rowspan="2">Group</th><th rowspan="2">Layer</th><th rowspan="2">Tests</th>
    <th colspan="4">Steps, by what checks them</th><th colspan="2">Behaviors</th></tr>
    <tr><th title="${esc(LEVELS.specified[1])}">Specified</th><th title="${esc(LEVELS.characterized[1])}">Snapshot only</th><th title="${esc(LEVELS.weak[1])}">Exists only</th><th>Not checked</th><th>Covered</th><th>Not covered</th></tr></thead>
    <tbody>${summaryRows}</tbody></table></div>`;

  const docs = spec.testPatterns?.docs ?? [];
  const docsHtml = docs.length
    ? `<div class="tdocs"><strong>What this repo says its tests are for</strong><ul>${docs.map((d) => `<li>${text(d.says)} ${evidence([{ path: d.path, line: d.line, end: d.end, label: d.label, ref: d.ref }])}</li>`).join('')}</ul></div>`
    : '';

  const stepChip = (id) => `<a class="chip" href="#${anchor(id)}">${esc(id.split(':').pop())}</a>`;
  const levelTag = (level) => `<span class="lvl lvl-${level}" title="${esc(LEVELS[level][1])}">${LEVELS[level][0]}</span>`;
  const elsewhere = (e) => {
    if (!e) return '';
    if (typeof e === 'string') return `<div class="elsewhere">${/^(nowhere|none)\b/i.test(e) ? `<strong>${text(e)}</strong>` : `Covered elsewhere: ${text(e)}`}</div>`;
    return `<div class="elsewhere">${e.nowhere ? '<strong>Not covered anywhere.</strong> ' : 'Covered elsewhere: '}${text(e.text ?? '')} ${evidence(e.evidence)}</div>`;
  };

  const facts = (g) => {
    const out = [];
    for (const t of g.tests) for (const fl of t.flags) out.push(`<li>Test <a href="#${anchor(t.id)}">${esc(t.id.split(':').pop())}</a> “${text(t.name)}”: ${esc(fl)}.</li>`);
    const unchecked = g.steps.filter((s) => s.unchecked);
    if (unchecked.length) out.push(`<li>${unchecked.length} call${unchecked.length === 1 ? '' : 's'} whose result nothing asserts on: ${unchecked.map((s) => stepChip(s.id)).join(' ')}</li>`);
    const flagged = g.steps.filter((s) => s.snapshot?.flags?.length);
    if (flagged.length) out.push(`<li>Snapshots that recorded something suspect: ${flagged.map((s) => `${stepChip(s.id)} ${esc(s.snapshot.flags.join(', '))}`).join(' · ')}</li>`);
    const missing = g.steps.filter((s) => s.snapshot?.missing);
    if (missing.length) out.push(`<li>Snapshot calls with no stored value (new, or not paired): ${missing.map((s) => stepChip(s.id)).join(' ')}</li>`);
    for (const f of g.gfiles) {
      if (f.mocks?.length) out.push(`<li><code>${esc(path.basename(f.path))}</code> mocks ${f.mocks.map((m) => `<code>${esc(m.module)}</code>`).join(', ')}.</li>`);
      if (f.unusedSnapshots?.length) out.push(`<li>${f.unusedSnapshots.length} snapshot entr${f.unusedSnapshots.length === 1 ? 'y' : 'ies'} in <code>${esc(path.basename(f.snapshotPath))}</code> that no step produces: ${f.unusedSnapshots.map((k) => `<code>${esc(k)}</code>`).join(', ')}</li>`);
      if (f.snapshotNote) out.push(`<li>${esc(f.snapshotNote)}</li>`);
    }
    return out.length ? `<div class="facts"><h4>Found by reading the tests</h4><ul>${out.join('')}</ul></div>` : '';
  };

  const coverageHtml = (g) => {
    if (!g.coverage) return '';
    const rows = g.coverage.files.filter((f) => f.functionsNotCalled.length || f.branchesNotTaken.length || f.linesNotRun.length);
    const full = g.coverage.files.length - rows.length;
    const link = (p, a, b) => `<a class="ev" href="${esc(blob({ path: p, line: a, end: b !== a ? b : undefined }))}" target="_blank" rel="noopener">${a === b ? a : `${a}–${b}`}</a>`;
    const list = rows.map((f) => {
      const pct = Math.round((100 * f.statements.hit) / f.statements.total);
      const fns = f.functionsNotCalled.map((x) => `${x.name ? `<code>${esc(x.name)}</code>` : 'an anonymous function'} ${link(f.path, x.line, x.line)}`);
      const brs = f.branchesNotTaken.map((b) => `${link(f.path, b.line, b.line)} ${esc(b.says)}`);
      const lines = f.linesNotRun.map(([a, b]) => link(f.path, a, b));
      return `<li><details><summary><code>${esc(f.path)}</code> <span class="muted">${pct}% of statements run · ${f.functionsNotCalled.length} functions never called · ${f.branchesNotTaken.length} branches never taken</span></summary>
        ${fns.length ? `<p><strong>Functions never called:</strong> ${fns.join(', ')}</p>` : ''}
        ${brs.length ? `<p><strong>Branches never taken:</strong> ${brs.join(' · ')}</p>` : ''}
        ${lines.length ? `<p><strong>Lines never run:</strong> ${lines.join(', ')}</p>` : ''}</details></li>`;
    }).join('');
    return `<div class="facts"><h4>Code this group's run never reached</h4>
      <p class="muted">From running only this group's tests with coverage${g.coverageCommand ? `: <code>${esc(g.coverageCommand)}</code>` : ''}. ${full ? `${full} other reached file${full === 1 ? ' was' : 's were'} run in full.` : ''} Reaching a line is not the same as checking what it did.</p>
      ${rows.length ? `<ul class="cov">${list}</ul>` : '<p>Every line of every file it reached was run.</p>'}</div>`;
  };

  const stepRow = (s) => {
    const who = s.subject?.actor ? `<span class="actor">${esc(s.subject.actor)}</span>` : '';
    const call = s.subject?.call ? `<code>${esc(s.subject.call)}</code>` : `<code>${esc(s.subject?.text ?? '')}</code>`;
    const input = s.subject?.input ? `<div class="input"><code>${esc(s.subject.input)}</code></div>` : '';
    const via = s.subject?.via ? `<div class="muted">checks <code>${esc(s.subject.via)}</code></div>` : '';
    const check = s.unchecked ? '<span class="skind k-none">not checked</span>'
      : `${s.kinds.map((k) => `<span class="skind k-${k}">${KIND[k]}</span>`).join(' ')} <code class="matcher">${esc(s.matcher)}</code>${s.expected ? ` <code>${esc(s.expected)}</code>` : ''}${s.repeated ? ' <span class="muted">in a loop</span>' : ''}`;
    const value = s.snapshot?.value != null
      ? `<details class="snap"><summary>${s.snapshot.inline ? 'inline snapshot' : 'snapshot'} · ${s.snapshot.value.split('\n').length} line${s.snapshot.value.includes('\n') ? 's' : ''}${s.snapshot.flags ? ` · <span class="warn">${esc(s.snapshot.flags.join(', '))}</span>` : ''}</summary><pre>${esc(s.snapshot.value)}</pre></details>`
      : s.snapshot?.missing ? '<span class="muted">no stored value</span>' : '';
    return `<tr id="${anchor(s.id)}" class="lv-${s.unchecked ? 'none' : s.level}"><td class="sid"><a href="${esc(blob({ path: s._file, line: s.line }))}" target="_blank" rel="noopener">${esc(s.id.split(':').pop())}</a></td>
      <td>${who}</td><td>${call}${input}${via}</td><td>${check}${value}</td></tr>`;
  };
  const storyboard = (g) => g.tests.length
    ? `<details class="story"><summary>Storyboard: ${g.tests.length} test${g.tests.length === 1 ? '' : 's'}, ${g.steps.length} steps</summary>
      ${g.untouched ? `<p class="muted">${g.untouched} other test${g.untouched === 1 ? '' : 's'} in ${g.gfiles.length === 1 ? 'this file' : 'these files'} that the PR does not touch are left out.</p>` : ''}
      ${g.gfiles.map((f) => (f.tests ?? []).filter((t) => t.changed !== false).map((t) => `<div class="stest" id="${anchor(t.id)}"><div class="sname"><a href="${esc(blob({ path: f.path, line: t.line }))}" target="_blank" rel="noopener">${esc(path.basename(f.path))}:${t.line}</a> <strong>${text(t.fullName)}</strong>${t.modifier ? ` <span class="warn">${esc(t.modifier)}</span>` : ''}</div>
        <div class="tablewrap"><table class="steps"><thead><tr><th>Step</th><th>As</th><th>Call</th><th>Checked by</th></tr></thead>
        <tbody>${t.steps.map((s) => stepRow({ ...s, _file: f.path })).join('')}</tbody></table></div></div>`).join('')).join('')}
    </details>`
    : '';

  const cards = groups.map((g, i) => {
    const lv = stepLevels(g.steps);
    const coveredHtml = g.covered.length
      ? `<ul class="claims">${g.covered.map((c) => `<li>${levelTag(c.level)} <span>${text(c.claim)}${c.inferred ? ' <em class="inferred">inferred</em>' : ''}</span> ${(c.steps ?? []).map(stepChip).join(' ')} ${evidence(c.evidence)}</li>`).join('')}</ul>`
      : '<p class="muted">Nothing listed.</p>';
    const nc = g.notCovered ?? [];
    const notHtml = nc.length
      ? `<ul class="claims">${nc.map((n) => `<li><span class="why why-${esc(n.reason)}">${esc(REASONS[n.reason] ?? n.reason)}</span> <span>${text(n.claim)}${n.inferred ? ' <em class="inferred">inferred</em>' : ''}</span> ${evidence(n.evidence)}${elsewhere(n.elsewhere)}</li>`).join('')}</ul>`
      : `<p>${text(g.notCoveredNote ?? 'Nothing listed.')}</p>`;
    return `<details class="tgroup" id="${g.id}"${i === 0 ? ' open' : ''}>
      <summary><strong>${text(g.title)}</strong>${g.layer ? ` <span class="layer">${text(g.layer)}</span>` : ''} <span class="muted">${g.gfiles.map((f) => esc(path.basename(f.path))).join(', ')} · ${lv.specified} specified, ${lv.characterized} snapshot only</span> <span class="gapcount">${nc.length} not covered</span></summary>
      ${g.summary ? `<p class="note">${text(g.summary)}</p>` : ''}
      <div class="cols tcols"><div><h3>Covered</h3>${coveredHtml}</div><div class="notcov"><h3>Not covered</h3>${notHtml}</div></div>
      ${facts(g)}${coverageHtml(g)}${storyboard(g)}
    </details>`;
  }).join('');

  const html = `<section id="tests"><h2>Tests</h2>
    <p class="muted">For each group: what its tests cover, and what they do not. <strong>Specified</strong> means an assertion says what the value should be; <strong>snapshot only</strong> means the value is recorded and nothing says why it is right.</p>
    ${docsHtml}${summary}${cards}</section>`;
  return { html, problems, warnings };
}

export const TESTS_CSS = `
.tdocs { background: var(--soft); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 13px; }
.tdocs ul { margin: 4px 0 0; padding-left: 18px; }
table.tsum td:nth-child(n+3), table.tsum th { text-align: center; }
table.tsum td:first-child { text-align: left; }
td.gap { font-weight: 700; color: var(--del); }
.tgroup { border: 1px solid var(--line); border-radius: 8px; margin: 12px 0; }
.tgroup > summary { cursor: pointer; padding: 10px 14px; background: var(--soft); border-radius: 8px; }
.tgroup[open] > summary { border-bottom: 1px solid var(--line); border-radius: 8px 8px 0 0; }
.tgroup > .note, .tgroup > .cols, .tgroup > .facts, .tgroup > .story { margin: 10px 14px; }
.layer { font-size: 11px; border: 1px solid var(--line); border-radius: 10px; padding: 0 7px; color: var(--muted); }
.gapcount { font-size: 12px; color: var(--del); font-weight: 600; margin-left: 6px; }
.tcols > div { min-width: 0; }
.notcov { border-left: 3px solid var(--del); padding-left: 12px; }
.lvl, .why, .skind { display: inline-block; font-size: 11px; border-radius: 8px; padding: 0 6px; margin-right: 2px; white-space: nowrap; border: 1px solid var(--line); }
.lvl-specified, .k-exact, .k-error, .k-mock, .k-helper { background: var(--addbg); color: var(--add); border-color: transparent; }
.lvl-characterized, .k-snapshot { background: #fff8c5; color: #7d4e00; border-color: transparent; }
.lvl-weak, .lvl-unchecked, .k-truthy, .k-none { background: var(--delbg); color: var(--del); border-color: transparent; }
.why { background: var(--delbg); color: var(--del); border-color: transparent; }
.why-outside-layer { background: var(--soft); color: var(--muted); border-color: var(--line); }
@media (prefers-color-scheme: dark) { .lvl-characterized, .k-snapshot { background: #3b2e00; color: #f2cc60; } }
.chip { font-family: ui-monospace, Menlo, monospace; font-size: 11px; border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
.elsewhere { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.facts h4 { font-family: inherit; color: var(--fg); font-size: 13px; margin: 0 0 4px; }
.facts ul { margin: 0; padding-left: 18px; font-size: 13px; }
.facts p { margin: 4px 0; font-size: 13px; }
ul.cov { list-style: none; padding-left: 0; }
ul.cov summary { cursor: pointer; overflow-wrap: anywhere; }
.story > summary { cursor: pointer; font-weight: 600; }
.stest { margin: 10px 0 16px; }
.sname { margin-bottom: 4px; overflow-wrap: anywhere; }
table.steps { width: 100%; font-size: 12.5px; table-layout: fixed; }
table.steps th:nth-child(1) { width: 52px; } table.steps th:nth-child(2) { width: 15%; } table.steps th:nth-child(3) { width: 38%; }
table.steps td { overflow-wrap: anywhere; }
table.steps tr:target { outline: 2px solid var(--accent); }
.steps .actor { font-weight: 600; font-size: 12px; }
.steps .input code { font-size: 11.5px; color: var(--muted); background: none; padding: 0; }
.steps .matcher { font-size: 11.5px; }
details.snap summary { cursor: pointer; font-size: 12px; color: var(--muted); margin-top: 2px; }
details.snap pre { background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 8px; max-height: 420px; overflow: auto; white-space: pre-wrap; margin: 4px 0 0; }
.warn { color: var(--del); font-weight: 600; }
/* On a phone, each step stacks: number and actor on one line, then the call, then the check. */
@media (max-width: 560px) {
  table.steps thead { display: none; }
  table.steps, table.steps tbody, table.steps tr, table.steps td { display: block; width: auto; }
  table.steps tr { border-top: 1px solid var(--line); padding: 6px 0; }
  table.steps td { border: none; padding: 2px 4px; }
  table.steps td.sid, table.steps td:nth-child(2) { display: inline-block; }
}
`;
