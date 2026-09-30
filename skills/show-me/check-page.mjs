// Check that a show-me page renders: diagrams draw, every diff renders, no script errors.
// Usage: node check-page.mjs <page.html>
// Waits for the page's ready flag, saves a screenshot of the page as a reader first sees
// it (top 3000px) at desktop and narrow widths, in light and dark, beside the page, then
// opens every concern to check every diff renders. Exits 1 on any error.
// Needs network access for the CDN imports (run with the sandbox disabled).
import { chromium } from '/Users/danielb/.claude/tools/playwright/node_modules/playwright/index.mjs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node check-page.mjs <page.html>');
  process.exit(2);
}
const url = 'file://' + path.resolve(file);
const base = path.resolve(file).replace(/\.html?$/, '');
const runs = [
  { name: 'desktop', width: 1280, scheme: 'light' },
  { name: 'desktop-dark', width: 1280, scheme: 'dark' },
  { name: 'narrow', width: 420, scheme: 'light' },
];

const browser = await chromium.launch();
let failed = false;
for (const run of runs) {
  const page = await browser.newPage({ viewport: { width: run.width, height: 900 }, colorScheme: run.scheme, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`script: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__showme && window.__showme.state !== 'loading', null, { timeout: 60000 })
    .catch(() => errors.push('page never reported ready within 60 s'));

  const shot = `${base}.${run.name}.png`;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({ path: shot, fullPage: true, clip: { x: 0, y: 0, width: run.width, height: Math.min(height, 3000) } });

  // Open every concern so every diff renders, then wait for them.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  await page.waitForFunction(() => [...document.querySelectorAll('.diff[data-part]')].every((el) => el.dataset.done && el.childElementCount), null, { timeout: 60000 })
    .catch(() => errors.push('not every diff rendered within 60 s'));
  await page.waitForTimeout(500);

  const report = await page.evaluate(() => ({
    status: window.__showme,
    diagrams: document.querySelectorAll('pre.mermaid svg, pre.mermaid[data-processed] svg').length,
    diagramErrors: document.querySelectorAll('.error').length,
    diffs: document.querySelectorAll('.diff[data-part]').length,
    // An element wider than the viewport means sideways scrolling on a narrow screen.
    overflow: document.documentElement.scrollWidth > innerWidth + 1 ? `page is ${document.documentElement.scrollWidth}px wide in a ${innerWidth}px viewport` : null,
  }));
  errors.push(...(report.status?.errors ?? []));
  if (report.overflow) errors.push(report.overflow);

  console.log(`${run.name}: ${report.diagrams} diagrams, ${report.diffs} diffs, ${errors.length} problems -> ${shot}`);
  for (const e of [...new Set(errors)]) console.log(`  ${e}`);
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
