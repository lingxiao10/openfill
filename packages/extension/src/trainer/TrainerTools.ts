/**
 * TrainerTools — AI tools injected only during trainer-mode sessions.
 *
 * Tools: write_note, write_script, exec_script, finalize_script, complete_training
 *
 * complete_training MUST be called before done — skipping it marks the session as failed.
 */
import { tool } from '@page-agent/core'
import type { PageAgentTool } from '@page-agent/core'
import * as z from 'zod/v4'

import * as TC from './TrainerClient'
import { execute } from './script/ScriptExecutor'
import type { TrainerScript } from './script/types'

// ─── Draft store ──────────────────────────────────────────────────────────────

const _drafts = new Map<string, TrainerScript>()

export function clearDrafts(): void {
	_drafts.clear()
}

export function getDraft(name: string): TrainerScript | undefined {
	return _drafts.get(name)
}

// ─── Completion status ────────────────────────────────────────────────────────

let _completionStatus: { status: 'success' | 'failed'; reason: string } | null = null

export function getCompletionStatus() {
	return _completionStatus
}

export function clearCompletionStatus(): void {
	_completionStatus = null
}

// ─── Chrome sender ────────────────────────────────────────────────────────────

const chromeSender = {
	send(action: string, tabId: number, payload: unknown[]) {
		return chrome.runtime
			.sendMessage({ type: 'PAGE_CONTROL', action, targetTabId: tabId, payload })
			.catch(() => null)
	},
}

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createTrainerTools(taskId: string): Record<string, PageAgentTool> {
	return {
		write_note: buildWriteNoteTool(taskId),
		write_script: buildWriteScriptTool(),
		exec_script: buildExecScriptTool(),
		finalize_script: buildFinalizeScriptTool(taskId),
		complete_training: buildCompleteTrainingTool(),
	}
}

// ─── write_note ───────────────────────────────────────────────────────────────

function buildWriteNoteTool(taskId: string): PageAgentTool {
	return tool({
		description:
			'Record an observation, discovery, or reasoning note during training. ' +
			'Use after each exploration run to document selector patterns, page flow, and edge cases.',
		inputSchema: z.object({
			content: z.string().describe('The note content'),
		}),
		execute: async ({ content }) => {
			const { execId } = TC.getActiveExecution()
			if (execId) {
				await TC.addNote(taskId, execId, content)
			}
			return `Note recorded (${content.length} chars).`
		},
	})
}

// ─── write_script ─────────────────────────────────────────────────────────────

function buildWriteScriptTool(): PageAgentTool {
	return tool({
		description:
			'Write a reusable JS automation script stored in memory until finalized.\n\n' +
			'The script body has access to `page` (PageAPI) and `params` (key/value object).\n\n' +
			'page API:\n' +
			'  await page.click("text:Button label")         // by visible text\n' +
			'  await page.click("aria:Close button")         // by aria-label\n' +
			'  await page.click("css:#id .cls")              // by CSS\n' +
			'  await page.input("placeholder:Search", value) // fill input\n' +
			'  await page.inputEnter("css:input", value)     // fill + press Enter\n' +
			'  await page.navigate("https://example.com")\n' +
			'  await page.wait(800)                          // wait ms\n' +
			'  await page.scroll("down", 2)                  // scroll pages\n' +
			'  await page.sendKeys("Escape")\n' +
			'  const ok  = await page.exists("text:Done")    // → boolean\n' +
			'  const txt = await page.getText("css:.title")  // → string\n' +
			'  const val = await page.getAttr("css:a", "href")\n' +
			'  const rows = await page.queryAll("css:.item", ["text","href"])\n' +
			'  // rows = [{ text: "...", href: "..." }, ...]\n' +
			'  await page.clickNth("css:.item", 2)           // click 3rd match\n' +
			'  const url = await page.getCurrentUrl()\n\n' +
			'Use params.xxx for runtime values (e.g. params.greeting).\n' +
			'Selectors: text:xxx | aria:xxx | placeholder:xxx | role:xxx | css:xxx',
		inputSchema: z.object({
			name: z.string().describe('Unique script name (snake_case)'),
			description: z.string().describe('What this script does'),
			entryUrl: z.string().optional().describe('Starting URL — script navigates here first'),
			params: z
				.string()
				.optional()
				.describe('Comma-separated param names, e.g. "greeting,jobTitle"'),
			code: z
				.string()
				.describe('JS code (async function body). Use await page.xxx() and params.xxx'),
		}),
		execute: async ({ name, description, entryUrl, params, code }) => {
			const script: TrainerScript = {
				id: crypto.randomUUID(),
				taskId: '',
				name,
				description,
				entryUrl: entryUrl || undefined,
				params: params
					? params
							.split(',')
							.map((p) => p.trim())
							.filter(Boolean)
					: [],
				code,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			}
			_drafts.set(name, script)
			const lines = code.split('\n').length
			return (
				`Script "${name}" stored (${lines} lines${entryUrl ? `, entryUrl: ${entryUrl}` : ''}).` +
				(script.params.length ? ` Params: ${script.params.join(', ')}.` : '')
			)
		},
	})
}

// ─── exec_script ──────────────────────────────────────────────────────────────

function buildExecScriptTool(): PageAgentTool {
	return tool({
		description:
			'Execute a previously written script to test it on the current page. ' +
			'Pass params as "key=value,key2=value2". Returns step-by-step execution log — read it carefully to debug failures.',
		inputSchema: z.object({
			name: z.string().describe('Script name to execute'),
			params: z.string().optional().describe('Parameters as "key=value,key2=value2"'),
		}),
		execute: async ({ name, params }) => {
			const script = _drafts.get(name)
			if (!script) return `Script "${name}" not found. Write it first with write_script.`

			const parsedParams = parseParams(params ?? '')
			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
			if (!tab?.id) return 'No active tab found.'

			const result = await execute(script, parsedParams, tab.id, chromeSender)
			const lines = result.output.join('\n')
			const summary = `\nResult: ${result.success ? 'SUCCESS' : 'FAILED'}`
			return lines + summary + (result.error ? `\nError: ${result.error}` : '')
		},
	})
}

// ─── finalize_script ──────────────────────────────────────────────────────────

function buildFinalizeScriptTool(taskId: string): PageAgentTool {
	return tool({
		description:
			'Save a tested script permanently to the trainer server. ' +
			'Only call this after exec_script confirms the script runs correctly (at least 2 successful runs).',
		inputSchema: z.object({
			name: z.string().describe('Script name to finalize'),
		}),
		execute: async ({ name }) => {
			const script = _drafts.get(name)
			if (!script) return `Script "${name}" not found. Write it first with write_script.`

			const saved = await TC.saveTrainerScript(taskId, script)
			if (!saved) return 'Failed to save script (trainer server offline?)'
			return `Script "${name}" saved permanently.`
		},
	})
}

// ─── complete_training ────────────────────────────────────────────────────────

function buildCompleteTrainingTool(): PageAgentTool {
	return tool({
		description:
			'REQUIRED: Mark this training session as complete. ' +
			'Call with status="success" after finalize_script saves a working script. ' +
			'Call with status="failed" with a reason if you cannot produce a working script. ' +
			'You MUST call this before calling done — skipping it marks the session as failed.',
		inputSchema: z.object({
			status: z.enum(['success', 'failed']),
			reason: z
				.string()
				.describe('Brief summary: what was built (success) or why it failed (failed)'),
		}),
		execute: async ({ status, reason }) => {
			_completionStatus = { status, reason }
			return status === 'success'
				? `✓ Training complete: ${reason}`
				: `✗ Training failed: ${reason}`
		},
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseParams(raw: string): Record<string, string> {
	if (!raw.trim()) return {}
	return Object.fromEntries(
		raw
			.split(',')
			.map((p) => p.split('=').map((s) => s.trim()))
			.filter((parts) => parts.length === 2)
			.map(([k, v]) => [k, v])
	)
}
