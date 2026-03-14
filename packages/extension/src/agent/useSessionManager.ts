/**
 * React hook for managing multiple parallel chat sessions.
 */
import type { SupportedLanguage } from '@page-agent/core'
import type { LLMConfig } from '@page-agent/llms'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Trans } from '@/utils/Trans'
import { DEMO_CONFIG, migrateLegacyEndpoint } from './constants'
import { SessionManager, type ChatSession } from './SessionManager'
import type { AdvancedConfig, ExtConfig } from './useAgent'

/** Sync the UI language (Trans) with the stored agent language preference */
function syncTransLang(language: SupportedLanguage | undefined): void {
	if (language === 'zh-CN') Trans.setLang('zh')
	else if (language === 'en-US') Trans.setLang('en')
	// undefined = follow system, Trans already auto-detects on getLang()
}

export interface UseSessionManagerResult {
	sessions: ChatSession[]
	activeSessionId: string | null
	activeSession: ChatSession | null
	config: ExtConfig | null
	setActiveSessionId: (id: string) => void
	createSession: () => string
	closeSession: (id: string) => void
	execute: (task: string) => Promise<void>
	stop: () => void
	configure: (config: ExtConfig) => Promise<void>
}

export function useSessionManager(): UseSessionManagerResult {
	const managerRef = useRef<SessionManager>(new SessionManager())
	const [sessions, setSessions] = useState<ChatSession[]>([])
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
	const [config, setConfig] = useState<ExtConfig | null>(null)

	// Load config on mount
	useEffect(() => {
		chrome.storage.local.get(['llmConfig', 'language', 'advancedConfig']).then((result) => {
			let llmConfig = (result.llmConfig as LLMConfig) ?? DEMO_CONFIG
			const language = (result.language as SupportedLanguage) || undefined
			const advancedConfig = (result.advancedConfig as AdvancedConfig) ?? {}

			const migrated = migrateLegacyEndpoint(llmConfig)
			if (migrated !== llmConfig) {
				llmConfig = migrated
				chrome.storage.local.set({ llmConfig: migrated })
			} else if (!result.llmConfig) {
				chrome.storage.local.set({ llmConfig: DEMO_CONFIG })
			}

			syncTransLang(language)
			setConfig({ ...llmConfig, ...advancedConfig, language })
		})
	}, [])

	// Once config is ready, initialise manager and create the first session
	useEffect(() => {
		if (!config) return
		const manager = managerRef.current

		manager.setConfig(config)

		if (manager.getSessions().length === 0) {
			const id = manager.createSession()
			setActiveSessionId(id)
			setSessions(manager.getSessions())
		}

		const handleChange = () => setSessions([...manager.getSessions()])
		manager.addEventListener('change', handleChange)
		return () => manager.removeEventListener('change', handleChange)
	}, [config])

	const createSession = useCallback((): string => {
		const manager = managerRef.current
		const id = manager.createSession()
		setActiveSessionId(id)
		setSessions([...manager.getSessions()])
		return id
	}, [])

	const closeSession = useCallback(
		(id: string) => {
			const manager = managerRef.current
			manager.closeSession(id)
			const remaining = manager.getSessions()
			setSessions([...remaining])
			if (activeSessionId === id) {
				setActiveSessionId(remaining.at(-1)?.id ?? null)
			}
		},
		[activeSessionId]
	)

	const execute = useCallback(
		async (task: string) => {
			if (!activeSessionId) return
			await managerRef.current.executeInSession(activeSessionId, task)
		},
		[activeSessionId]
	)

	const stop = useCallback(() => {
		if (!activeSessionId) return
		managerRef.current.stopSession(activeSessionId)
	}, [activeSessionId])

	const configure = useCallback(
		async ({
			language,
			maxSteps,
			systemInstruction,
			experimentalLlmsTxt,
			showDownloadLogs,
			doubaoApiKey,
			doubaoSearchEndpoint,
			searchEnabled,
			...llmConfig
		}: ExtConfig) => {
			await chrome.storage.local.set({ llmConfig })
			if (language) {
				await chrome.storage.local.set({ language })
			} else {
				await chrome.storage.local.remove('language')
			}
			const advancedConfig: AdvancedConfig = {
				maxSteps,
				systemInstruction,
				experimentalLlmsTxt,
				showDownloadLogs,
				doubaoApiKey,
				doubaoSearchEndpoint,
				searchEnabled,
			}
			await chrome.storage.local.set({ advancedConfig })
			const newConfig: ExtConfig = { ...llmConfig, ...advancedConfig, language }
			syncTransLang(language)
			setConfig(newConfig)
			managerRef.current.reconfigure(newConfig)
		},
		[]
	)

	const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

	return {
		sessions,
		activeSessionId,
		activeSession,
		config,
		setActiveSessionId,
		createSession,
		closeSession,
		execute,
		stop,
		configure,
	}
}
