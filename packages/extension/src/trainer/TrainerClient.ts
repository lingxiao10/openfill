import type { ActionLogRaw } from '@page-agent/core'

import { getElementDetails } from './parseElementMap'
import type { ActionLogEntry, AutomationScript, TrainingTask } from './types'

const BASE = 'http://127.0.0.1:3002'
const TIMEOUT = 4000

async function api<T>(method: string, path: string, body?: unknown): Promise<T | null> {
	try {
		const ctrl = new AbortController()
		const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
		const res = await fetch(`${BASE}${path}`, {
			method,
			headers: body ? { 'Content-Type': 'application/json' } : {},
			body: body ? JSON.stringify(body) : undefined,
			signal: ctrl.signal,
		})
		clearTimeout(timer)
		if (!res.ok) return null
		return await (res.json() as Promise<T>)
	} catch {
		return null
	}
}

// ─── Availability ─────────────────────────────────────────────────────────────

export async function isTrainerAvailable(): Promise<boolean> {
	const result = await api<{ ok: boolean }>('GET', '/health')
	return result?.ok === true
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function listTasks(): Promise<TrainingTask[] | null> {
	return api<TrainingTask[]>('GET', '/api/tasks')
}

export function getTask(taskId: string): Promise<{ name: string; description: string; url: string } | null> {
	return api<{ name: string; description: string; url: string }>('GET', `/api/tasks/${taskId}`)
}

export function createTask(
	name: string,
	url: string,
	description: string
): Promise<TrainingTask | null> {
	return api<TrainingTask>('POST', '/api/tasks', { name, url, description })
}

// ─── Execution session ────────────────────────────────────────────────────────

let _currentTaskId: string | null = null
let _currentExecId: string | null = null
let _pendingLogs: ActionLogEntry[] = []
let _flushTimer: ReturnType<typeof setTimeout> | null = null

export function getActiveExecution() {
	return { taskId: _currentTaskId, execId: _currentExecId }
}

export async function startExecution(taskId: string, userRequest: string): Promise<string | null> {
	const exec = await api<{ id: string }>('POST', `/api/tasks/${taskId}/executions`, { userRequest })
	if (!exec) return null
	_currentTaskId = taskId
	_currentExecId = exec.id
	_pendingLogs = []
	return exec.id
}

export async function completeExecution(success: boolean): Promise<void> {
	if (!_currentTaskId || !_currentExecId) return
	await flushLogs()
	await api('POST', `/api/tasks/${_currentTaskId}/executions/${_currentExecId}/complete`, {
		success,
	})
	_currentTaskId = null
	_currentExecId = null
}

// ─── Log capture ──────────────────────────────────────────────────────────────

/**
 * Convert a raw ActionLogRaw (from core's onActionLog) into a full ActionLogEntry
 * by resolving element details from the page content string.
 */
export function enrichAndQueue(raw: ActionLogRaw): void {
	if (!_currentTaskId || !_currentExecId) return

	// Resolve element index from action input
	const index = resolveElementIndex(raw.action.name, raw.action.input)
	const element = index !== null ? getElementDetails(raw.pageContent, index) : null

	const entry: ActionLogEntry = {
		taskId: _currentTaskId,
		executionId: _currentExecId,
		stepIndex: raw.stepIndex,
		actionIndex: raw.actionIndex,
		timestamp: raw.timestamp,
		url: raw.url,
		pageTitle: raw.pageTitle,
		pageContent: raw.pageContent,
		action: raw.action,
		element,
	}

	_pendingLogs.push(entry)

	// Debounced flush — batch logs every 2s to avoid flooding
	if (_flushTimer) clearTimeout(_flushTimer)
	_flushTimer = setTimeout(flushLogs, 2000)
}

async function flushLogs(): Promise<void> {
	if (!_currentTaskId || !_currentExecId || _pendingLogs.length === 0) return
	const batch = _pendingLogs.splice(0)
	await api('POST', `/api/tasks/${_currentTaskId}/executions/${_currentExecId}/logs`, {
		logs: batch,
	})
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export function addNote(taskId: string, execId: string, content: string): Promise<unknown> {
	return api('POST', `/api/tasks/${taskId}/executions/${execId}/notes`, { content })
}

// ─── AI Sequences ─────────────────────────────────────────────────────────────

export function saveSequence(
	taskId: string,
	name: string,
	description: string,
	params: string[],
	xml: string
): Promise<unknown> {
	return api('POST', `/api/tasks/${taskId}/sequences`, { name, description, params, xml })
}

export function listSequences(taskId: string): Promise<unknown[] | null> {
	return api<unknown[]>('GET', `/api/tasks/${taskId}/sequences`)
}

export function deleteSequence(taskId: string, seqId: string): Promise<unknown> {
	return api('DELETE', `/api/tasks/${taskId}/sequences/${seqId}`)
}

// ─── Task update ──────────────────────────────────────────────────────────────

export function updateTask(
	taskId: string,
	patch: { name?: string; url?: string; description?: string }
): Promise<unknown> {
	return api('PATCH', `/api/tasks/${taskId}`, patch)
}

// ─── Scripts ──────────────────────────────────────────────────────────────────

export function listScripts(taskId: string): Promise<AutomationScript[] | null> {
	return api<AutomationScript[]>('GET', `/api/tasks/${taskId}/scripts`)
}

export function generateScript(
	taskId: string,
	executionId?: string
): Promise<AutomationScript | null> {
	return api<AutomationScript>(
		'POST',
		`/api/tasks/${taskId}/generate-script`,
		executionId ? { executionId } : {}
	)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract element index from tool input, if the tool targets an element by index */
function resolveElementIndex(toolName: string, input: Record<string, unknown>): number | null {
	const indexed = [
		'click_element_by_index',
		'input_text',
		'input_text_and_enter',
		'hover_element',
		'get_element_text',
	]
	if (indexed.includes(toolName) && typeof input.index === 'number') {
		return input.index
	}
	return null
}
