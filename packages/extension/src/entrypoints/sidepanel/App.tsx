import { Download, History, Send, Settings, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from '@/components/ui/input-group'

import { downloadAgentLogs } from '@/lib/downloadLogs'
import { hasStartupErrors, onStartupError } from '@/lib/startupLog'
import { useSessionManager } from '../../agent/useSessionManager'
import { Trans } from '../../utils/Trans'
import { ConfigPanel } from './components/ConfigPanel'
import { HistoryDetail } from './components/HistoryDetail'
import { HistoryList } from './components/HistoryList'
import { MultiSessionNotice } from './components/MultiSessionNotice'
import { SessionTabs } from './components/SessionTabs'
import { ActivityCard, EventCard, TaskText } from './components/cards'
import { EmptyState, Logo, MotionOverlay, StatusDot } from './components/misc'

type View =
	| { name: 'chat' }
	| { name: 'config' }
	| { name: 'history' }
	| { name: 'history-detail'; sessionId: string }

export default function App() {
	const [view, setView] = useState<View>({ name: 'chat' })
	const [inputValue, setInputValue] = useState('')
	const historyRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const [taskExpanded, setTaskExpanded] = useState(false)

	const {
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
	} = useSessionManager()

	const hasInitErrors = useSyncExternalStore(onStartupError, hasStartupErrors)

	// Re-render when language changes
	const [, setLangTick] = useState(0)
	useEffect(() => Trans.subscribe(() => setLangTick((t) => t + 1)), [])

	const status = activeSession?.status ?? 'idle'
	const history = activeSession?.history ?? []
	const activity = activeSession?.activity ?? null
	const currentTask = activeSession?.task ?? ''

	// Auto-scroll to bottom on new events
	useEffect(() => {
		if (historyRef.current) {
			historyRef.current.scrollTop = historyRef.current.scrollHeight
		}
	}, [history, activity])

	const handleSubmit = useCallback(
		(e?: React.SyntheticEvent) => {
			e?.preventDefault()
			if (!inputValue.trim() || status === 'running') return

			const taskToExecute = inputValue.trim()
			setInputValue('')

			execute(taskToExecute).catch((error) => {
				console.log('[SidePanel] Failed to execute task:', error)
			})
		},
		[inputValue, status, execute]
	)

	const handleStop = useCallback(() => {
		console.log('[SidePanel] Stopping task...')
		stop()
	}, [stop])

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault()
			handleSubmit()
		}
	}

	// --- View routing ---

	if (view.name === 'config') {
		return (
			<ConfigPanel
				config={config}
				onSave={async (newConfig) => {
					await configure(newConfig)
					setView({ name: 'chat' })
				}}
				onClose={() => setView({ name: 'chat' })}
			/>
		)
	}

	if (view.name === 'history') {
		return (
			<HistoryList
				onSelect={(id) => setView({ name: 'history-detail', sessionId: id })}
				onBack={() => setView({ name: 'chat' })}
			/>
		)
	}

	if (view.name === 'history-detail') {
		return <HistoryDetail sessionId={view.sessionId} onBack={() => setView({ name: 'history' })} />
	}

	// --- Chat view ---

	const isRunning = status === 'running'
	const showEmptyState = !currentTask && history.length === 0 && !isRunning

	return (
		<div className="relative flex flex-col h-screen bg-background">
			<MotionOverlay active={isRunning} />
			{/* Header */}
			<header className="flex items-center justify-between border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<Logo className="size-5" />
					<span className="text-sm font-medium">OpenFill</span>
				</div>
				<div className="flex items-center gap-1">
					<StatusDot status={status} />
					<button
						type="button"
						onClick={() => config && configure({ ...config, language: config.language === 'zh-CN' ? 'en-US' : 'zh-CN' })}
						className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1 font-medium"
						title={Trans.t('language')}
					>
						{config?.language === 'zh-CN' ? 'EN' : '中'}
					</button>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setView({ name: 'history' })}
						className="cursor-pointer"
					>
						<History className="size-3.5" />
					</Button>
					{config?.showDownloadLogs && (history.length > 0 || hasInitErrors) && (
						<Button
							variant="ghost"
							size="icon-sm"
							title={Trans.t('download_logs')}
							onClick={() => downloadAgentLogs(currentTask, history)}
							className="cursor-pointer"
						>
							<Download className="size-3.5" />
						</Button>
					)}
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => setView({ name: 'config' })}
						className="cursor-pointer"
					>
						<Settings className="size-3.5" />
					</Button>
				</div>
			</header>

			{/* Session Tabs */}
			<SessionTabs
				sessions={sessions}
				activeId={activeSessionId}
				onSelect={setActiveSessionId}
				onClose={closeSession}
				onCreate={createSession}
			/>

			{/* One-time multi-session notice */}
			<MultiSessionNotice />

			{/* Content */}
			<main className="flex-1 overflow-hidden flex flex-col">
				{/* Current task (first task of session) */}
				{currentTask && (
					<div
						className="border-b px-3 py-2 bg-muted/30 cursor-pointer select-none"
						onClick={() => setTaskExpanded((v) => !v)}
					>
						<div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
							{Trans.t('task')}
						</div>
						{taskExpanded ? (
							<TaskText task={currentTask} />
						) : (
							<p className="text-xs text-foreground truncate">{currentTask}</p>
						)}
					</div>
				)}

				{/* History */}
				<div ref={historyRef} className="flex-1 overflow-y-auto p-3 space-y-2">
					{showEmptyState && <EmptyState />}

					{history.map((event, index) => (
						// eslint-disable-next-line react-x/no-array-index-key
						<EventCard key={index} event={event} />
					))}

					{/* Activity indicator at bottom */}
					{activity && <ActivityCard activity={activity} />}
				</div>
			</main>

			{/* Input */}
			<footer className="border-t p-3">
				<InputGroup className="relative rounded-lg">
					<InputGroupTextarea
						ref={textareaRef}
						placeholder={Trans.t('task_placeholder')}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						disabled={isRunning}
						className="text-xs pr-12 min-h-10"
					/>
					<InputGroupAddon align="inline-end" className="absolute bottom-0 right-0">
						{isRunning ? (
							<InputGroupButton
								size="icon-sm"
								variant="destructive"
								onClick={handleStop}
								className="size-7"
							>
								<Square className="size-3" />
							</InputGroupButton>
						) : (
							<InputGroupButton
								size="icon-sm"
								variant="default"
								onClick={() => handleSubmit()}
								disabled={!inputValue.trim()}
								className="size-7 cursor-pointer"
							>
								<Send className="size-3" />
							</InputGroupButton>
						)}
					</InputGroupAddon>
				</InputGroup>
			</footer>
		</div>
	)
}
