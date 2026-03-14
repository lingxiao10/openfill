import { DoubaoClient, DoubaoConfig, tool } from '@page-agent/core'
import type { AgentActivity, AgentStatus, DoubaoModel, HistoricalEvent, PageAgentTool } from '@page-agent/core'
import * as z from 'zod/v4'

import { upsertSession } from '@/lib/db'
import { Trans } from '@/utils/Trans'
import { debugLogActivity, debugLogEvent, debugLogTaskStart } from '../lib/debugLog'
import { MultiPageAgent } from './MultiPageAgent'
import type { ExtConfig } from './useAgent'

export interface ChatSession {
	id: string
	/** Sequential display name, e.g. "会话 1" */
	name: string
	createdAt: number
	/** Primary (first) task */
	task: string
	/** All tasks sent in this session */
	tasks: string[]
	history: HistoricalEvent[]
	status: AgentStatus
	activity: AgentActivity | null
}

interface SessionEntry {
	session: ChatSession
	agent: MultiPageAgent
	loggedHistoryLen: number
}

function buildSearchTool(apiKey: string, endpoint: string): PageAgentTool {
	return tool({
		description:
			'Search the web for up-to-date information using Doubao (Volcengine). ' +
			'Use this proactively before performing content-heavy work such as: ' +
			'writing articles, blog posts, reports, or summaries; ' +
			'researching a topic; looking up recent news, facts, or events; ' +
			'verifying information before completing a task. ' +
			'Always call web_search first when current or factual information would improve the result.',
		inputSchema: z.object({
			query: z.string().describe('The search query'),
		}),
		execute: async function (input) {
			try {
				DoubaoConfig.setApiKey(apiKey)
				const result = await DoubaoClient.search(input.query, 3, endpoint as DoubaoModel)
				return `Search results for "${input.query}":\n\n${result}`
			} catch (err) {
				return `❌ Search failed: ${err instanceof Error ? err.message : String(err)}`
			}
		},
	})
}

const SEARCH_INSTRUCTION =
	'\n\n<web_search_instructions>\n' +
	'You have access to a web_search tool powered by Doubao.\n' +
	'Use it proactively BEFORE performing content-heavy tasks:\n' +
	'- Writing articles, blog posts, reports, or summaries\n' +
	'- Researching a topic or gathering background information\n' +
	'- Looking up recent news, events, or current data\n' +
	'- Verifying facts before completing a task\n' +
	'Search first, then work — integrate the findings naturally into your output.\n' +
	'</web_search_instructions>'

function buildAgent(config: ExtConfig, sessionName: string, sessionId: string): MultiPageAgent {
	const { systemInstruction, doubaoApiKey, doubaoSearchEndpoint, searchEnabled, ...agentConfig } = config

	const hasSearch = Boolean(doubaoApiKey && doubaoSearchEndpoint && searchEnabled !== false)

	const customTools: Record<string, PageAgentTool> = {}
	if (hasSearch) {
		customTools.web_search = buildSearchTool(doubaoApiKey!, doubaoSearchEndpoint!)
	}

	const combinedInstruction = [systemInstruction, hasSearch ? SEARCH_INSTRUCTION : '']
		.filter(Boolean)
		.join('\n\n')

	return new MultiPageAgent({
		...agentConfig,
		sessionName,
		sessionId,
		instructions: combinedInstruction ? { system: combinedInstruction } : undefined,
		...(hasSearch ? { customTools } : {}),
	})
}

/**
 * Manages multiple parallel chat sessions, each with its own agent instance.
 * Emits a 'change' event whenever any session state changes.
 */
export class SessionManager extends EventTarget {
	#entries = new Map<string, SessionEntry>()
	#config: ExtConfig | null = null

	get config(): ExtConfig | null {
		return this.#config
	}

	setConfig(config: ExtConfig): void {
		this.#config = config
	}

	/** Create a new isolated session, returns its id */
	createSession(): string {
		if (!this.#config) throw new Error('Config not set')

		const id = crypto.randomUUID()
		const name = `${Trans.t('session_name')} ${this.#entries.size + 1}`
		const session: ChatSession = {
			id,
			name,
			createdAt: Date.now(),
			task: '',
			tasks: [],
			history: [],
			status: 'idle',
			activity: null,
		}

		const agent = buildAgent(this.#config, name, id)
		const entry: SessionEntry = { session, agent, loggedHistoryLen: 0 }
		this.#entries.set(id, entry)

		this.#bindAgent(entry)
		this.#emit()
		return id
	}

	#bindAgent(entry: SessionEntry): void {
		const { agent, session } = entry

		agent.addEventListener('statuschange', () => {
			session.status = agent.status as AgentStatus
			if (session.status !== 'running') {
				session.activity = null
				this.#persistSession(session)
			}
			this.#emit()
		})

		agent.addEventListener('historychange', () => {
			const newHistory = agent.history
			for (let i = entry.loggedHistoryLen; i < newHistory.length; i++) {
				debugLogEvent(newHistory[i])
			}
			entry.loggedHistoryLen = newHistory.length
			session.history = [...newHistory]
			this.#emit()
		})

		agent.addEventListener('activity', (e) => {
			const activity = (e as CustomEvent).detail as AgentActivity
			debugLogActivity(activity)
			session.activity = activity
			this.#emit()
		})
	}

	/** Execute a task in a session — continues the same session history if not the first task */
	async executeInSession(sessionId: string, task: string): Promise<void> {
		const entry = this.#entries.get(sessionId)
		if (!entry) throw new Error(`Session ${sessionId} not found`)
		if (entry.session.status === 'running') throw new Error('Session is already running')

		const { session, agent } = entry
		const isFirstTask = session.tasks.length === 0

		if (isFirstTask) {
			session.task = task
		}
		session.tasks.push(task)
		entry.loggedHistoryLen = 0

		debugLogTaskStart(task)

		await agent.execute(task, { continueSession: !isFirstTask })
	}

	stopSession(sessionId: string): void {
		this.#entries.get(sessionId)?.agent.stop()
	}

	/** Dispose agent and remove session */
	closeSession(sessionId: string): void {
		const entry = this.#entries.get(sessionId)
		if (!entry) return
		entry.agent.dispose()
		this.#entries.delete(sessionId)
		this.#emit()
	}

	getSession(sessionId: string): ChatSession | undefined {
		return this.#entries.get(sessionId)?.session
	}

	getSessions(): ChatSession[] {
		return Array.from(this.#entries.values()).map((e) => e.session)
	}

	/** Re-create all agents when config changes */
	reconfigure(config: ExtConfig): void {
		this.#config = config
		// Rebuild agents for idle/completed/error sessions; leave running ones
		for (const [id, entry] of this.#entries) {
			if (entry.session.status === 'running') continue
			entry.agent.dispose()
			const newAgent = buildAgent(config, entry.session.name, id)
			const newEntry: SessionEntry = {
				session: entry.session,
				agent: newAgent,
				loggedHistoryLen: entry.loggedHistoryLen,
			}
			this.#entries.set(id, newEntry)
			this.#bindAgent(newEntry)
		}
		this.#emit()
	}

	dispose(): void {
		for (const entry of this.#entries.values()) {
			entry.agent.dispose()
		}
		this.#entries.clear()
	}

	#emit(): void {
		this.dispatchEvent(new Event('change'))
	}

	async #persistSession(session: ChatSession): Promise<void> {
		if (session.tasks.length === 0 || session.history.length === 0) return
		const status = session.status === 'completed' ? 'completed' : 'error'
		await upsertSession({
			id: session.id,
			task: session.task,
			history: session.history,
			status,
			createdAt: session.createdAt,
		}).catch((err) => console.log('[SessionManager] Failed to persist session:', err))
	}
}
