import type { AutomationScript, AutomationStep } from './types'

export type ScriptRunStatus = 'idle' | 'running' | 'completed' | 'error'

export interface ScriptRunProgress {
	stepIndex: number
	total: number
	status: ScriptRunStatus
	stepDesc?: string
	error?: string
}

type OnProgress = (p: ScriptRunProgress) => void

const ACTION_MAP: Record<string, string> = {
	click: 'click_element',
	input: 'input_text',
	scroll: 'scroll',
	select_option: 'select_option',
	send_keys: 'send_keys',
}

function sendPageControl(action: string, tabId: number, payload: unknown[]): Promise<unknown> {
	return chrome.runtime
		.sendMessage({ type: 'PAGE_CONTROL', action, targetTabId: tabId, payload })
		.catch((err) => {
			console.warn('[ScriptRunner]', action, 'failed:', err)
			return null
		})
}

function waitForTabLoad(tabId: number, timeout = 8000): Promise<void> {
	return new Promise((resolve) => {
		const done = () => {
			chrome.tabs.onUpdated.removeListener(listener)
			resolve()
		}
		const timer = setTimeout(done, timeout)
		const listener = (id: number, info: { status?: string }) => {
			if (id === tabId && info.status === 'complete') {
				clearTimeout(timer)
				done()
			}
		}
		chrome.tabs.onUpdated.addListener(listener)
	})
}

async function executeStep(step: AutomationStep, tabId: number): Promise<void> {
	if (step.type === 'navigate') {
		const url = (step.rawInput?.url as string) ?? ''
		if (url) {
			await chrome.tabs.update(tabId, { url })
			await waitForTabLoad(tabId)
		}
		return
	}

	if (step.type === 'wait') {
		await new Promise((r) => setTimeout(r, 1000))
		return
	}

	const action = ACTION_MAP[step.type]
	if (!action || !step.rawInput) {
		console.warn('[ScriptRunner] skipping step with no rawInput:', step.description)
		return
	}

	await sendPageControl(action, tabId, [step.rawInput])

	// Give page time to react after clicks (may trigger navigation)
	if (step.type === 'click') {
		await new Promise((r) => setTimeout(r, 1000))
	}
}

export async function runScript(script: AutomationScript, onProgress?: OnProgress): Promise<void> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
	if (!tab?.id) throw new Error('No active tab')
	const tabId = tab.id
	const total = script.steps.length

	for (let i = 0; i < total; i++) {
		const step = script.steps[i]
		onProgress?.({ stepIndex: i, total, status: 'running', stepDesc: step.description })
		await executeStep(step, tabId)
	}

	onProgress?.({ stepIndex: total, total, status: 'completed' })
}
