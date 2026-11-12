// Browser side of render.mjs. Mounts a hidden tldraw editor, builds the
// drawing from a spec (or loads a .tldr), and hands back a PNG, the .tldr
// text, and a list of layout problems.
import { createRoot } from 'react-dom/client'
import {
	Tldraw,
	createShapeId,
	getIndices,
	getSnapshot,
	parseTldrawJsonFile,
	serializeTldrawJson,
	toRichText,
} from 'tldraw'
import 'tldraw/tldraw.css'

const STYLE_KEYS = ['color', 'labelColor', 'fill', 'dash', 'size', 'font']

let resolveEditor
const editorReady = new Promise((r) => (resolveEditor = r))

createRoot(document.getElementById('root')).render(
	<div style={{ position: 'fixed', inset: 0 }}>
		<Tldraw hideUi onMount={(editor) => resolveEditor(editor)} />
	</div>
)

function pick(obj, keys) {
	const out = {}
	for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
	return out
}

function buildFromSpec(editor, spec) {
	const d = { font: 'draw', dash: 'draw', size: 'm', fill: 'semi', color: 'black', ...spec.defaults }
	const ids = new Map()
	const idFor = (key) => {
		if (!ids.has(key)) ids.set(key, createShapeId(key))
		return ids.get(key)
	}
	const items = spec.shapes ?? []

	// Everything except arrows first, so arrows can bind to them.
	for (const s of items) {
		if (s.type === 'arrow' || s.from) continue
		const type = s.type ?? 'geo'
		const base = { id: idFor(s.id), type, x: s.x ?? 0, y: s.y ?? 0, rotation: s.rotation ?? 0 }
		if (s.overlapOk) base.meta = { overlapOk: true }
		if (s.parent) base.parentId = idFor(s.parent)
		const style = { ...pick(d, STYLE_KEYS), ...pick(s, STYLE_KEYS) }
		let props
		if (type === 'geo') {
			props = {
				geo: s.geo ?? 'rectangle',
				w: s.w ?? 160,
				h: s.h ?? 80,
				richText: toRichText(s.text ?? ''),
				align: s.align ?? 'middle',
				verticalAlign: s.verticalAlign ?? 'middle',
				...style,
			}
		} else if (type === 'text') {
			props = {
				richText: toRichText(s.text ?? ''),
				textAlign: s.align ?? 'start',
				autoSize: s.w === undefined,
				...(s.w !== undefined && { w: s.w }),
				...pick(style, ['color', 'size', 'font']),
			}
		} else if (type === 'note') {
			props = { richText: toRichText(s.text ?? ''), ...pick(style, ['color', 'labelColor', 'size', 'font']) }
			if (!s.color) props.color = 'yellow'
		} else if (type === 'line') {
			// points are [x, y] pairs relative to the shape's x/y.
			const pts = s.points ?? []
			if (pts.length < 2) throw new Error(`Line "${s.id}" needs at least two points`)
			const keys = getIndices(pts.length)
			props = {
				points: Object.fromEntries(pts.map(([x, y], i) => [`p${i}`, { id: `p${i}`, index: keys[i], x, y }])),
				spline: s.spline ?? 'line',
				...pick(style, ['color', 'dash', 'size']),
			}
		} else if (type === 'frame') {
			props = { w: s.w ?? 400, h: s.h ?? 300, name: s.text ?? s.name ?? '' }
		} else {
			throw new Error(`Unsupported shape type "${type}" on "${s.id}"`)
		}
		editor.createShape({ ...base, props: { ...props, ...s.props } })
	}

	for (const [i, s] of items.entries()) {
		if (!(s.type === 'arrow' || s.from)) continue
		const id = idFor(s.id ?? `arrow-${i}`)
		const fromId = ids.get(s.from)
		const toId = ids.get(s.to)
		if (!fromId || !toId) throw new Error(`Arrow ${s.id ?? i} points at an unknown shape: ${s.from} → ${s.to}`)
		const a = editor.getShapePageBounds(fromId).center
		const b = editor.getShapePageBounds(toId).center
		editor.createShape({
			id,
			type: 'arrow',
			x: 0,
			y: 0,
			props: {
				start: { x: a.x, y: a.y },
				end: { x: b.x, y: b.y },
				bend: s.bend ?? 0,
				kind: s.kind ?? 'arc',
				richText: toRichText(s.text ?? ''),
				arrowheadStart: s.arrowheadStart ?? 'none',
				arrowheadEnd: s.arrowheadEnd ?? 'arrow',
				...pick({ ...pick(d, ['color', 'dash', 'size', 'font']), ...s }, ['color', 'labelColor', 'dash', 'size', 'font']),
				...s.props,
			},
		})
		const binding = (terminal, toShape, anchor) => ({
			type: 'arrow',
			fromId: id,
			toId: toShape,
			props: {
				terminal,
				normalizedAnchor: anchor ?? { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: !!anchor,
				snap: 'none',
			},
		})
		editor.createBindings([
			binding('start', fromId, s.fromAnchor),
			binding('end', toId, s.toAnchor),
		])
	}
}

// Cheap layout checks that back up looking at the PNG.
function findProblems(editor) {
	const problems = []
	const shapes = editor.getCurrentPageShapes()
	for (const s of shapes) {
		if (s.type === 'geo' && s.props.growY > 0) {
			problems.push(`"${s.id.replace('shape:', '')}": label is taller than the shape; tldraw grew it by ${Math.round(s.props.growY)}px. Make it taller or wider, or shorten the label.`)
		}
	}
	// Lines, and shapes marked overlapOk (a deliberate stack or pile), are skipped.
	const boxes = shapes.filter((s) => !['arrow', 'frame', 'line'].includes(s.type) && !s.meta.overlapOk)
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const A = editor.getShapePageBounds(boxes[i])
			const B = editor.getShapePageBounds(boxes[j])
			if (A.collides(B) && !A.contains(B) && !B.contains(A)) {
				problems.push(`"${boxes[i].id.replace('shape:', '')}" and "${boxes[j].id.replace('shape:', '')}" overlap.`)
			}
		}
	}
	return problems
}

async function onWhite(blob) {
	const img = await createImageBitmap(blob)
	const canvas = new OffscreenCanvas(img.width, img.height)
	const ctx = canvas.getContext('2d')
	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, img.width, img.height)
	ctx.drawImage(img, 0, 0)
	return canvas.convertToBlob({ type: 'image/png' })
}

window.renderDiagram = async ({ spec, tldr, scale = 1, pixelRatio = 2, background = true, padding = 32 }) => {
	const editor = await editorReady
	if (tldr) {
		const parsed = parseTldrawJsonFile({ json: tldr, schema: editor.store.schema })
		if (!parsed.ok) throw new Error(`Could not read .tldr: ${JSON.stringify(parsed.error)}`)
		editor.loadSnapshot(getSnapshot(parsed.value))
	} else {
		buildFromSpec(editor, spec)
	}
	// Fonts must be loaded before measuring or exporting text.
	await document.fonts.ready
	const ids = [...editor.getCurrentPageShapeIds()]
	if (!ids.length) throw new Error('Nothing to export: the page has no shapes.')
	// tldraw's own background is an off-white grey, so export transparent and
	// fill pure white ourselves when a background is wanted.
	let { blob, width, height } = await editor.toImage(ids, {
		format: 'png',
		scale,
		pixelRatio,
		background: false,
		padding,
		darkMode: false,
	})
	if (background) blob = await onWhite(blob)
	const buf = new Uint8Array(await blob.arrayBuffer())
	let bin = ''
	for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
	return {
		png: btoa(bin),
		width,
		height,
		tldr: await serializeTldrawJson(editor),
		problems: findProblems(editor),
	}
}
window.tldrawPageReady = true
