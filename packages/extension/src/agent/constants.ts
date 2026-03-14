import type { LLMConfig } from '@page-agent/llms'

// Default LLM config
export const DEMO_MODEL = 'google/gemini-3-flash-preview'
export const DEMO_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEMO_API_KEY = ''

export const DEMO_CONFIG: LLMConfig = {
	apiKey: DEMO_API_KEY,
	baseURL: DEMO_BASE_URL,
	model: DEMO_MODEL,
}

/** Legacy testing endpoints that should be auto-migrated to DEMO_BASE_URL */
export const LEGACY_TESTING_ENDPOINTS = [
	'https://hwcxiuzfylggtcktqgij.supabase.co/functions/v1/llm-testing-proxy',
	'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run',
]

export function isTestingEndpoint(url: string): boolean {
	const normalized = url.replace(/\/+$/, '')
	return LEGACY_TESTING_ENDPOINTS.some((ep) => normalized === ep)
}

export function migrateLegacyEndpoint(config: LLMConfig): LLMConfig {
	const normalized = config.baseURL.replace(/\/+$/, '')
	if (LEGACY_TESTING_ENDPOINTS.some((ep) => normalized === ep)) {
		return { ...DEMO_CONFIG }
	}
	return config
}
