/**
 * Internal tools for PageAgent.
 * @note Adapted from browser-use
 */
import * as z from 'zod/v4'

import type { PageAgentCore } from '../PageAgentCore'
import type { HistoricalEvent } from '../types'
import { waitFor } from '../utils'

/**
 * Internal tool definition that has access to PageAgent `this` context
 */
export interface PageAgentTool<TParams = any> {
	// name: string
	description: string
	inputSchema: z.ZodType<TParams>
	execute: (this: PageAgentCore, args: TParams) => Promise<string | { output: string; subHistory?: HistoricalEvent[] }>
}

export function tool<TParams>(options: PageAgentTool<TParams>): PageAgentTool<TParams> {
	return options
}

/**
 * Internal tools for PageAgent.
 * Note: Using any to allow different parameter types for each tool
 */
export const tools = new Map<string, PageAgentTool>()

tools.set(
	'done',
	tool({
		description:
			'Complete task. Text is your final response to the user — keep it concise unless the user explicitly asks for detail.',
		inputSchema: z.object({
			text: z.string(),
			success: z.boolean().default(true),
		}),
		execute: async function (this: PageAgentCore, input) {
			// @note main loop will handle this one
			return Promise.resolve('Task completed')
		},
	})
)

tools.set(
	'wait',
	tool({
		description: 'Wait for x seconds. Can be used to wait until the page or data is fully loaded.',
		inputSchema: z.object({
			seconds: z.coerce.number().min(0).max(30).default(1),
		}),
		execute: async function (this: PageAgentCore, input) {
			// try to subtract LLM calling time from the actual wait time
			const lastTimeUpdate = await this.pageController.getLastUpdateTime()
			const actualWaitTime = Math.max(0, input.seconds - (Date.now() - lastTimeUpdate) / 1000)
			console.log(`actualWaitTime: ${actualWaitTime} seconds`)
			await waitFor(actualWaitTime)

			return `✅ Waited for ${input.seconds} seconds.`
		},
	})
)

tools.set(
	'ask_user',
	tool({
		description:
			'Ask the user a question and wait for their answer. Use this if you need more information or clarification.',
		inputSchema: z.object({
			question: z.string(),
		}),
		execute: async function (this: PageAgentCore, input) {
			if (!this.onAskUser) {
				throw new Error('ask_user tool requires onAskUser callback to be set')
			}
			const answer = await this.onAskUser(input.question)
			return `User answered: ${answer}`
		},
	})
)

tools.set(
	'click_element_by_index',
	tool({
		description: 'Click element by index',
		inputSchema: z.object({
			index: z.int().min(0),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.clickElement(input.index)
			return result.message
		},
	})
)

tools.set(
	'input_text_and_enter',
	tool({
		description:
			'Type text into a tag/chip input field and immediately confirm it with Enter. ' +
			'Use ONLY for tag inputs where each value must be confirmed by pressing Enter. ' +
			'Do NOT use for plain text fields — use input_text instead.',
		inputSchema: z.object({
			index: z.int().min(0),
			text: z.string().describe('The tag text to type and confirm'),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.inputTextAndEnter(input.index, input.text)
			return result.message
		},
	})
)

tools.set(
	'input_text',
	tool({
		description: 'Click and type text into an interactive input element',
		inputSchema: z.object({
			index: z.int().min(0),
			text: z.string(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.inputText(input.index, input.text)
			return result.message
		},
	})
)

tools.set(
	'select_dropdown_option',
	tool({
		description:
			'Select dropdown option for interactive element index by the text of the option you want to select',
		inputSchema: z.object({
			index: z.int().min(0),
			text: z.string(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.selectOption(input.index, input.text)
			return result.message
		},
	})
)

tools.set(
	'click_blank_area',
	tool({
		description:
			'Click a non-interactive area or element that does NOT appear in the interactive elements list. ' +
			'Use this when you need to: dismiss a modal/overlay by clicking outside it, interact with a custom ' +
			'component (e.g. a div with an onClick handler), or click any visible element that has no assigned index. ' +
			'Do NOT use this for elements that already have an index — use click_element_by_index instead. ' +
			'Provide a CSS selector that uniquely identifies the target element.',
		inputSchema: z.object({
			selector: z
				.string()
				.describe(
					'CSS selector for the element to click (e.g. ".modal-overlay", "#close-btn", "[data-testid=backdrop]")'
				),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.clickBlankArea(input.selector)
			return result.message
		},
	})
)

/**
 * @note Reference from browser-use
 */
tools.set(
	'scroll',
	tool({
		description: 'Scroll the page vertically. Use index for scroll elements (dropdowns/custom UI).',
		inputSchema: z.object({
			down: z.boolean().default(true),
			num_pages: z.number().min(0).max(10).optional().default(0.1),
			pixels: z.number().int().min(0).optional(),
			index: z.number().int().min(0).optional(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.scroll({
				...input,
				numPages: input.num_pages,
			})
			return result.message
		},
	})
)

/**
 * @todo Tables need a dedicated parser to extract structured data. This tool is useless.
 */
tools.set(
	'scroll_horizontally',
	tool({
		description:
			'Scroll the page horizontally, or within a specific element by index. Useful for wide tables.',
		inputSchema: z.object({
			right: z.boolean().default(true),
			pixels: z.number().int().min(0),
			index: z.number().int().min(0).optional(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.scrollHorizontally(input)
			return result.message
		},
	})
)

tools.set(
	'execute_javascript',
	tool({
		description:
			'Execute JavaScript code on the current page. Supports async/await syntax. Use with caution!',
		inputSchema: z.object({
			script: z.string(),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.executeJavascript(input.script)
			return result.message
		},
	})
)

// @todo send_keys
// @todo upload_file
// @todo go_back
// @todo extract_structured_data

tools.set(
	'send_keys',
	tool({
		description:
			'Send a key or key combo to an element or the currently focused element. ' +
			'Simulates the full realistic keyboard sequence including modifier keys. ' +
			'MANDATORY for tag/chip inputs: use key="Enter" after input_text to confirm. ' +
			'Common shortcuts: Ctrl+A=select all, Ctrl+C=copy, Ctrl+V=paste, Ctrl+X=cut, ' +
			'Ctrl+Z=undo, Ctrl+Y=redo, Ctrl+Shift+Z=redo, Delete/Backspace=delete, ' +
			'Home/End=line start/end, Ctrl+Home/Ctrl+End=doc start/end, ' +
			'Shift+Home/Shift+End=select to line start/end. ' +
			'If index is omitted, the key is sent to whichever element is currently focused.',
		inputSchema: z.object({
			key: z
				.enum([
					// Basic
					'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
					// Navigation
					'Home', 'End', 'PageUp', 'PageDown',
					'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
					// Ctrl shortcuts
					'Ctrl+A', 'Ctrl+C', 'Ctrl+V', 'Ctrl+X',
					'Ctrl+Z', 'Ctrl+Y', 'Ctrl+Shift+Z',
					'Ctrl+Home', 'Ctrl+End',
					'Ctrl+ArrowLeft', 'Ctrl+ArrowRight',
					'Ctrl+Backspace', 'Ctrl+Delete',
					// Shift selection
					'Shift+Home', 'Shift+End',
					'Shift+ArrowUp', 'Shift+ArrowDown',
					'Shift+ArrowLeft', 'Shift+ArrowRight',
					// Ctrl+Shift selection
					'Ctrl+Shift+Home', 'Ctrl+Shift+End',
					'Ctrl+Shift+ArrowLeft', 'Ctrl+Shift+ArrowRight',
				])
				.describe('Key or key combo to send'),
			index: z
				.number()
				.int()
				.min(0)
				.optional()
				.describe('Element index to focus before sending the key. Omit to use the active element.'),
		}),
		execute: async function (this: PageAgentCore, input) {
			const result = await this.pageController.sendKeys(input.key, input.index)
			return result.message
		},
	})
)

tools.set(
	'run_subtask',
	tool({
		description:
			'Launch a focused sub-agent to complete a specific interaction on the current page. ' +
			'The sub-agent has all the same tools and runs its own task loop until it calls done. ' +
			'MANDATORY use cases: dropdown menus, date pickers, calendar widgets, time pickers, ' +
			'cascading selectors (region → city → district), and any element that opens a picker or ' +
			'expanded selection panel when clicked. ' +
			'For tag/chip inputs: use input_text then send_keys with Enter to confirm each tag. ' +
			'Do NOT attempt these interactions yourself — always delegate via this tool.',
		inputSchema: z.object({
			task: z
				.string()
				.describe('What the sub-agent should accomplish, including the exact value to select/fill.'),
			context: z
				.string()
				.optional()
				.describe(
					'Extra information the sub-agent needs: element index, surrounding context, constraints, etc.'
				),
		}),
		execute: async function (this: PageAgentCore, input) {
			// Dynamic import avoids circular dependency (PageAgentCore imports tools)
			const { PageAgentCore: SubAgentClass } = await import('../PageAgentCore')

			const subAgent = new SubAgentClass({
				// Inherit all LLM settings directly from the main agent (same model/key/url)
				baseURL: this.config.baseURL,
				apiKey: this.config.apiKey,
				model: this.config.model,
				temperature: this.config.temperature,
				maxRetries: this.config.maxRetries,
				customFetch: this.config.customFetch,
				// Share the same PageController (sub-task operates on the same page)
				pageController: this.pageController,
				maxSteps: this.config.subTask?.maxSteps ?? 15,
				language: this.config.language,
				// Internal: prevent sub-agents from spawning further sub-agents
				_isSubTask: true,
			})

			const fullTask = input.context
				? `${input.task}\n\nContext: ${input.context}`
				: input.task

			const result = await subAgent.execute(fullTask)

			const output = result.success
				? `✅ Sub-task completed.\nResult: ${result.data}`
				: `❌ Sub-task failed.\nResult: ${result.data}`
			return { output, subHistory: result.history }
		},
	})
)
