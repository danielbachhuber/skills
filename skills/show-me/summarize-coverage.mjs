// Summarize what a coverage run never reached, for one group of tests.
// Usage: node summarize-coverage.mjs <coverage-final.json> --root <checkout> [--out <summary.json>] [--include <regex>]
// Reads an Istanbul coverage-final.json (jest and vitest both write one with
// `--coverageReporters=json` / `--coverage.reporter=json`) and, for each source file the
// run reached, lists the functions never called, the branches never taken, and the line
// ranges never run, with paths relative to --root. Test files are left out, and so are files
// the run did not reach unless --include names them.
// Prints the summary and, with --out, writes it as JSON for build-page.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST = /(\.(test|spec)\.[cm]?[jt]sx?$)|\/__tests__\/|\/__mocks__\/|\/test-support\//;

// Merge line numbers into ranges, such as [[12, 14], [20, 20]].
const ranges = (lines) => {
  const out = [];
  for (const l of [...new Set(lines)].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && l <= last[1] + 1) last[1] = l;
    else out.push([l, l]);
  }
  return out;
};

const ARM = {
  if: ['the condition is true', 'the condition is false'],
  'cond-expr': ['the condition is true', 'the condition is false'],
  'binary-expr': null,
  'default-arg': ['the default is used'],
  switch: null,
};

export function summarize(coverage, { root, include } = {}) {
  const files = [];
  const realRoot = root && fs.existsSync(root) ? fs.realpathSync(root) : root;
  for (const [abs, fc] of Object.entries(coverage)) {
    // Coverage paths are real paths, so /tmp shows up as /private/tmp on macOS.
    const file = fc.path ?? abs;
    const rel = root ? path.relative(file.startsWith(root) ? root : realRoot, file) : file;
    if (rel.startsWith('..') || rel.includes('node_modules/') || TEST.test(`/${rel}`)) continue;
    if (include && !new RegExp(include).test(rel)) continue;
    const s = Object.values(fc.s ?? {});
    const hit = s.filter((n) => n > 0).length;
    // Loading a module runs its top level, so without --include a file counts as reached only
    // when one of its functions ran. Files --include names are always listed: they are the
    // ones the group is about, and a file none of whose code ran is worth saying so.
    if (!include && !Object.values(fc.f ?? {}).some((n) => n > 0)) continue;
    const unrunLines = Object.entries(fc.s).filter(([, n]) => n === 0).flatMap(([id]) => {
      const loc = fc.statementMap[id];
      const out = [];
      for (let l = loc.start.line; l <= loc.end.line; l++) out.push(l);
      return out;
    });
    const fns = Object.entries(fc.f ?? {}).filter(([, n]) => n === 0).map(([id]) => {
      const fn = fc.fnMap[id];
      return { name: /^\(anonymous_\d+\)$/.test(fn.name) ? null : fn.name, line: (fn.decl ?? fn.loc).start.line };
    });
    const branches = [];
    for (const [id, counts] of Object.entries(fc.b ?? {})) {
      const br = fc.branchMap[id];
      // v8 coverage reports a function body as a one-armed branch; the uncalled function
      // already says that.
      if (counts.length < 2 && br.type === 'branch') continue;
      counts.forEach((n, i) => {
        if (n > 0) return;
        const loc = br.locations?.[i] ?? br.loc;
        const words = ARM[br.type]?.[i] ?? (br.type === 'switch' ? 'this case' : br.type === 'binary-expr' ? 'this operand' : 'this path');
        branches.push({ line: loc.start.line, type: br.type, arm: i, says: words });
      });
    }
    files.push({
      path: rel,
      statements: { hit, total: s.length },
      functionsNotCalled: fns,
      branchesNotTaken: branches.sort((a, b) => a.line - b.line),
      linesNotRun: ranges(unrunLines),
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const input = args[0];
  if (!input || !opt('--root')) {
    console.error('usage: node summarize-coverage.mjs <coverage-final.json> --root <checkout> [--out <summary.json>] [--include <regex>]');
    process.exit(2);
  }
  const files = summarize(JSON.parse(fs.readFileSync(input, 'utf8')), { root: path.resolve(opt('--root')), include: opt('--include') });
  if (opt('--out')) fs.writeFileSync(opt('--out'), JSON.stringify({ files }, null, 1));
  for (const f of files) {
    const pct = Math.round((100 * f.statements.hit) / f.statements.total);
    console.log(`${f.path}  ${pct}% of statements run`);
    if (f.functionsNotCalled.length) console.log(`  functions never called: ${f.functionsNotCalled.map((x) => `${x.name ?? 'anonymous'} L${x.line}`).join(', ')}`);
    if (f.branchesNotTaken.length) console.log(`  branches never taken: ${f.branchesNotTaken.map((b) => `L${b.line} ${b.says}`).join(', ')}`);
    if (f.linesNotRun.length) console.log(`  lines never run: ${f.linesNotRun.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(', ')}`);
  }
}
