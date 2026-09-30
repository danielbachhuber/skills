// Pull a film strip out of a Playwright trace: one frame per user action, showing the
// screen once that action has taken effect.
// Usage: node trace-frames.mjs <trace.zip> <outdir> [--match <regex>]
// Writes <outdir>/NN.jpeg and <outdir>/frames.json ([{ label, file }]). --match keeps
// only actions whose label matches, such as --match 'click|fill|goto'.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [zip, out, flag, pattern] = process.argv.slice(2);
if (!zip || !out) {
  console.error('usage: node trace-frames.mjs <trace.zip> <outdir> [--match <regex>]');
  process.exit(2);
}
const match = flag === '--match' ? new RegExp(pattern, 'i') : null;
const work = fs.mkdtempSync('/tmp/trace-frames-');
execFileSync('unzip', ['-q', '-o', zip, '-d', work]);

// A test-runner trace can hold several .trace files; read them all.
const events = fs.readdirSync(work)
  .filter((f) => f.endsWith('.trace'))
  .flatMap((f) => fs.readFileSync(path.join(work, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

const USER_ACTIONS = new Set(['goto', 'click', 'dblclick', 'fill', 'type', 'press', 'check', 'uncheck', 'selectOption', 'tap', 'setInputFiles', 'hover', 'dragTo', 'reload']);
const ends = new Map(events.filter((e) => e.type === 'after').map((e) => [e.callId, e.endTime]));
const actions = events
  .filter((e) => e.type === 'before' && e.pageId && USER_ACTIONS.has(e.method))
  .map((e) => {
    const target = e.params?.selector ?? e.params?.url ?? e.params?.value ?? '';
    return { start: e.startTime, end: ends.get(e.callId) ?? e.startTime, pageId: e.pageId,
      label: e.title ?? e.apiName ?? `${e.method} ${target}`.trim() };
  })
  .sort((a, b) => a.start - b.start);
const frames = events.filter((e) => e.type === 'screencast-frame').sort((a, b) => a.timestamp - b.timestamp);
if (!frames.length) {
  console.error('no screencast frames: record the trace with screenshots on (--trace on).');
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
const strip = [];
let last = null;
actions.forEach((a, i) => {
  // The screen just before the next action starts is the result of this one.
  const until = actions[i + 1]?.start ?? Infinity;
  const onPage = frames.filter((f) => f.pageId === a.pageId && f.timestamp >= a.start && f.timestamp <= until);
  const frame = onPage[onPage.length - 1];
  if (!frame || frame.sha1 === last) return;
  if (match && !match.test(a.label)) return;
  last = frame.sha1;
  const file = `${String(strip.length + 1).padStart(2, '0')}.jpeg`;
  fs.copyFileSync(path.join(work, 'resources', frame.sha1), path.join(out, file));
  strip.push({ label: a.label, file });
});
fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(strip, null, 2) + '\n');
fs.rmSync(work, { recursive: true, force: true });
console.log(`${out}: ${strip.length} frames from ${actions.length} actions`);
strip.forEach((s) => console.log(`  ${s.file}  ${s.label}`));
