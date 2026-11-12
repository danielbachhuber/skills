#!/usr/bin/env node
// Render a tldraw drawing to PNG and save its editable .tldr source.
//
//   node render.mjs <spec.json | drawing.tldr> --out <file.png> [options]
//
// Options:
//   --tldr <path>        Where to write the .tldr source (default: next to the PNG)
//   --transparent        No background (default: white)
//   --pixel-ratio <n>    Device pixels per CSS pixel (default: 2)
//   --scale <n>          Scale the drawing before export (default: 1)
//   --padding <n>        Space around the drawing in CSS pixels (default: 32)
//
// Needs network access (tldraw loads its fonts from its CDN) and Google Chrome.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
	const opts = { pixelRatio: 2, scale: 1, padding: 32, background: true }
	const rest = []
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--out') opts.out = argv[++i]
		else if (a === '--tldr') opts.tldrOut = argv[++i]
		else if (a === '--transparent') opts.background = false
		else if (a === '--pixel-ratio') opts.pixelRatio = Number(argv[++i])
		else if (a === '--scale') opts.scale = Number(argv[++i])
		else if (a === '--padding') opts.padding = Number(argv[++i])
		else if (a === '-h' || a === '--help') opts.help = true
		else rest.push(a)
	}
	opts.input = rest[0]
	return opts
}

function ensureBuilt() {
	if (!existsSync(join(here, 'node_modules', 'tldraw'))) {
		console.error('Installing tldraw and Playwright into the skill folder (first run)…')
		execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: here, stdio: 'inherit' })
	}
	const out = join(here, 'dist', 'page.js')
	const newest = Math.max(...['page.jsx', 'package.json'].map((f) => statSync(join(here, f)).mtimeMs))
	if (existsSync(out) && statSync(out).mtimeMs > newest) return
	console.error('Bundling the tldraw page…')
	execFileSync(
		join(here, 'node_modules', '.bin', 'esbuild'),
		['page.jsx', '--bundle', '--format=esm', '--jsx=automatic', '--loader:.woff2=file', '--outdir=dist', '--log-level=warning'],
		{ cwd: here, stdio: 'inherit' }
	)
	writeFileSync(
		join(here, 'dist', 'index.html'),
		'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="page.css"></head>' +
			'<body><div id="root"></div><script type="module" src="page.js"></script></body></html>'
	)
}

function serve(dir) {
	const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }
	const server = http.createServer((req, res) => {
		const path = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'))
		if (!path.startsWith(dir) || !existsSync(path)) return res.writeHead(404).end()
		res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' })
		res.end(readFileSync(path))
	})
	return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)))
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help || !opts.input || !opts.out) {
	console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 14).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
	process.exit(opts.help ? 0 : 1)
}

const inputPath = resolve(opts.input)
const outPng = resolve(opts.out)
const outTldr = resolve(opts.tldrOut ?? outPng.replace(/\.png$/i, '') + '.tldr')
const inputText = readFileSync(inputPath, 'utf8')
const payload = {
	scale: opts.scale,
	pixelRatio: opts.pixelRatio,
	background: opts.background,
	padding: opts.padding,
	...(inputPath.endsWith('.tldr') ? { tldr: inputText } : { spec: JSON.parse(inputText) }),
}

ensureBuilt()
const { chromium } = await import(join(here, 'node_modules', 'playwright', 'index.mjs'))
const server = await serve(join(here, 'dist'))
const browser = await chromium.launch({ channel: 'chrome' })
try {
	const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
	const pageErrors = []
	page.on('pageerror', (e) => pageErrors.push(e.message))
	page.on('requestfailed', (r) => pageErrors.push(`Request failed: ${r.url()} (${r.failure()?.errorText})`))
	await page.goto(`http://127.0.0.1:${server.address().port}/`)
	await page.waitForFunction(() => window.tldrawPageReady, null, { timeout: 30000 }).catch(() => {
		throw new Error(`The tldraw page did not load.\n${pageErrors.join('\n')}`)
	})
	const result = await page.evaluate((p) => window.renderDiagram(p), payload)
	mkdirSync(dirname(outPng), { recursive: true })
	mkdirSync(dirname(outTldr), { recursive: true })
	writeFileSync(outPng, Buffer.from(result.png, 'base64'))
	writeFileSync(outTldr, result.tldr)
	console.log(`PNG:  ${outPng} (${Math.round(result.width * opts.pixelRatio)}×${Math.round(result.height * opts.pixelRatio)} px; ${Math.round(result.width)}×${Math.round(result.height)} at 1×)`)
	console.log(`tldr: ${outTldr}`)
	const fontFailures = pageErrors.filter((e) => /font|woff/i.test(e))
	if (fontFailures.length) console.log(`\nWARNING: fonts failed to load, so the PNG uses fallback fonts:\n${fontFailures.join('\n')}`)
	if (result.problems.length) console.log(`\nLayout problems:\n- ${result.problems.join('\n- ')}`)
	else console.log('\nNo overlapping shapes or overflowing labels found.')
} finally {
	await browser.close()
	server.close()
}
