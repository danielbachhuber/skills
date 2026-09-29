// Render Mermaid source files to PNG, the way GitHub will draw them.
// Usage: node render-mermaid.mjs <file.mmd> [more.mmd ...]
// Writes <file>.png beside each source and prints ok, or the parse error, per file.
// Needs network access for the Mermaid CDN (run with the sandbox disabled).
import { chromium } from '/Users/danielb/.claude/tools/playwright/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node render-mermaid.mjs <file.mmd> [more.mmd ...]');
  process.exit(2);
}

const browser = await chromium.launch();
let failed = 0;
for (const file of files) {
  // A fresh page per file: setContent keeps the old window, and its `done` flag with it.
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 });
  const src = fs.readFileSync(file, 'utf8');
  // A fixed-width div, not a <pre>: a gantt chart sizes itself to its container and
  // draws an empty axis inside a shrink-wrapped <pre>.
  await page.setContent(`<html><body style="margin:16px;background:#fff">
<div class="mermaid" style="width:1000px">${src.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
<script type="module">
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
mermaid.initialize({ startOnLoad: false });
// run() draws a "Syntax error" picture rather than throwing, so parse first.
try { await mermaid.parse(document.querySelector('.mermaid').textContent); await mermaid.run(); window.done = 'ok'; } catch (e) { window.done = 'ERR ' + e.message; }
</script></body></html>`);
  await page.waitForFunction(() => window.done, null, { timeout: 30000 });
  const result = await page.evaluate(() => window.done);
  const out = file.replace(/\.[^.]+$/, '') + '.png';
  if (result === 'ok') {
    await page.locator('.mermaid svg').first().screenshot({ path: out });
    console.log(`${file}: ok -> ${out}`);
  } else {
    failed++;
    console.log(`${file}: ${result}`);
  }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
