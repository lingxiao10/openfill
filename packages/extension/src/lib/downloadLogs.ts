import type { AgentStepEvent, HistoricalEvent } from '@page-agent/core'

/**
 * Format agent history into a human-readable log string and trigger a file download.
 */
export function downloadAgentLogs(task: string, history: HistoricalEvent[]): void {
	const lines: string[] = []

	lines.push('=== Page Agent Log ===')
	lines.push(`Task: ${task}`)
	lines.push(`Generated: ${new Date().toLocaleString()}`)
	lines.push('')

	for (const event of history) {
		if (event.type === 'step') {
			const e = event as AgentStepEvent
			lines.push(`${'─'.repeat(60)}`)
			lines.push(`Step ${e.stepIndex + 1}`)
			lines.push(`${'─'.repeat(60)}`)

			if (e.reflection?.evaluation_previous_goal)
				lines.push(`Eval   : ${e.reflection.evaluation_previous_goal}`)
			if (e.reflection?.memory) lines.push(`Memory : ${e.reflection.memory}`)
			if (e.reflection?.next_goal) lines.push(`Goal   : ${e.reflection.next_goal}`)

			if (e.usage) {
				lines.push(
					`Tokens : ${e.usage.totalTokens} total` +
						(e.usage.cachedTokens ? ` (${e.usage.cachedTokens} cached)` : '')
				)
			}

			if (e.actions?.length) {
				lines.push('')
				lines.push('Actions:')
				for (const action of e.actions) {
					lines.push(`  [${action.name}]`)
					lines.push(`    Input : ${JSON.stringify(action.input)}`)
					lines.push(`    Output: ${action.output}`)
				}
			}

			// Raw request: extract last user message (page state sent to LLM)
			if (e.rawRequest) {
				const msgs = (e.rawRequest as any)?.messages as any[] | undefined
				if (msgs) {
					const userMsg = [...msgs].reverse().find((m) => m.role === 'user')
					const content =
						typeof userMsg?.content === 'string'
							? userMsg.content
							: userMsg?.content?.find?.((c: any) => c.type === 'text')?.text
					if (content) {
						lines.push('')
						lines.push('Page state sent to LLM:')
						lines.push(indent(content, '  '))
					}
				}
			}

			// Raw response (LLM output)
			if (e.rawResponse) {
				lines.push('')
				lines.push('LLM raw response:')
				lines.push(indent(JSON.stringify(e.rawResponse, null, 2), '  '))
			}

			lines.push('')
		} else if (event.type === 'observation') {
			lines.push(`[Observation] ${event.content}`)
			lines.push('')
		} else if (event.type === 'retry') {
			lines.push(`[Retry] ${event.message} (${event.attempt}/${event.maxAttempts})`)
			lines.push('')
		} else if (event.type === 'error') {
			lines.push(`[Error] ${event.message}`)
			if (event.rawResponse) {
				lines.push(indent(JSON.stringify(event.rawResponse, null, 2), '  '))
			}
			lines.push('')
		}
	}

	const content = lines.join('\n')
	const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `page-agent-${Date.now()}.log`
	a.click()
	URL.revokeObjectURL(url)
}

function indent(text: string, prefix: string): string {
	return text
		.split('\n')
		.map((l) => prefix + l)
		.join('\n')
}
