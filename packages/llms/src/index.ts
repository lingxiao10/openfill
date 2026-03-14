import { OpenAIClient } from './OpenAIClient'
import { DEFAULT_TEMPERATURE, LLM_MAX_RETRIES } from './constants'
import { InvokeError, InvokeErrorType } from './errors'
import type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool } from './types'

export { InvokeError, InvokeErrorType }
export type { InvokeOptions, InvokeResult, LLMClient, LLMConfig, Message, Tool }

export function parseLLMConfig(config: LLMConfig): Required<LLMConfig> {
	// Runtime validation as defensive programming (types already guarantee these)
	if (!config.baseURL || !config.apiKey || !config.model) {
		throw new Error(
			'LLM configuration required. Please provide: baseURL, apiKey, model.'
		)
	}

	// Auto-fix known incorrect base URLs
	let baseURL = config.baseURL.replace(/\/+$/, '') // strip trailing slashes
	if (baseURL === 'https://openrouter.ai/v1' || baseURL === 'http://openrouter.ai/v1') {
		console.warn('[OpenFill] Auto-correcting OpenRouter base URL to https://openrouter.ai/api/v1')
		baseURL = 'https://openrouter.ai/api/v1'
	}

	return {
		baseURL,
		apiKey: config.apiKey,
		model: config.model,
		temperature: config.temperature ?? DEFAULT_TEMPERATURE,
		maxRetries: config.maxRetries ?? LLM_MAX_RETRIES,
		customFetch: (config.customFetch ?? fetch).bind(globalThis), // fetch will be illegal unless bound
	}
}

export class LLM extends EventTarget {
	#rawConfig: LLMConfig
	config!: Required<LLMConfig>
	client!: LLMClient

	constructor(config: LLMConfig) {
		super()
		this.#rawConfig = config
	}

	/**
	 * - call llm api *once*
	 * - invoke tool call *once*
	 * - return the result of the tool
	 */
	async invoke(
		messages: Message[],
		tools: Record<string, Tool>,
		abortSignal: AbortSignal,
		options?: InvokeOptions
	): Promise<InvokeResult> {
		// Validate and initialise config+client lazily (deferred from constructor
		// so that creating an agent with an empty config doesn't crash the UI)
		if (!this.client) {
			this.config = parseLLMConfig(this.#rawConfig)
			this.client = new OpenAIClient(this.config)
		}

		return await withRetry(
			async () => {
				// in case user aborted before invoking
				if (abortSignal.aborted) throw new Error('AbortError')

				const result = await this.client.invoke(messages, tools, abortSignal, options)

				return result
			},
			// retry settings
			{
				maxRetries: this.config.maxRetries,
				onRetry: (attempt: number) => {
					this.dispatchEvent(
						new CustomEvent('retry', { detail: { attempt, maxAttempts: this.config.maxRetries } })
					)
				},
				onError: (error: Error) => {
					this.dispatchEvent(new CustomEvent('error', { detail: { error } }))
				},
			}
		)
	}
}

async function withRetry<T>(
	fn: () => Promise<T>,
	settings: {
		maxRetries: number
		onRetry: (attempt: number) => void
		onError: (error: Error) => void
	}
): Promise<T> {
	let attempt = 0
	let lastError: Error | null = null
	while (attempt <= settings.maxRetries) {
		if (attempt > 0) {
			settings.onRetry(attempt)
			await new Promise((resolve) => setTimeout(resolve, 100))
		}

		try {
			return await fn()
		} catch (error: unknown) {
			// do not retry if aborted by user
			if ((error as any)?.rawError?.name === 'AbortError') throw error

			console.error(error)
			settings.onError(error as Error)

			// do not retry if error is not retryable (InvokeError)
			if (error instanceof InvokeError && !error.retryable) throw error

			lastError = error as Error
			attempt++

			await new Promise((resolve) => setTimeout(resolve, 100))
		}
	}

	throw lastError!
}
