/**
 * Shared types for the Trainer system.
 * These are also re-exported and used by the extension's TrainerClient.
 */

// ─── Training Task ───────────────────────────────────────────────────────────

export interface TrainingTask {
	id: string
	name: string
	/** Target URL for this training task */
	url: string
	/** Natural-language description of what the automation should do */
	description: string
	createdAt: string
	status: 'active' | 'completed' | 'archived'
}

// ─── Element Details ─────────────────────────────────────────────────────────

/** Serialisable element info captured at action time */
export interface ElementDetails {
	/** OpenFill highlight index ([N] in the page content) */
	index: number
	tag: string
	text: string
	attributes: Record<string, string>
}

// ─── Action Log ──────────────────────────────────────────────────────────────

export interface ActionLogEntry {
	taskId: string
	executionId: string
	stepIndex: number
	actionIndex: number
	timestamp: string
	url: string
	pageTitle?: string
	action: {
		name: string
		input: Record<string, unknown>
		output: string
		durationMs?: number
	}
	/** Full page content snapshot at this step (the [N]<tag> string) */
	pageContent?: string
	/** Resolved element details when the action targets an element by index */
	element?: ElementDetails | null
}

// ─── Execution ───────────────────────────────────────────────────────────────

export interface Execution {
	id: string
	taskId: string
	userRequest: string
	startedAt: string
	completedAt?: string
	success?: boolean
	/** Ordered log entries for this run */
	logs: ActionLogEntry[]
}

// ─── Automation Script ───────────────────────────────────────────────────────

export type StepType =
	| 'click'
	| 'input'
	| 'scroll'
	| 'wait'
	| 'navigate'
	| 'select_option'
	| 'send_keys'

export interface ElementSelector {
	/** OpenFill highlight index (primary, may change between runs) */
	index?: number
	/** Visible text content */
	text?: string
	id?: string
	className?: string
	role?: string
	ariaLabel?: string
	placeholder?: string
	name?: string
}

export interface AutomationStep {
	index: number
	type: StepType
	description: string
	/** How to locate the target element */
	selector?: ElementSelector
	/** For input/send_keys steps */
	value?: string
	/** For scroll steps */
	scrollDirection?: 'up' | 'down' | 'left' | 'right'
	scrollPages?: number
	/** Raw action input for full fidelity replay */
	rawInput?: Record<string, unknown>
}

export interface AutomationScript {
	id: string
	taskId: string
	name: string
	description: string
	createdAt: string
	/** URL pattern this script targets */
	urlPattern: string
	steps: AutomationStep[]
}

// ─── Note ────────────────────────────────────────────────────────────────────

export interface TrainerNote {
	id: string
	executionId: string
	taskId: string
	content: string
	createdAt: string
}

// ─── AI-authored Sequence (legacy XML format) ────────────────────────────────

export interface TrainerSequence {
	id: string
	taskId: string
	name: string
	description: string
	/** Comma-separated param names */
	params: string[]
	/** Serialized XML */
	xml: string
	createdAt: string
	updatedAt: string
}

// ─── AI-authored Script (JS format) ──────────────────────────────────────────

export interface TrainerScript {
	id: string
	taskId: string
	name: string
	description: string
	/** Navigate here before running the script */
	entryUrl?: string
	/** Runtime param names */
	params: string[]
	/** Async function body with access to page API and params */
	code: string
	createdAt: string
	updatedAt: string
}

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface CreateTaskPayload {
	name: string
	url: string
	description: string
}

export interface StartExecutionPayload {
	userRequest: string
}

export interface AddLogsPayload {
	logs: ActionLogEntry[]
}

export interface CompleteExecutionPayload {
	success: boolean
}
