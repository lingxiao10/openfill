/**
 * SequenceParser — pure XML ↔ SequenceSpec conversion.
 * Zero dependencies, fully testable in isolation.
 */
import type { SequenceSpec, StepSpec, StepType } from './types'

const VALID_STEP_TYPES = new Set<string>([
	'click',
	'input',
	'input_enter',
	'wait',
	'navigate',
	'scroll',
	'send_keys',
])

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Parse an XML sequence string into a SequenceSpec.
 * Returns an Error if the XML is malformed or missing required fields.
 */
export function parse(xml: string): SequenceSpec | Error {
	try {
		// Use DOMParser when available (browser), fall back to regex for Node/tests
		const steps = parseSteps(xml)
		const name = extractAttr(xml, 'sequence', 'name')
		if (!name) return new Error('Missing required attribute "name" on <sequence>')
		const description = extractAttr(xml, 'sequence', 'description') ?? ''
		const paramsRaw = extractAttr(xml, 'sequence', 'params') ?? ''
		const params = paramsRaw
			.split(',')
			.map((p) => p.trim())
			.filter(Boolean)

		const entryUrl = extractAttr(xml, 'sequence', 'entryUrl')
		return { name, description, entryUrl, params, steps }
	} catch (e) {
		return e instanceof Error ? e : new Error(String(e))
	}
}

// ─── Serialize ────────────────────────────────────────────────────────────────

/** Serialize a SequenceSpec back to XML string */
export function serialize(seq: SequenceSpec): string {
	const attrs = [
		`name="${esc(seq.name)}"`,
		seq.description ? `description="${esc(seq.description)}"` : '',
		seq.entryUrl ? `entryUrl="${esc(seq.entryUrl)}"` : '',
		seq.params.length ? `params="${esc(seq.params.join(','))}"` : '',
	]
		.filter(Boolean)
		.join(' ')

	const steps = seq.steps.map((s) => serializeStep(s)).join('\n  ')
	return `<sequence ${attrs}>\n  ${steps}\n</sequence>`
}

// ─── Param substitution ───────────────────────────────────────────────────────

/**
 * Replace {{param}} placeholders in all string fields of steps.
 * Missing params are left as-is.
 */
export function applyParams(seq: SequenceSpec, params: Record<string, string>): SequenceSpec {
	const replace = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`)
	return {
		...seq,
		steps: seq.steps.map((step) => ({
			...step,
			selector: step.selector ? replace(step.selector) : step.selector,
			value: step.value ? replace(step.value) : step.value,
		})),
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
	const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i')
	const m = re.exec(xml)
	return m ? unesc(m[1]) : undefined
}

function parseSteps(xml: string): StepSpec[] {
	const steps: StepSpec[] = []
	const stepRe = /<step\s([^/]*?)\/>/gs
	let m: RegExpExecArray | null
	while ((m = stepRe.exec(xml)) !== null) {
		const attrsStr = m[1]
		const type = getAttr(attrsStr, 'type') as StepType | undefined
		if (!type || !VALID_STEP_TYPES.has(type)) continue

		const step: StepSpec = { type }
		const selector = getAttr(attrsStr, 'selector')
		if (selector) step.selector = selector
		const value = getAttr(attrsStr, 'value')
		if (value) step.value = value
		const ms = getAttr(attrsStr, 'ms')
		if (ms) step.ms = parseInt(ms, 10)
		const direction = getAttr(attrsStr, 'direction') as StepSpec['direction']
		if (direction) step.direction = direction
		const pages = getAttr(attrsStr, 'pages')
		if (pages) step.pages = parseInt(pages, 10)
		const description = getAttr(attrsStr, 'description')
		if (description) step.description = description

		steps.push(step)
	}
	return steps
}

function getAttr(attrsStr: string, name: string): string | undefined {
	const re = new RegExp(`\\b${name}="([^"]*)"`)
	const m = re.exec(attrsStr)
	return m ? unesc(m[1]) : undefined
}

function serializeStep(s: StepSpec): string {
	const attrs: string[] = [`type="${s.type}"`]
	if (s.selector) attrs.push(`selector="${esc(s.selector)}"`)
	if (s.value) attrs.push(`value="${esc(s.value)}"`)
	if (s.ms !== undefined) attrs.push(`ms="${s.ms}"`)
	if (s.direction) attrs.push(`direction="${s.direction}"`)
	if (s.pages !== undefined) attrs.push(`pages="${s.pages}"`)
	if (s.description) attrs.push(`description="${esc(s.description)}"`)
	return `<step ${attrs.join(' ')} />`
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function unesc(s: string): string {
	return s
		.replace(/&quot;/g, '"')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
}
