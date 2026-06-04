import { BookOpen, ChevronRight, Edit2, Play, Plus, RotateCw, Trash2, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import * as TC from '@/trainer/TrainerClient'
import type { AutomationScript, TrainerScript, TrainingTask } from '@/trainer/types'
import { Trans } from '@/utils/Trans'

const TRAINER_URL = 'http://127.0.0.1:3002'

interface BridgeScriptParam {
	name: string
	label?: string
	type?: string
	required?: boolean
}

interface BridgeScript {
	id: string
	name: string
	category?: string
	description: string
	entryUrl?: string
	params: (string | BridgeScriptParam)[]
	publishable?: boolean
	createdAt: string
	updatedAt: string
}

function paramKey(p: string | BridgeScriptParam): string {
	return typeof p === 'string' ? p : p.name
}

function paramLabel(p: string | BridgeScriptParam): string {
	return typeof p === 'string' ? p : (p.label ?? p.name)
}

type ScriptRunStatus = 'idle' | 'running' | 'success' | 'failed'

interface TrainerPanelProps {
	onStartExploration: (taskId: string, userRequest: string) => void
	onRunScript: (script: AutomationScript) => void
	onRunTrainerScript: (script: TrainerScript) => void
	onBack: () => void
}

type View = 'list' | 'new' | 'detail' | 'scripts'
type DetailTab = 'ai-scripts' | 'scripts'

export function TrainerPanel({
	onStartExploration,
	onRunScript,
	onRunTrainerScript,
	onBack,
}: TrainerPanelProps) {
	const [view, setView] = useState<View>('list')
	const [online, setOnline] = useState<boolean | null>(null)
	const [tasks, setTasks] = useState<TrainingTask[]>([])
	const [selectedTask, setSelectedTask] = useState<TrainingTask | null>(null)
	const [scripts, setScripts] = useState<AutomationScript[]>([])
	const [aiScripts, setAiScripts] = useState<TrainerScript[]>([])
	const [detailTab, setDetailTab] = useState<DetailTab>('ai-scripts')
	const [generating, setGenerating] = useState(false)

	// Bridge scripts state
	const [bridgeScripts, setBridgeScripts] = useState<BridgeScript[]>([])
	const [scriptRunStatus, setScriptRunStatus] = useState<Record<string, ScriptRunStatus>>({})
	const [scriptErrors, setScriptErrors] = useState<Record<string, string>>({})
	const [scriptParams, setScriptParams] = useState<Record<string, Record<string, string>>>({})
	const [scriptLogs, setScriptLogs] = useState<Record<string, string[]>>({})

	// New / Edit task form
	const [editingTask, setEditingTask] = useState<TrainingTask | null>(null)
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [desc, setDesc] = useState('')
	const [saving, setSaving] = useState(false)

	const refresh = useCallback(async () => {
		const avail = await TC.isTrainerAvailable()
		setOnline(avail)
		if (avail) {
			const list = await TC.listTasks()
			setTasks(list ?? [])
		}
	}, [])

	const refreshBridgeScripts = useCallback(async () => {
		try {
			const res = await fetch(`${TRAINER_URL}/api/scripts`)
			if (res.ok) {
				const data = (await res.json()) as BridgeScript[]
				setBridgeScripts(data)
			}
		} catch {
			// server offline
		}
	}, [])

	const runBridgeScript = useCallback(
		async (scriptId: string, extraParams?: Record<string, string>) => {
			setScriptRunStatus((prev) => ({ ...prev, [scriptId]: 'running' }))
			setScriptErrors((prev) => {
				const next = { ...prev }
				delete next[scriptId]
				return next
			})
			setScriptLogs((prev) => ({ ...prev, [scriptId]: [] }))
			const params = { ...(scriptParams[scriptId] ?? {}), ...extraParams }
			try {
				const res = await fetch(`${TRAINER_URL}/api/scripts/${scriptId}/run`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ params }),
				})
				const data = (await res.json()) as {
					success: boolean
					error?: string
					logs?: string[]
				}
				setScriptLogs((prev) => ({ ...prev, [scriptId]: data.logs ?? [] }))
				if (data.success) {
					setScriptRunStatus((prev) => ({ ...prev, [scriptId]: 'success' }))
				} else {
					setScriptRunStatus((prev) => ({ ...prev, [scriptId]: 'failed' }))
					setScriptErrors((prev) => ({ ...prev, [scriptId]: data.error ?? 'Unknown error' }))
				}
			} catch (err) {
				setScriptRunStatus((prev) => ({ ...prev, [scriptId]: 'failed' }))
				setScriptErrors((prev) => ({
					...prev,
					[scriptId]: err instanceof Error ? err.message : String(err),
				}))
			}
		},
		[scriptParams]
	)

	const setParam = useCallback((scriptId: string, key: string, value: string) => {
		setScriptParams((prev) => ({
			...prev,
			[scriptId]: { ...(prev[scriptId] ?? {}), [key]: value },
		}))
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	useEffect(() => {
		if (view === 'scripts') {
			refreshBridgeScripts()
		}
	}, [view, refreshBridgeScripts])

	useEffect(() => {
		if (!selectedTask) return
		TC.listScripts(selectedTask.id).then((s) => setScripts(s ?? []))
		TC.listTrainerScripts(selectedTask.id).then((s) => setAiScripts(s ?? []))
	}, [selectedTask])

	// ── Form helpers ──────────────────────────────────────────────────────────

	const openNew = () => {
		setEditingTask(null)
		setName('')
		setUrl('')
		setDesc('')
		setView('new')
	}

	const openEdit = (task: TrainingTask) => {
		setEditingTask(task)
		setName(task.name)
		setUrl(task.url)
		setDesc(task.description)
		setView('new')
	}

	const handleSave = async () => {
		if (!name.trim() || !url.trim() || !desc.trim()) return
		setSaving(true)
		try {
			if (editingTask) {
				const updated = (await TC.updateTask(editingTask.id, {
					name: name.trim(),
					url: url.trim(),
					description: desc.trim(),
				})) as TrainingTask | null
				if (updated) {
					setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
					if (selectedTask?.id === updated.id) setSelectedTask(updated)
				}
			} else {
				const task = await TC.createTask(name.trim(), url.trim(), desc.trim())
				if (task) setTasks((prev) => [task, ...prev])
			}
			setName('')
			setUrl('')
			setDesc('')
			setEditingTask(null)
			setView('list')
		} finally {
			setSaving(false)
		}
	}

	// ── Script generation ─────────────────────────────────────────────────────

	const handleGenerate = async () => {
		if (!selectedTask) return
		setGenerating(true)
		try {
			const script = await TC.generateScript(selectedTask.id)
			if (script) setScripts((prev) => [script, ...prev])
		} finally {
			setGenerating(false)
		}
	}

	const goBack = () => {
		if (view === 'list') {
			onBack()
		} else {
			setView('list')
			setSelectedTask(null)
		}
	}

	const goToScripts = () => {
		setView('scripts')
	}

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<header className="flex items-center justify-between border-b px-3 py-2 shrink-0">
				<div className="flex items-center gap-2">
					<BookOpen className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium">{Trans.t('trainer')}</span>
					{online === false && (
						<span className="flex items-center gap-1 text-[10px] text-destructive">
							<WifiOff className="size-3" />
							{Trans.t('trainer_server_offline')}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					<Button variant="ghost" size="icon-sm" onClick={refresh} title="Refresh">
						<RotateCw className="size-3.5" />
					</Button>
					{view === 'list' && online && (
						<>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={openNew}
								title={Trans.t('trainer_new_task')}
							>
								<Plus className="size-3.5" />
							</Button>
							<Button
								variant={(view as string) === 'scripts' ? 'default' : 'ghost'}
								size="icon-sm"
								onClick={goToScripts}
								title={Trans.t('bridge_scripts')}
							>
								<Play className="size-3.5" />
							</Button>
						</>
					)}
					<Button variant="ghost" size="icon-sm" onClick={goBack}>
						<span className="text-xs">{Trans.t('trainer_back')}</span>
					</Button>
				</div>
			</header>

			{/* Body */}
			<div className="flex-1 overflow-y-auto p-3">
				{/* Offline notice */}
				{online === false && (
					<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
						<p className="font-medium text-destructive mb-1">{Trans.t('trainer_server_offline')}</p>
						<code className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
							{Trans.t('trainer_server_offline_hint')}
						</code>
					</div>
				)}

				{/* New / Edit task form */}
				{view === 'new' && (
					<div className="flex flex-col gap-3">
						<p className="text-xs font-medium text-muted-foreground">
							{editingTask ? Trans.t('trainer_edit_task') : Trans.t('trainer_new_task')}
						</p>
						<div className="flex flex-col gap-1.5">
							<label className="text-xs text-muted-foreground">
								{Trans.t('trainer_task_name')}
							</label>
							<Input
								className="text-xs h-8"
								placeholder={Trans.t('trainer_task_name_ph')}
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="text-xs text-muted-foreground">{Trans.t('trainer_task_url')}</label>
							<Input
								className="text-xs h-8"
								placeholder={Trans.t('trainer_task_url_ph')}
								value={url}
								onChange={(e) => setUrl(e.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label className="text-xs text-muted-foreground">
								{Trans.t('trainer_task_desc')}
							</label>
							<textarea
								className="text-xs rounded-md border border-input bg-background px-3 py-2 resize-y min-h-[72px]"
								placeholder={Trans.t('trainer_task_desc_ph')}
								value={desc}
								onChange={(e) => setDesc(e.target.value)}
							/>
						</div>
						<div className="flex gap-2">
							<Button
								variant="outline"
								className="flex-1 h-8 text-xs"
								onClick={() => setView('list')}
							>
								{Trans.t('cancel')}
							</Button>
							<Button
								className="flex-1 h-8 text-xs"
								onClick={handleSave}
								disabled={saving || !name || !url || !desc}
							>
								{saving ? Trans.t('loading') : Trans.t('save')}
							</Button>
						</div>
					</div>
				)}

				{/* Task list */}
				{view === 'list' && online !== false && (
					<div className="flex flex-col gap-2">
						{tasks.length === 0 && (
							<p className="text-xs text-muted-foreground text-center py-6">
								{Trans.t('trainer_no_tasks')}
							</p>
						)}
						{tasks.map((task) => (
							<div key={task.id} className="rounded-md border p-3 flex flex-col gap-2">
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<p className="text-xs font-medium truncate">{task.name}</p>
										<p className="text-[10px] text-muted-foreground truncate">{task.url}</p>
									</div>
									<div className="flex items-center gap-1 shrink-0">
										<span
											className={cn(
												'text-[10px] px-1.5 py-0.5 rounded-full',
												task.status === 'active'
													? 'bg-green-500/10 text-green-600'
													: 'bg-muted text-muted-foreground'
											)}
										>
											{Trans.t(`trainer_status_${task.status}` as any) || task.status}
										</span>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => openEdit(task)}
											title={Trans.t('trainer_edit_task')}
										>
											<Edit2 className="size-3" />
										</Button>
									</div>
								</div>
								<p className="text-[10px] text-muted-foreground line-clamp-2">{task.description}</p>
								<div className="flex gap-1.5">
									<Button
										variant="default"
										size="sm"
										className="h-7 text-[11px] flex-1 gap-1"
										onClick={() => onStartExploration(task.id, task.description)}
									>
										<Play className="size-3" />
										{Trans.t('trainer_start_explore')}
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="h-7 text-[11px] flex-1 gap-1"
										onClick={() => {
											setSelectedTask(task)
											setView('detail')
										}}
									>
										<ChevronRight className="size-3" />
										{Trans.t('trainer_scripts')}
									</Button>
								</div>
							</div>
						))}
					</div>
				)}

				{/* Bridge Scripts view */}
				{view === 'scripts' && (
					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<span className="text-xs font-medium">{Trans.t('bridge_scripts')}</span>
							<Button variant="ghost" size="icon-sm" onClick={refreshBridgeScripts} title="Refresh">
								<RotateCw className="size-3.5" />
							</Button>
						</div>

						{online === false && (
							<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
								{Trans.t('bridge_offline')}
							</div>
						)}

						{bridgeScripts.length === 0 && online !== false && (
							<p className="text-xs text-muted-foreground text-center py-6">
								{Trans.t('bridge_no_scripts')}
							</p>
						)}

						{/* Group scripts by category */}
						{(() => {
							const grouped: Record<string, BridgeScript[]> = {}
							for (const s of bridgeScripts) {
								const cat = s.category ?? ''
								;(grouped[cat] ??= []).push(s)
							}
							const categories = Object.keys(grouped).sort((a, b) =>
								a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)
							)
							return categories.map((cat) => (
								<div key={cat} className="flex flex-col gap-2">
									{cat && (
										<div className="flex items-center gap-2">
											<span className="text-[11px] font-semibold text-primary">{cat}</span>
											<div className="flex-1 h-px bg-border" />
										</div>
									)}
									{grouped[cat].map((script) => {
										const status = scriptRunStatus[script.id] ?? 'idle'
										const params = scriptParams[script.id] ?? {}
										const logs = scriptLogs[script.id] ?? []
										const inputParams = script.publishable
											? script.params.filter((p) => paramKey(p) !== 'dryRun')
											: script.params
										return (
											<div key={script.id} className="rounded-md border p-3 flex flex-col gap-2">
												<div>
													<p className="text-xs font-medium">{script.name}</p>
													{script.description && (
														<p className="text-[10px] text-muted-foreground">
															{script.description}
														</p>
													)}
													{script.entryUrl && (
														<p className="text-[10px] text-muted-foreground truncate mt-0.5">
															↳ {script.entryUrl}
														</p>
													)}
												</div>

												{/* Param inputs */}
												{inputParams.length > 0 && (
													<div className="flex flex-col gap-1.5">
														{inputParams.map((p) => {
															const k = paramKey(p)
															const isCheckbox = typeof p === 'object' && p.type === 'checkbox'
															const isTextarea = typeof p === 'object' && p.type === 'textarea'
															return (
																<div key={k} className="flex items-center gap-1.5">
																	<span className="text-[10px] text-muted-foreground w-16 shrink-0 truncate">
																		{paramLabel(p)}
																	</span>
																	{isCheckbox ? (
																		<input
																			type="checkbox"
																			checked={params[k] === 'true'}
																			onChange={(e) =>
																				setParam(script.id, k, e.target.checked ? 'true' : 'false')
																			}
																			className="w-4 h-4 cursor-pointer"
																		/>
																	) : isTextarea ? (
																		<textarea
																			className="text-[11px] flex-1 rounded-md border border-input bg-background px-2 py-1 resize-y min-h-[72px]"
																			placeholder={paramLabel(p)}
																			value={params[k] ?? ''}
																			onChange={(e) => setParam(script.id, k, e.target.value)}
																		/>
																	) : (
																		<Input
																			className="h-6 text-[11px] flex-1"
																			placeholder={paramLabel(p)}
																			value={params[k] ?? ''}
																			onChange={(e) => setParam(script.id, k, e.target.value)}
																		/>
																	)}
																</div>
															)
														})}
													</div>
												)}

												{/* Logs */}
												{logs.length > 0 && (
													<div className="rounded bg-muted/50 p-1.5 flex flex-col gap-0.5 max-h-28 overflow-y-auto">
														{logs.map((line, i) => (
															<p
																key={i}
																className="text-[10px] font-mono text-muted-foreground break-all"
															>
																{line}
															</p>
														))}
													</div>
												)}

												{scriptErrors[script.id] && (
													<p className="text-[10px] text-destructive break-all">
														✗ {scriptErrors[script.id]}
													</p>
												)}

												{/* Buttons */}
												{script.publishable ? (
													<div className="flex gap-1.5">
														<Button
															variant="outline"
															size="sm"
															className="h-7 text-[11px] gap-1 flex-1"
															disabled={status === 'running'}
															onClick={() => runBridgeScript(script.id, { dryRun: 'true' })}
														>
															<Play className="size-3" />
															{Trans.t('bridge_dry_run')}
														</Button>
														<Button
															variant={status === 'failed' ? 'destructive' : 'default'}
															size="sm"
															className="h-7 text-[11px] gap-1 flex-1"
															disabled={status === 'running'}
															onClick={() => {
																if (
																	window.confirm(
																		Trans.getLang() === 'zh' ? '确认真实发布？' : 'Really publish?'
																	)
																) {
																	runBridgeScript(script.id, { dryRun: 'false' })
																}
															}}
														>
															{Trans.t('bridge_publish')}
														</Button>
													</div>
												) : (
													<Button
														variant={
															status === 'success'
																? 'outline'
																: status === 'failed'
																	? 'destructive'
																	: 'default'
														}
														size="sm"
														className="h-7 text-[11px] gap-1 w-full"
														disabled={status === 'running'}
														onClick={() => runBridgeScript(script.id)}
													>
														<Play className="size-3" />
														{status === 'running'
															? Trans.t('bridge_running')
															: status === 'success'
																? Trans.t('bridge_success')
																: status === 'failed'
																	? Trans.t('bridge_failed')
																	: Trans.t('bridge_run')}
													</Button>
												)}
											</div>
										)
									})}
								</div>
							))
						})()}
					</div>
				)}

				{/* Task detail */}
				{view === 'detail' && selectedTask && (
					<div className="flex flex-col gap-3">
						<div className="rounded-md bg-muted/30 border p-2.5">
							<p className="text-xs font-medium">{selectedTask.name}</p>
							<p className="text-[10px] text-muted-foreground mt-0.5">{selectedTask.description}</p>
						</div>

						{/* Tabs */}
						<div className="flex border rounded-md overflow-hidden text-[11px]">
							<button
								className={cn(
									'flex-1 py-1.5 transition-colors',
									detailTab === 'ai-scripts'
										? 'bg-primary text-primary-foreground'
										: 'hover:bg-muted'
								)}
								onClick={() => setDetailTab('ai-scripts')}
							>
								{Trans.t('trainer_ai_scripts')} ({aiScripts.length})
							</button>
							<button
								className={cn(
									'flex-1 py-1.5 transition-colors',
									detailTab === 'scripts' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
								)}
								onClick={() => setDetailTab('scripts')}
							>
								{Trans.t('trainer_scripts')} ({scripts.length})
							</button>
						</div>

						{/* AI Scripts tab */}
						{detailTab === 'ai-scripts' && (
							<div className="flex flex-col gap-2">
								{aiScripts.length === 0 && (
									<p className="text-xs text-muted-foreground text-center py-4">
										{Trans.t('trainer_no_ai_scripts')}
									</p>
								)}
								{aiScripts.map((script) => (
									<div key={script.id} className="rounded-md border p-3 flex flex-col gap-2">
										<div>
											<p className="text-xs font-medium">{script.name}</p>
											<p className="text-[10px] text-muted-foreground">{script.description}</p>
											{script.params.length > 0 && (
												<p className="text-[10px] text-blue-500 mt-0.5">
													params: {script.params.map(paramKey).join(', ')}
												</p>
											)}
											{script.entryUrl && (
												<p className="text-[10px] text-muted-foreground truncate mt-0.5">
													↳ {script.entryUrl}
												</p>
											)}
										</div>
										<div className="flex gap-1.5">
											<Button
												variant="default"
												size="sm"
												className="h-7 text-[11px] gap-1 flex-1"
												onClick={() => onRunTrainerScript(script)}
											>
												<Play className="size-3" />
												{Trans.t('trainer_run_script')}
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												className="h-7 w-7 shrink-0"
												onClick={async () => {
													await TC.deleteTrainerScript(selectedTask.id, script.id)
													setAiScripts((prev) => prev.filter((s) => s.id !== script.id))
												}}
											>
												<Trash2 className="size-3 text-destructive" />
											</Button>
										</div>
									</div>
								))}
							</div>
						)}

						{/* Generated Scripts tab */}
						{detailTab === 'scripts' && (
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium">{Trans.t('trainer_scripts')}</span>
									<Button
										variant="outline"
										size="sm"
										className="h-7 text-[11px] gap-1"
										onClick={handleGenerate}
										disabled={generating}
									>
										{generating
											? Trans.t('trainer_generating')
											: Trans.t('trainer_generate_script')}
									</Button>
								</div>
								{scripts.length === 0 && (
									<p className="text-xs text-muted-foreground text-center py-4">
										{Trans.t('trainer_no_scripts')}
									</p>
								)}
								{scripts.map((script) => (
									<div key={script.id} className="rounded-md border p-3 flex flex-col gap-2">
										<div>
											<p className="text-xs font-medium">{script.name}</p>
											<p className="text-[10px] text-muted-foreground">
												{Trans.t('trainer_steps').replace('{{n}}', String(script.steps.length))}
												{' · '}
												{new Date(script.createdAt).toLocaleDateString()}
											</p>
										</div>
										<Button
											variant="default"
											size="sm"
											className="h-7 text-[11px] gap-1 w-full"
											onClick={() => onRunScript(script)}
										>
											<Play className="size-3" />
											{Trans.t('trainer_run_script')}
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}
