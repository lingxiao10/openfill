/**
 * TrainerTools — AI tools injected only during trainer-mode sessions.
 *
 * Provides: write_note, write_sequence, exec_sequence, finalize_sequence
 *
 * Module-level draft store holds sequences within the lifetime of one execution.
 */
import { tool } from '@page-agent/core'
import type { PageAgentTool } from '@page-agent/core'
import * as z from 'zod/v4'

import * as TC from './TrainerClient'
import { execute } from './sequence/SequenceExecutor'
import { parse, serialize } from './sequence/SequenceParser'
import type { SequenceSpec } from './sequence/types'

// ─── Draft store (per execution) ─────────────────────────────────────────────

/** Holds sequences written by the AI during the current execution */
const _draftSequences = new Map<string, SequenceSpec>()

export function clearDrafts(): void {
	_draftSequences.clear()
}

export function getDraft(name: string): SequenceSpec | undefined {
	return _draftSequences.get(name)
}

// ─── Chrome sender (production) ──────────────────────────────────────────────

const chromeSender = {
	send(action: string, tabId: number, payload: unknown[]) {
		return chrome.runtime
			.sendMessage({ type: 'PAGE_CONTROL', action, targetTabId: tabId, payload })
			.catch(() => null)
	},
}

// ─── Tool factories ───────────────────────────────────────────────────────────

export function createTrainerTools(taskId: string): Record<string, PageAgentTool> {
	return {
		write_note: buildWriteNoteTool(taskId),
		write_sequence: buildWriteSequenceTool(),
		exec_sequence: buildExecSequenceTool(),
		finalize_sequence: buildFinalizeSequenceTool(taskId),
	}
}

// ─── write_note ───────────────────────────────────────────────────────────────

function buildWriteNoteTool(taskId: string): PageAgentTool {
	return tool({
		description:
			'Write a note to record observations, discoveries, or reasoning about the current task. ' +
			'Use this to document important findings as you explore. ' +
			'The final note should summarize how to accomplish the task and provide recommendations.',
		inputSchema: z.object({
			content: z.string().describe('The note content to record'),
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

// ─── write_sequence ───────────────────────────────────────────────────────────

function buildWriteSequenceTool(): PageAgentTool {
	return tool({
		description:
			'Write a reusable automation sequence in XML format. The sequence will be stored in memory ' +
			'until you finalize it. You can overwrite a sequence by writing it again with the same name. ' +
			'Format:\n' +
			'<sequence name="unique_name" description="what it does" params="param1,param2">\n' +
			'  <step type="click" selector="text:Button label" />\n' +
			'  <step type="input" selector="placeholder:Input hint" value="{{param1}}" />\n' +
			'  <step type="input_enter" selector="css:#search" value="{{param2}}" />\n' +
			'  <step type="wait" ms="500" />\n' +
			'  <step type="navigate" value="back" />\n' +
			'  <step type="scroll" direction="down" pages="2" />\n' +
			'  <step type="send_keys" value="Escape" />\n' +
			'</sequence>\n' +
			'Selector strategies: text:xxx | aria:xxx | placeholder:xxx | role:xxx | css:xxx',
		inputSchema: z.object({
			xml: z.string().describe('The full <sequence>...</sequence> XML'),
		}),
		execute: async ({ xml }) => {
			const result = parse(xml)
			if (result instanceof Error) return `Parse error: ${result.message}`
			_draftSequences.set(result.name, result)
			const summary = `Sequence "${result.name}" stored with ${result.steps.length} steps.`
			return summary + (result.params.length ? ` Params: ${result.params.join(', ')}.` : '')
		},
	})
}

// ─── exec_sequence ────────────────────────────────────────────────────────────

function buildExecSequenceTool(): PageAgentTool {
	return tool({
		description:
			'Execute a previously written sequence to test it on the current page. ' +
			'Pass params as "key=value,key2=value2". Returns step-by-step results.',
		inputSchema: z.object({
			name: z.string().describe('The sequence name to execute'),
			params: z.string().optional().describe('Parameters as "key=value,key2=value2"'),
		}),
		execute: async ({ name, params }) => {
			const seq = _draftSequences.get(name)
			if (!seq) return `Sequence "${name}" not found. Write it first with write_sequence.`

			const parsedParams = parseParams(params ?? '')

			const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
			if (!tab?.id) return 'No active tab found.'

			const result = await execute(seq, parsedParams, tab.id, chromeSender)

			const lines = result.steps.map(
				(s) => `Step ${s.stepIndex + 1} [${s.type}]: ${s.success ? '✓' : '✗'} ${s.error ?? ''}`
			)
			lines.push(`\nOverall: ${result.success ? 'SUCCESS' : 'FAILED'}`)
			return lines.join('\n')
		},
	})
}

// ─── finalize_sequence ────────────────────────────────────────────────────────

function buildFinalizeSequenceTool(taskId: string): PageAgentTool {
	return tool({
		description:
			'Save a tested sequence permanently to the trainer server. ' +
			'Only call this after exec_sequence confirms the sequence works correctly.',
		inputSchema: z.object({
			name: z.string().describe('The sequence name to finalize'),
		}),
		execute: async ({ name }) => {
			const seq = _draftSequences.get(name)
			if (!seq) return `Sequence "${name}" not found. Write it first with write_sequence.`

			const xml = serialize(seq)
			const saved = await TC.saveSequence(taskId, seq.name, seq.description ?? '', seq.params, xml)
			if (!saved) return 'Failed to save sequence (trainer server offline?)'
			return `Sequence "${name}" saved permanently with ${seq.steps.length} steps.`
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
