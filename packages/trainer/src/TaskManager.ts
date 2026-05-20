import { randomUUID } from 'node:crypto'
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import type {
	AutomationScript,
	AutomationStep,
	CreateTaskPayload,
	ElementSelector,
	Execution,
	StartExecutionPayload,
	TrainerNote,
	TrainerSequence,
	TrainingTask,
} from './types.js'

const DATA_DIR = new URL('../../data', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

const str = (v: unknown, fallback = ''): string =>
	typeof v === 'string' ? v : typeof v === 'number' ? String(v) : fallback

function taskDir(taskId: string) {
	return join(DATA_DIR, 'tasks', taskId)
}
function ensureDir(dir: string) {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}
function readJSON<T>(path: string): T {
	return JSON.parse(readFileSync(path, 'utf8')) as T
}
function writeJSON(path: string, data: unknown) {
	writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function listTasks(): TrainingTask[] {
	const dir = join(DATA_DIR, 'tasks')
	ensureDir(dir)
	return readdirSync(dir, { withFileTypes: true })
		.filter((e) => e.isDirectory())
		.map((e) => {
			try {
				return readJSON<TrainingTask>(join(dir, e.name, 'task.json'))
			} catch {
				return null
			}
		})
		.filter(Boolean) as TrainingTask[]
}

export function getTask(id: string): TrainingTask | null {
	const path = join(taskDir(id), 'task.json')
	if (!existsSync(path)) return null
	return readJSON<TrainingTask>(path)
}

export function createTask(payload: CreateTaskPayload): TrainingTask {
	const task: TrainingTask = {
		id: randomUUID(),
		name: payload.name,
		url: payload.url,
		description: payload.description,
		createdAt: new Date().toISOString(),
		status: 'active',
	}
	const dir = taskDir(task.id)
	ensureDir(join(dir, 'executions'))
	ensureDir(join(dir, 'scripts'))
	writeJSON(join(dir, 'task.json'), task)
	return task
}

export function updateTask(id: string, patch: Partial<TrainingTask>): TrainingTask | null {
	const task = getTask(id)
	if (!task) return null
	const updated = { ...task, ...patch, id }
	writeJSON(join(taskDir(id), 'task.json'), updated)
	return updated
}

// ─── Executions ───────────────────────────────────────────────────────────────

export function listExecutions(taskId: string): Execution[] {
	const dir = join(taskDir(taskId), 'executions')
	ensureDir(dir)
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => {
			try {
				return readJSON<Execution>(join(dir, f))
			} catch {
				return null
			}
		})
		.filter(Boolean) as Execution[]
}

export function getExecution(taskId: string, execId: string): Execution | null {
	const path = join(taskDir(taskId), 'executions', `${execId}.json`)
	if (!existsSync(path)) return null
	return readJSON<Execution>(path)
}

export function startExecution(taskId: string, payload: StartExecutionPayload): Execution | null {
	if (!getTask(taskId)) return null
	const exec: Execution = {
		id: randomUUID(),
		taskId,
		userRequest: payload.userRequest,
		startedAt: new Date().toISOString(),
		logs: [],
	}
	const dir = join(taskDir(taskId), 'executions')
	ensureDir(dir)
	writeJSON(join(dir, `${exec.id}.json`), exec)
	return exec
}

export function appendLogs(taskId: string, execId: string, newLogs: Execution['logs']): boolean {
	const path = join(taskDir(taskId), 'executions', `${execId}.json`)
	if (!existsSync(path)) return false
	const exec = readJSON<Execution>(path)
	exec.logs.push(...newLogs)
	writeJSON(path, exec)
	return true
}

export function completeExecution(taskId: string, execId: string, success: boolean): boolean {
	const path = join(taskDir(taskId), 'executions', `${execId}.json`)
	if (!existsSync(path)) return false
	const exec = readJSON<Execution>(path)
	exec.completedAt = new Date().toISOString()
	exec.success = success
	writeJSON(path, exec)
	return true
}

// ─── Scripts ──────────────────────────────────────────────────────────────────

export function listScripts(taskId: string): AutomationScript[] {
	const dir = join(taskDir(taskId), 'scripts')
	ensureDir(dir)
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => {
			try {
				return readJSON<AutomationScript>(join(dir, f))
			} catch {
				return null
			}
		})
		.filter(Boolean) as AutomationScript[]
}

export function getScript(taskId: string, scriptId: string): AutomationScript | null {
	const path = join(taskDir(taskId), 'scripts', `${scriptId}.json`)
	if (!existsSync(path)) return null
	return readJSON<AutomationScript>(path)
}

/**
 * Generate an automation script from the latest execution of a task.
 * Converts action logs into reproducible steps with multi-strategy selectors.
 */
export function generateScript(taskId: string, executionId?: string): AutomationScript | null {
	const task = getTask(taskId)
	if (!task) return null

	const executions = listExecutions(taskId)
	if (executions.length === 0) return null

	// Use specified execution or the latest one
	const exec = executionId
		? executions.find((e) => e.id === executionId)
		: executions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]

	if (!exec || exec.logs.length === 0) return null

	const steps: AutomationStep[] = []
	let stepIdx = 0

	for (const log of exec.logs) {
		const { action, element } = log

		// Skip non-actionable tools
		if (['done', 'ask_user'].includes(action.name)) continue

		const base: Omit<AutomationStep, 'type'> = {
			index: stepIdx++,
			description: buildDescription(action.name, action.input, element?.text),
			rawInput: action.input,
		}

		switch (action.name) {
			case 'click_element_by_index': {
				steps.push({
					...base,
					type: 'click',
					selector: buildSelector(element),
				})
				break
			}
			case 'input_text': {
				steps.push({
					...base,
					type: 'input',
					selector: buildSelector(element),
					value: str(action.input.text),
				})
				break
			}
			case 'input_text_and_enter': {
				steps.push({
					...base,
					type: 'input',
					selector: buildSelector(element),
					value: str(action.input.text),
				})
				break
			}
			case 'send_keys': {
				steps.push({
					...base,
					type: 'send_keys',
					value: str(action.input.keys),
				})
				break
			}
			case 'scroll': {
				steps.push({
					...base,
					type: 'scroll',
					scrollDirection: str(action.input.direction, 'down') as AutomationStep['scrollDirection'],
					scrollPages: Number(action.input.num_pages ?? 1),
				})
				break
			}
			case 'navigate': {
				steps.push({
					...base,
					type: 'navigate',
					value: str(action.input.url),
				})
				break
			}
			case 'wait': {
				steps.push({ ...base, type: 'wait' })
				break
			}
			default:
				// Preserve unknown actions as-is with a generic type
				break
		}
	}

	const script: AutomationScript = {
		id: randomUUID(),
		taskId,
		name: `${task.name} — Auto Script`,
		description: `Generated from execution on ${new Date(exec.startedAt).toLocaleString()}`,
		createdAt: new Date().toISOString(),
		urlPattern: task.url,
		steps,
	}

	const dir = join(taskDir(taskId), 'scripts')
	ensureDir(dir)
	writeJSON(join(dir, `${script.id}.json`), script)
	return script
}

// ─── Notes ────────────────────────────────────────────────────────────────────

export function addNote(taskId: string, execId: string, content: string): TrainerNote | null {
	const execPath = join(taskDir(taskId), 'executions', `${execId}.json`)
	if (!existsSync(execPath)) return null
	const exec = readJSON<Execution & { notes?: TrainerNote[] }>(execPath)
	const note: TrainerNote = {
		id: randomUUID(),
		executionId: execId,
		taskId,
		content,
		createdAt: new Date().toISOString(),
	}
	exec.notes = [...(exec.notes ?? []), note]
	writeJSON(execPath, exec)
	return note
}

export function getNotes(taskId: string, execId: string): TrainerNote[] {
	const execPath = join(taskDir(taskId), 'executions', `${execId}.json`)
	if (!existsSync(execPath)) return []
	const exec = readJSON<Execution & { notes?: TrainerNote[] }>(execPath)
	return exec.notes ?? []
}

// ─── AI Sequences ─────────────────────────────────────────────────────────────

function sequencesDir(taskId: string) {
	return join(taskDir(taskId), 'sequences')
}

export function listSequences(taskId: string): TrainerSequence[] {
	const dir = sequencesDir(taskId)
	ensureDir(dir)
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.map((f) => {
			try {
				return readJSON<TrainerSequence>(join(dir, f))
			} catch {
				return null
			}
		})
		.filter(Boolean) as TrainerSequence[]
}

export function saveSequence(
	taskId: string,
	name: string,
	description: string,
	params: string[],
	xml: string
): TrainerSequence {
	const dir = sequencesDir(taskId)
	ensureDir(dir)
	// Update if same name exists
	const existing = listSequences(taskId).find((s) => s.name === name)
	const seq: TrainerSequence = {
		id: existing?.id ?? randomUUID(),
		taskId,
		name,
		description,
		params,
		xml,
		createdAt: existing?.createdAt ?? new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}
	writeJSON(join(dir, `${seq.id}.json`), seq)
	return seq
}

export function deleteSequence(taskId: string, seqId: string): boolean {
	const path = join(sequencesDir(taskId), `${seqId}.json`)
	if (!existsSync(path)) return false
	unlinkSync(path)
	return true
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSelector(element: Execution['logs'][number]['element']): ElementSelector {
	if (!element) return {}
	const sel: ElementSelector = { index: element.index }
	if (element.text) sel.text = element.text
	if (element.attributes.id) sel.id = element.attributes.id
	if (element.attributes.class) sel.className = element.attributes.class
	if (element.attributes.role) sel.role = element.attributes.role
	if (element.attributes['aria-label']) sel.ariaLabel = element.attributes['aria-label']
	if (element.attributes.placeholder) sel.placeholder = element.attributes.placeholder
	if (element.attributes.name) sel.name = element.attributes.name
	return sel
}

function buildDescription(
	actionName: string,
	input: Record<string, unknown>,
	text?: string
): string {
	switch (actionName) {
		case 'click_element_by_index':
			return `Click "${text ?? `element [${input.index}]`}"`
		case 'input_text':
		case 'input_text_and_enter':
			return `Type "${input.text}" into "${text ?? `element [${input.index}]`}"`
		case 'send_keys':
			return `Press keys: ${str(input.keys)}`
		case 'scroll':
			return `Scroll ${str(input.direction, 'down')} ${str(input.num_pages, '1')} page(s)`
		case 'navigate':
			return `Navigate to ${str(input.url)}`
		case 'wait':
			return `Wait ${str(input.seconds, '1')}s`
		default:
			return actionName
	}
}
