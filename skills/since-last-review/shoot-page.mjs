// Screenshot the catch-up page as a reader first sees it, to look at before showing it.
// Usage: node shoot-page.mjs <page.html>
// Saves <page>.desktop.png, <page>.desktop-dark.png, and <page>.narrow.png beside the page
// (the top 3000px of each). Exits 1 on a script error. Needs no network.
import { chromium } from '/Users/danielb/.claude/tools/playwright/node_modules/playwright/index.mjs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node shoot-page.mjs <page.html>');
  process.exit(2);
}
const url = 'file://' + path.resolve(file);
const base = path.resolve(file).replace(/\.html?$/, '');
const runs = [
  { name: 'desktop', width: 900, scheme: 'light' },
  { name: 'desktop-dark', width: 900, scheme: 'dark' },
  { name: 'narrow', width: 420, scheme: 'light' },
];

const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
for (const run of runs) {
  const page = await browser.newPage({ viewport: { width: run.width, height: 900 }, colorScheme: run.scheme, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => { failed = true; console.error(`${run.name}: ${e.message}`); });
  await page.goto(url);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const shot = `${base}.${run.name}.png`;
  await page.screenshot({ path: shot, fullPage: true, clip: { x: 0, y: 0, width: run.width, height: Math.min(height, 3000) } });
  console.log(shot);
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
