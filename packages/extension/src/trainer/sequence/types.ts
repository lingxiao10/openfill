// Pure types for the Sequence DSL — zero dependencies.

export type StepType =
	| 'click'
	| 'input'
	| 'input_enter'
	| 'wait'
	| 'navigate'
	| 'scroll'
	| 'send_keys'

/**
 * Selector string format (tried in order of priority):
 *   aria:label text       → [aria-label="..."]
 *   placeholder:hint      → [placeholder="..."]
 *   text:visible text     → element whose trimmed textContent matches
 *   role:button           → [role="..."]  (optionally role:button[text:Apply])
 *   css:#id .class        → raw CSS selector (fallback)
 */
export type SelectorSpec = string

export interface StepSpec {
	type: StepType
	/** For click / input / scroll / send_keys */
	selector?: SelectorSpec
	/** For input / input_enter / send_keys / navigate */
	value?: string
	/** For wait (milliseconds) */
	ms?: number
	/** For scroll */
	direction?: 'up' | 'down' | 'left' | 'right'
	pages?: number
	description?: string
}

export interface SequenceSpec {
	name: string
	description?: string
	/** Starting URL — the sequence navigates here before running steps */
	entryUrl?: string
	/** Comma-separated param names, e.g. "greeting,jobTitle" */
	params: string[]
	steps: StepSpec[]
}

export interface StepResult {
	stepIndex: number
	type: StepType
	description?: string
	success: boolean
	error?: string
}

export interface SequenceRunResult {
	name: string
	params: Record<string, string>
	steps: StepResult[]
	success: boolean
}
