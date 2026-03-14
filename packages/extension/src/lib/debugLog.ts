/**
 * Debug logger for development use.
 *
 * POSTs log entries to the local debug-log-server.js running on port 7373.
 * Fails silently if the server is not running.
 *
 * Usage:
 *   1. Start the server:  node debug-log-server.js
 *   2. Build/reload the extension with DEBUG_LOG=true (or just use in dev)
 *   3. Logs appear in debug.log at project root — readable by Claude directly.
 */

import type { AgentActivity, AgentStepEvent, HistoricalEvent } from '@page-agent/core'

const SERVER_URL = 'http://localhost:7373/log'

/** Whether debug logging is enabled. Toggle via env or build flag. */
export const DEBUG_LOG = process.env.NODE_ENV === 'development' || (globalThis as any).__DEBUG_LOG === true

function post(text: string): void {
	if (!DEBUG_LOG) return
	fetch(SERVER_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'text/plain' },
		body: text,
	}).catch(() => {
		// Server not running – silently ignore
	})
}

function ts(): string {
	return new Date().toLocaleTimeString()
}

/** Log a raw text message */
export function debugLog(message: string): void {
	post(`[${ts()}] ${message}\n`)
}

/** Log the start of a task */
export function debugLogTaskStart(task: string): void {
	const line = [
		'\n' + '═'.repeat(70),
		`TASK: ${task}`,
		`Started: ${new Date().toLocaleString()}`,
		'═'.repeat(70),
	].join('\n')
	post(line + '\n')
}

/** Log a single history event */
export function debugLogEvent(event: HistoricalEvent): void {
	if (!DEBUG_LOG) return

	const lines: string[] = []

	if (event.type === 'step') {
		const e = event as AgentStepEvent
		lines.push(`\n${'─'.repeat(60)}`)
		lines.push(`[${ts()}] Step ${e.stepIndex + 1}`)
		lines.push('─'.repeat(60))

		if (e.reflection?.evaluation_previous_goal)
			lines.push(`Eval  : ${e.reflection.evaluation_previous_goal}`)
		if (e.reflection?.memory) lines.push(`Memory: ${e.reflection.memory}`)
		if (e.reflection?.next_goal) lines.push(`Goal  : ${e.reflection.next_goal}`)

		if (e.usage) {
			lines.push(
				`Tokens: ${e.usage.totalTokens} total` +
					(e.usage.cachedTokens ? ` (${e.usage.cachedTokens} cached)` : '')
			)
		}

		if (e.actions?.length) {
			lines.push('\nActions:')
			for (const action of e.actions) {
				lines.push(`  [${action.name}] ${JSON.stringify(action.input)}`)
				lines.push(`    → ${action.output}`)
			}
		}
	} else if (event.type === 'observation') {
		lines.push(`[${ts()}] [Observation] ${event.content}`)
	} else if (event.type === 'retry') {
		lines.push(`[${ts()}] [Retry] ${event.message} (${event.attempt}/${event.maxAttempts})`)
	} else if (event.type === 'error') {
		lines.push(`[${ts()}] [Error] ${event.message}`)
		if (event.rawResponse) {
			lines.push(JSON.stringify(event.rawResponse, null, 2))
		}
	} else if (event.type === 'user_takeover') {
		lines.push(`[${ts()}] [UserTakeover]`)
	}

	if (lines.length > 0) {
		post(lines.join('\n') + '\n')
	}
}

/** Log an activity update */
export function debugLogActivity(activity: AgentActivity): void {
	if (!DEBUG_LOG) return

	if (activity.type === 'executing') {
		post(`[${ts()}] > Executing: ${activity.tool} ${JSON.stringify(activity.input)}\n`)
	} else if (activity.type === 'error') {
		post(`[${ts()}] > Activity error: ${activity.message}\n`)
	}
}
