// Parse the tests a pull request adds or changes into steps, for the page's Tests section.
// Usage: node parse-tests.mjs <workdir> [--root <checkout at the head SHA>]
// Reads pr.json and files.json (from fetch-pr.sh) and, when it exists, spec.json's
// testPatterns. Reads each changed test file and its snapshot file from --root, or fetches
// them at the head SHA into <workdir>/src (needs the network). Writes <workdir>/tests.json
// and prints an outline with the step ids that spec.json's testGroups cite.
//
// A step is one assertion, or one call to an actor (from testPatterns.actorFactories)
// whose result nothing asserts on. Each assertion gets a kind:
//   exact, error, mock, helper  say what the value should be (specified)
//   snapshot                    records the value without saying why (characterized)
//   truthy                      checks only that something is there (weak)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEPS = '/tmp/show-me/.deps';
export function loadTypeScript() {
  const req = createRequire(path.join(DEPS, 'index.js'));
  try {
    return req('typescript');
  } catch {
    fs.mkdirSync(DEPS, { recursive: true });
    execFileSync('npm', ['i', '--silent', '--no-audit', '--no-fund', '--prefix', DEPS, 'typescript@5'], { stdio: 'inherit' });
    return req('typescript');
  }
}

export const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(\/__tests__\/.+\.[cm]?[jt]sx?$)/;
const SPECIFIED = new Set(['exact', 'error', 'mock', 'helper']);
export const levelOf = (kinds) =>
  kinds.some((k) => SPECIFIED.has(k)) ? 'specified' : kinds.includes('snapshot') ? 'characterized' : kinds.includes('truthy') ? 'weak' : 'unchecked';

const TRUTHY = new Set(['toBeDefined', 'toBeTruthy', 'toBeFalsy', 'toBeNull', 'toBeUndefined']);
export function kindOf(matcher, modifiers) {
  if (/Snapshot$|^toHaveScreenshot$/.test(matcher)) return 'snapshot';
  if (/^toThrow/.test(matcher) || (modifiers.includes('rejects') && !/Snapshot$/.test(matcher))) return 'error';
  if (/^(toHaveBeen|toBeCalled|toHaveReturned|toHaveLastReturned|toHaveNthReturned|lastCalledWith|nthCalledWith)/.test(matcher)) return 'mock';
  // `not.toBeNull()` and `toBeDefined()` say only that something is there. `toBeNull()`
  // and `toBeUndefined()` on their own say what the value is.
  if (TRUTHY.has(matcher) && (modifiers.includes('not') || !/^(toBeNull|toBeUndefined)$/.test(matcher))) return 'truthy';
  return 'exact';
}

// Jest and vitest snapshot files are `exports[`key`] = `value`;` lines. Parsed, not run:
// the file comes from the pull request.
export function parseSnapshotFile(ts, text) {
  const out = new Map();
  const sf = ts.createSourceFile('x.snap.js', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  for (const st of sf.statements) {
    const e = st.expression;
    if (!e || !ts.isBinaryExpression(e) || !ts.isElementAccessExpression(e.left)) continue;
    const key = e.left.argumentExpression;
    if (!key || !(ts.isNoSubstitutionTemplateLiteral(key) || ts.isStringLiteral(key))) continue;
    const v = e.right;
    const value = ts.isNoSubstitutionTemplateLiteral(v) || ts.isStringLiteral(v) ? v.text : v.getText?.(sf) ?? '';
    out.set(key.text, value.replace(/^\n/, '').replace(/\n$/, ''));
  }
  return out;
}

const literal = (ts, n) => (n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null);
const unwrap = (ts, n) => {
  while (n && (ts.isAwaitExpression(n) || ts.isParenthesizedExpression(n) || ts.isAsExpression?.(n) || ts.isNonNullExpression(n))) n = n.expression;
  return n;
};
// a.b.c(...) -> ['a', 'b', 'c']; stops at anything that is not a name or a call.
const chain = (ts, n) => {
  const names = [];
  n = unwrap(ts, n);
  while (n) {
    if (ts.isCallExpression(n)) n = n.expression;
    else if (ts.isPropertyAccessExpression(n)) { names.unshift(n.name.text); n = n.expression; }
    else if (ts.isElementAccessExpression(n)) n = n.expression;
    else if (ts.isIdentifier(n)) { names.unshift(n.text); break; }
    else if (n.kind === ts.SyntaxKind.ThisKeyword) { names.unshift('this'); break; }
    else return names.length ? ['?', ...names] : [];
  }
  return names;
};
// What a chain hangs off: `editor` in `editor.spaces.list()`, `apiAs(EDITOR)` in
// `apiAs(EDITOR).spaces.list()`, or the call itself for a bare `f()`.
const rootOfWith = (ts) => (n) => {
  n = unwrap(ts, n);
  for (;;) {
    if (ts.isCallExpression(n)) {
      const inner = unwrap(ts, n.expression);
      if (ts.isPropertyAccessExpression(inner) || ts.isElementAccessExpression(inner)) { n = unwrap(ts, inner.expression); continue; }
      return n;
    }
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) { n = unwrap(ts, n.expression); continue; }
    return n;
  }
};
const firstCall = (ts, n) => {
  let found = null;
  const visit = (x) => {
    if (found) return;
    if (ts.isCallExpression(x)) { found = x; return; }
    ts.forEachChild(x, visit);
  };
  visit(n);
  return found;
};
const clip = (s, n = 90) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

const TEST_NAMES = new Set(['test', 'it', 'xit', 'fit', 'xtest']);
const SUITE_NAMES = new Set(['describe', 'xdescribe', 'fdescribe', 'suite']);
const HOOKS = new Set(['beforeEach', 'beforeAll', 'afterEach', 'afterAll']);

/**
 * Parse one test file. `patterns` is spec.json's testPatterns. Returns the tests with
 * their steps, the modules the file mocks, and any file-level flags.
 */
export function parseTestFile(ts, filePath, text, patterns = {}) {
  const kind = /\.[cm]?tsx$/.test(filePath) ? ts.ScriptKind.TSX : /\.[cm]?jsx?$/.test(filePath) ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const src = (n) => n.getText(sf);
  const factories = new Set(patterns.actorFactories ?? []);
  const helpers = new Set(patterns.assertionHelpers ?? []);
  const isHelper = (name) => helpers.has(name) || /^(expect|assert)[A-Z]\w*$/.test(name);

  const rootOf = rootOfWith(ts);
  const mocks = [];
  const tests = [];
  const fileDecls = new Map();
  // Actors declared outside any test, such as `const moderator = apiAs(MODERATOR)` at the top.
  const fileActors = new Map();

  // Which call a test framework function is: test, test.skip, describe.each(...), and so on.
  const frameworkCall = (call) => {
    const names = chain(ts, call.expression);
    if (!names.length) return null;
    const [head, ...rest] = names;
    const each = rest.includes('each') || ts.isCallExpression(call.expression);
    const modifier = rest.find((m) => ['skip', 'only', 'todo', 'concurrent', 'fails', 'failing'].includes(m))
      ?? (head.startsWith('x') ? 'skip' : head.startsWith('f') && head !== 'fit' ? 'only' : head === 'fit' ? 'only' : null);
    if (TEST_NAMES.has(head)) return { type: 'test', modifier, each };
    if (SUITE_NAMES.has(head)) return { type: 'suite', modifier, each };
    if (HOOKS.has(head)) return { type: 'hook', name: head };
    return null;
  };

  const actorFrom = (init) => {
    const call = unwrap(ts, init);
    if (!call || !ts.isCallExpression(call)) return null;
    const names = chain(ts, call.expression);
    if (!names.length || !factories.has(names[names.length - 1])) return null;
    const arg = call.arguments[0];
    return arg ? clip(src(arg), 40) : names[names.length - 1];
  };

  const collectActors = (node, into) => {
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        const actor = actorFrom(n.initializer);
        if (actor) into.set(n.name.text, actor);
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    collectActors(st, fileActors);
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) fileDecls.set(d.name.text, { init: d.initializer });
  }

  const walkSuite = (node, suiteNames) => {
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const names = chain(ts, n.expression);
        if ((names[0] === 'jest' || names[0] === 'vi') && /^(mock|doMock|unstable_mockModule)$/.test(names[1] ?? '')) {
          const target = literal(ts, n.arguments[0]);
          if (target) mocks.push({ module: target, line: lineOf(n), factory: n.arguments.length > 1 });
        }
        const fw = frameworkCall(n);
        if (fw && fw.type !== 'hook') {
          const nameNode = n.arguments[0];
          const name = literal(ts, nameNode) ?? (nameNode ? src(nameNode) : '(unnamed)');
          const body = n.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
          if (fw.type === 'suite') {
            if (body) walkSuite(body.body, [...suiteNames, name]);
            return;
          }
          tests.push({ ...parseTest({ name, suiteNames, fw, body, line: lineOf(n), dynamicName: !literal(ts, nameNode) }), endLine: sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1 });
          return;
        }
        if (fw?.type === 'hook') return;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
  };

  const parseTest = ({ name, suiteNames, fw, body, line, dynamicName }) => {
    const fullName = [...suiteNames, name].join(' ');
    const actors = new Map(fileActors);
    if (body) collectActors(body, actors);
    // Each local variable's initializer, so `expect(blocked.items)` can name the call behind `blocked`.
    const decls = new Map();
    const used = new Set();
    const steps = [];
    const flags = [];
    if (fw.modifier === 'skip' || fw.modifier === 'todo' || fw.modifier === 'only') flags.push(`${fw.modifier} is left in`);
    if (fw.each || dynamicName) flags.push('names come from a table, so snapshot keys are not matched');

    // A variable is a receiver, such as `const editor = apiAs(EDITOR)`, when it comes from a
    // factory in testPatterns or the test calls methods on it, as in `await editor.spaces.list()`.
    // A variable that holds an awaited result, such as `const blocked = await ...list()`, is
    // a value, and an assertion on it is an assertion on that call.
    const receivers = new Set(actors.keys());
    const scan = (n) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(unwrap(ts, n.expression))) {
        const root = rootOf(n);
        const d = root && ts.isIdentifier(root) ? decls.get(root.text) ?? fileDecls.get(root.text) : null;
        const init = d && unwrap(ts, d.init);
        if (d && !ts.isAwaitExpression(d.init) && init && ts.isCallExpression(init) && chain(ts, n).length > 1) receivers.add(root.text);
      }
      ts.forEachChild(n, scan);
    };
    const collectDecls = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) decls.set(n.name.text, { init: n.initializer });
      ts.forEachChild(n, collectDecls);
    };
    if (body) { collectDecls(body); scan(body); }
    const declOf = (name) => decls.get(name) ?? fileDecls.get(name);
    const isValue = (name) => {
      const d = declOf(name);
      return d && (ts.isAwaitExpression(d.init) || !receivers.has(name));
    };
    const actorLabel = (root) => {
      if (ts.isIdentifier(root)) {
        if (actors.has(root.text)) return actors.get(root.text);
        const d = declOf(root.text);
        return d ? actorLabel(unwrap(ts, d.init)) ?? root.text : root.text;
      }
      if (ts.isCallExpression(root)) {
        const names = chain(ts, root.expression);
        if (factories.has(names[names.length - 1]) && root.arguments[0]) return clip(src(root.arguments[0]), 40);
        return clip(src(root), 40);
      }
      return null;
    };
    const inputOf = (call) => (call && ts.isCallExpression(call) && call.arguments.length ? clip(call.arguments.map(src).join(', '), 100) : undefined);
    const describeSubject = (expr) => {
      expr = unwrap(ts, expr);
      if (!expr) return { text: '' };
      if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        const inner = firstCall(ts, expr.body);
        return inner ? describeSubject(inner) : { text: clip(src(expr)) };
      }
      const names = chain(ts, expr);
      const root = rootOf(expr);
      const text = clip(src(expr));
      if (root && ts.isIdentifier(root) && isValue(root.text)) {
        used.add(root.text);
        const from = describeSubject(declOf(root.text).init);
        return { ...from, via: names.join('.') || root.text, text };
      }
      if (root && root !== expr && (ts.isCallExpression(root) || (ts.isIdentifier(root) && receivers.has(root.text)))) {
        return { actor: actorLabel(root), call: names.slice(1).join('.'), input: inputOf(expr), text };
      }
      return { call: ts.isCallExpression(expr) && names.length ? names.join('.') : undefined, input: inputOf(expr), text };
    };

    // Inside a loop or a callback, one expect runs any number of times.
    const repeated = (n) => {
      for (let p = n.parent; p && p !== body; p = p.parent) {
        if (ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p) || ts.isWhileStatement(p) || ts.isDoStatement(p)) return true;
        if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && p.parent && ts.isCallExpression(p.parent)) {
          const callee = chain(ts, p.parent.expression);
          if (/^(map|forEach|flatMap|filter|reduce|some|every|each)$/.test(callee[callee.length - 1] ?? '')) return true;
        }
      }
      return false;
    };

    const snapCounters = new Map();
    let snapshotsUncertain = fw.each || dynamicName;
    const snapKey = (hint) => {
      const base = hint ? `${fullName}: ${hint}` : fullName;
      const n = (snapCounters.get(base) ?? 0) + 1;
      snapCounters.set(base, n);
      return `${base} ${n}`;
    };

    const expectCall = (call) => {
      // matcher(...) on expect(x)[.not|.rejects|.resolves]*
      if (!ts.isPropertyAccessExpression(call.expression)) return null;
      const matcher = call.expression.name.text;
      const modifiers = [];
      let e = call.expression.expression;
      while (ts.isPropertyAccessExpression(e) && ['not', 'rejects', 'resolves'].includes(e.name.text)) {
        modifiers.unshift(e.name.text);
        e = e.expression;
      }
      if (!ts.isCallExpression(e)) return null;
      const head = chain(ts, e.expression);
      if (head[0] !== 'expect' || (head.length > 1 && !['soft', 'poll'].includes(head[1]))) return null;
      return { matcher, modifiers, subjectNode: e.arguments[0], args: call.arguments };
    };

    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
        decls.set(n.name.text, { init: n.initializer, line: lineOf(n), node: n });
      }
      if (ts.isCallExpression(n)) {
        const ex = expectCall(n);
        if (ex) {
          const kind = kindOf(ex.matcher, ex.modifiers);
          const step = { line: lineOf(n), kinds: [kind], matcher: [...ex.modifiers, ex.matcher].join('.'), subject: describeSubject(ex.subjectNode) };
          if (repeated(n)) { step.repeated = true; if (kind === 'snapshot') snapshotsUncertain = true; }
          if (kind === 'snapshot') {
            if (/Inline/.test(ex.matcher)) {
              const inline = ex.args.map((a) => literal(ts, a)).find((s) => s != null);
              if (inline != null) step.snapshot = { inline: true, value: inline.replace(/^\n/, '').replace(/\n\s*$/, '') };
            } else if (ex.matcher !== 'toHaveScreenshot' && ex.matcher !== 'toMatchFileSnapshot') {
              const hint = ex.args.map((a) => literal(ts, a)).find((s) => s != null);
              step.snapshot = { key: snapKey(hint) };
            }
          } else if (ex.args.length) {
            step.expected = clip(ex.args.map(src).join(', '), 80);
          }
          steps.push(step);
          ts.forEachChild(n, visit);
          return;
        }
        const names = chain(ts, n.expression);
        const last = names[names.length - 1];
        if (names.length === 1 && isHelper(last) && last !== 'expect') {
          const subjectNode = n.arguments[0];
          steps.push({ line: lineOf(n), kinds: ['helper'], matcher: last, subject: describeSubject(subjectNode) });
          ts.forEachChild(n, visit);
          return;
        }
        // A call to an actor's API. Whether anything checks its result is settled below.
        if (names.length > 1 && actors.has(names[0]) && !insideExpect(n)) {
          const decl = n.parent && ts.isAwaitExpression(n.parent) ? n.parent.parent : n.parent;
          const declName = decl && ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name) ? decl.name.text : null;
          steps.push({ line: lineOf(n), kinds: [], matcher: '', subject: { actor: actors.get(names[0]), call: names.slice(1).join('.'), input: n.arguments.length ? clip(n.arguments.map(src).join(', '), 100) : undefined, text: clip(src(n)) }, resultIn: declName, pendingCheck: true });
        }
      }
      ts.forEachChild(n, visit);
    };
    const insideExpect = (n) => {
      for (let p = n.parent; p && p !== body; p = p.parent) {
        if (ts.isCallExpression(p)) {
          const head = chain(ts, p.expression);
          if (head[0] === 'expect' || (head.length === 1 && isHelper(head[0]))) return true;
        }
      }
      return false;
    };
    if (body) visit(body.body ?? body);

    // A call whose result went into a variable is checked if any later assertion reads it.
    const finalSteps = steps.filter((s) => !(s.pendingCheck && s.resultIn && used.has(s.resultIn))).map((s) => {
      if (s.pendingCheck) {
        const { pendingCheck, ...rest } = s;
        return { ...rest, kinds: ['none'], unchecked: true };
      }
      return s;
    });
    const counts = {};
    for (const s of finalSteps) for (const k of s.kinds) counts[k] = (counts[k] ?? 0) + 1;
    const assertions = finalSteps.filter((s) => !s.unchecked).length;
    if (!assertions && fw.modifier !== 'todo') flags.push('no assertions');
    else if (assertions && finalSteps.filter((s) => !s.unchecked).every((s) => s.kinds.includes('truthy'))) flags.push('checks only that values exist');
    return { name, fullName, line, modifier: fw.modifier, steps: finalSteps, counts, flags, snapshotsUncertain };
  };

  walkSuite(sf, []);
  return { mocks, tests };
}

// Find the snapshot file for a test file: an explicit mapping, then __snapshots__ beside
// it, then the nearest __snapshots__/<name>.snap anywhere in the tree.
export function findSnapshotPath(testPath, treePaths, patterns = {}) {
  if (patterns.snapshots?.[testPath]) return patterns.snapshots[testPath];
  const base = path.basename(testPath);
  const beside = path.join(path.dirname(testPath), '__snapshots__', `${base}.snap`);
  if (treePaths.has(beside)) return beside;
  const stem = base.replace(/\.[cm]?[jt]sx?$/, '');
  const candidates = [...treePaths].filter((p) => /\.snap$/.test(p) && path.basename(p).startsWith(`${stem}.`));
  if (!candidates.length) return null;
  const shared = (p) => { const a = p.split('/'); const b = testPath.split('/'); let i = 0; while (a[i] === b[i]) i++; return i; };
  return candidates.sort((a, b) => shared(b) - shared(a))[0];
}

// A snapshot that recorded an error where the step expected none, or recorded nothing.
const flagValue = (v, step) => {
  const out = [];
  const expectsError = /rejects|Throw/.test(step.matcher);
  if (!expectsError && /^\[?\w*Error[\]: {]/m.test(v)) out.push('recorded an error');
  if (/^(undefined|null|\{\}|\[\])$/.test(v.trim())) out.push(`recorded ${v.trim()}`);
  return out;
};

// The new-side line numbers each file's diff adds or changes, from pr.diff.
export function changedLinesByFile(diff) {
  const out = new Map();
  for (const block of diff.split(/^(?=diff --git )/m)) {
    const m = block.match(/^diff --git a\/(.+?) b\/(.+)$/m);
    if (!m) continue;
    const lines = new Set();
    let n = 0;
    for (const l of block.split('\n')) {
      const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
      if (h) { n = Number(h[1]); continue; }
      if (!n) continue;
      if (l.startsWith('+') && !l.startsWith('+++')) lines.add(n++);
      else if (l.startsWith('-')) lines.add(n); // a deletion lands between lines; mark the next
      else if (!l.startsWith('\\')) n++;
    }
    out.set(m[2], lines);
  }
  return out;
}

/** Parse every test file the PR adds or changes, reading files through `read(path)`. */
export function parseAll(ts, { files, treePaths, read, patterns = {}, diff = '' }) {
  const changedLines = changedLinesByFile(diff);
  const testFiles = files.filter((f) => f.status !== 'removed' && TEST_FILE.test(f.path));
  const names = testFiles.map((f) => path.basename(f.path));
  const idPrefix = (p) => (names.filter((n) => n === path.basename(p)).length > 1 ? p : path.basename(p));
  const changed = new Set(files.map((f) => f.path));
  const out = [];
  for (const f of testFiles) {
    const text = read(f.path);
    if (text == null) { out.push({ path: f.path, error: 'could not read the file' }); continue; }
    const parsed = parseTestFile(ts, f.path, text, patterns);
    const snapPath = findSnapshotPath(f.path, treePaths, patterns);
    const snaps = snapPath ? parseSnapshotFile(ts, read(snapPath) ?? '') : new Map();
    const usedKeys = new Set();
    let uncertain = false;
    const prefix = idPrefix(f.path);
    // In a file the PR only modifies, a test is part of this change when the diff touches its lines.
    const touched = changedLines.get(f.path) ?? new Set();
    parsed.tests.forEach((t, ti) => {
      t.id = `${prefix}:${ti + 1}`;
      t.changed = f.status === 'added' || [...touched].some((l) => l >= t.line && l <= t.endLine);
      t.steps.forEach((s, si) => {
        s.id = `${t.id}.${si + 1}`;
        s.level = levelOf(s.kinds);
        if (s.snapshot?.key) {
          const value = snaps.get(s.snapshot.key);
          if (value != null) { s.snapshot.value = value; usedKeys.add(s.snapshot.key); }
          else s.snapshot.missing = true;
        }
        if (s.snapshot?.value != null) {
          const fl = flagValue(s.snapshot.value, s);
          if (fl.length) s.snapshot.flags = fl;
        }
      });
      if (t.snapshotsUncertain || t.steps.some((s) => s.snapshot?.missing)) uncertain = true;
    });
    // Entries no test produces. Only trustworthy when every key was counted exactly.
    const unused = [...snaps.keys()].filter((k) => !usedKeys.has(k));
    out.push({
      path: f.path,
      status: f.status,
      snapshotPath: snapPath,
      snapshotChanged: snapPath ? changed.has(snapPath) : false,
      snapshotEntries: snaps.size,
      mocks: parsed.mocks,
      tests: parsed.tests,
      unusedSnapshots: uncertain ? [] : unused,
      snapshotNote: uncertain && snapPath ? 'Some snapshot calls run in a loop, a helper, or a table test, so not every value could be paired with its step.' : '',
    });
  }
  return out;
}

export const patternsKey = (patterns) => JSON.stringify(patterns ?? {});

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const args = process.argv.slice(2);
  const dir = args[0];
  const rootIdx = args.indexOf('--root');
  const root = rootIdx === -1 ? null : args[rootIdx + 1];
  if (!dir) {
    console.error('usage: node parse-tests.mjs <workdir> [--root <checkout at the head SHA>]');
    process.exit(2);
  }
  const ts = loadTypeScript();
  const readJson = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));
  const pr = readJson('pr.json');
  const files = readJson('files.json');
  const specPath = path.join(dir, 'spec.json');
  const patterns = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, 'utf8')).testPatterns ?? {} : {};
  const repo = new URL(pr.url).pathname.split('/').slice(1, 3).join('/');
  const sha = pr.headRefOid;

  let treePaths;
  let read;
  if (root) {
    treePaths = new Set(execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean));
    read = (p) => (fs.existsSync(path.join(root, p)) ? fs.readFileSync(path.join(root, p), 'utf8') : null);
  } else {
    const treeFile = path.join(dir, 'tree.json');
    if (!fs.existsSync(treeFile)) {
      const tree = execFileSync('gh', ['api', `repos/${repo}/git/trees/${sha}?recursive=1`, '--jq', '{truncated, paths: [.tree[] | select(.type == "blob") | .path]}'], { encoding: 'utf8', maxBuffer: 1 << 28 });
      fs.writeFileSync(treeFile, tree);
    }
    const tree = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
    if (tree.truncated) console.warn('warning: the repository tree was truncated; snapshot files outside __snapshots__ beside their test may be missed. Use --root.');
    treePaths = new Set(tree.paths);
    read = (p) => {
      if (!treePaths.has(p)) return null;
      const cached = path.join(dir, 'src', p);
      if (!fs.existsSync(cached)) {
        fs.mkdirSync(path.dirname(cached), { recursive: true });
        const body = execFileSync('gh', ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${repo}/contents/${encodeURI(p)}?ref=${sha}`], { maxBuffer: 1 << 28 });
        fs.writeFileSync(cached, body);
      }
      return fs.readFileSync(cached, 'utf8');
    };
  }

  const diffPath = path.join(dir, 'pr.diff');
  const parsed = parseAll(ts, { files, treePaths, read, patterns, diff: fs.existsSync(diffPath) ? fs.readFileSync(diffPath, 'utf8') : '' });
  fs.writeFileSync(path.join(dir, 'tests.json'), JSON.stringify({ sha, patterns: patternsKey(patterns), files: parsed }, null, 1));

  const tag = { exact: '=', error: '!', mock: 'm', helper: 'h', snapshot: 's', truthy: '?', none: '·' };
  for (const f of parsed) {
    if (f.error) { console.log(`${f.path}: ${f.error}`); continue; }
    const steps = f.tests.flatMap((t) => t.steps);
    console.log(`${f.path}  ${f.tests.length} tests, ${steps.length} steps${f.snapshotPath ? `, snapshots in ${f.snapshotPath} (${f.snapshotEntries})` : ''}`);
    if (f.mocks.length) console.log(`  mocks: ${f.mocks.map((m) => m.module).join(', ')}`);
    const unchanged = f.tests.filter((t) => !t.changed).length;
    if (unchanged) console.log(`  ${unchanged} test${unchanged === 1 ? '' : 's'} the PR does not touch, not listed`);
    for (const t of f.tests.filter((t) => t.changed)) {
      console.log(`  ${t.id}  ${t.fullName}${t.modifier ? ` [${t.modifier}]` : ''}${t.flags.length ? `  (${t.flags.join('; ')})` : ''}`);
      for (const s of t.steps) {
        const who = s.subject.actor ? `${s.subject.actor} ` : '';
        const what = s.subject.call ?? s.subject.text;
        const extra = [s.matcher, s.expected, s.subject.input && `(${s.subject.input})`, s.subject.via && `via ${s.subject.via}`, s.repeated && 'repeated', s.snapshot?.missing && 'snapshot not found', ...(s.snapshot?.flags ?? [])].filter(Boolean).join(' · ');
        console.log(`    ${s.id.split(':').pop().padEnd(6)} ${s.kinds.map((k) => tag[k]).join('')} L${s.line} ${who}${what}${extra ? `  ${extra}` : ''}`);
      }
    }
    if (f.unusedSnapshots.length) console.log(`  snapshot entries no step produces: ${f.unusedSnapshots.join(' | ')}`);
    if (f.snapshotNote) console.log(`  ${f.snapshotNote}`);
  }
  console.log('kinds: = exact, ! error, m mock, h helper (specified) · s snapshot (characterized) · ? truthy (weak) · · result not checked');
}
