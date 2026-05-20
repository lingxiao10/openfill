import type { ElementDetails } from './types'

/**
 * Parse the OpenFill browser content string into a map of index → ElementDetails.
 *
 * The content format produced by page-controller's flatTreeToString() is:
 *   [42]<button role='button' aria-label='立即申请'>立即申请 />
 *   \t*[43]<input type='text' placeholder='搜索' />
 *
 * We extract: index, tagName, all key=value attributes, and inner text.
 */
export function parseElementMap(content: string): Map<number, ElementDetails> {
	const map = new Map<number, ElementDetails>()

	// Match lines containing [N]<tag ...>text />
	// Using a line-by-line approach for reliability
	const lines = content.split('\n')

	for (const line of lines) {
		const match = /\[(\d+)\]<([^\s>]+)([^>]*)>(.*?)\s*\/>/.exec(line)
		if (!match) continue

		const [, indexStr, tag, attrsStr, text] = match
		const index = parseInt(indexStr, 10)

		const attributes: Record<string, string> = {}
		// Parse key=value or key='value' or key="value"
		const attrPattern = /([\w-]+)=(?:'([^']*)'|"([^"]*)"|(\S+))/g
		let m: RegExpExecArray | null
		while ((m = attrPattern.exec(attrsStr)) !== null) {
			const key = m[1]
			const val = m[2] ?? m[3] ?? m[4] ?? ''
			attributes[key] = val
		}

		map.set(index, {
			index,
			tag: tag.toLowerCase(),
			text: text.trim(),
			attributes,
		})
	}

	return map
}

/** Look up element details for a given highlight index from page content */
export function getElementDetails(pageContent: string, index: number): ElementDetails | null {
	const map = parseElementMap(pageContent)
	return map.get(index) ?? null
}
