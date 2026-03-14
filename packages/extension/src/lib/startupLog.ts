/**
 * Startup error log — captures errors that occur before/outside of agent execution.
 * Singleton module; entries are included in the downloadable log file.
 */

export interface StartupLogEntry {
	time: string
	type: 'error' | 'unhandledrejection' | 'react'
	message: string
	stack?: string
	detail?: unknown
}

const entries: StartupLogEntry[] = []
const listeners: (() => void)[] = []

export function logStartupError(entry: Omit<StartupLogEntry, 'time'>): void {
	entries.push({ ...entry, time: new Date().toISOString() })
	console.log('[StartupLog]', entry.type, entry.message, entry.stack ?? '')
	listeners.forEach((fn) => fn())
}

export function getStartupLog(): readonly StartupLogEntry[] {
	return entries
}

export function hasStartupErrors(): boolean {
	return entries.length > 0
}

/** Subscribe to new entries (for reactive UI). Returns unsubscribe fn. */
export function onStartupError(fn: () => void): () => void {
	listeners.push(fn)
	return () => {
		const i = listeners.indexOf(fn)
		if (i !== -1) listeners.splice(i, 1)
	}
}
