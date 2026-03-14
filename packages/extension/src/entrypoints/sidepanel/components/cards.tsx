import type {
	AgentActivity,
	AgentErrorEvent,
	AgentStepEvent,
	HistoricalEvent,
	ObservationEvent,
	RetryEvent,
} from '@page-agent/core'
import {
	CheckCircle,
	ChevronDown,
	Eye,
	Globe,
	Keyboard,
	Layers,
	Mouse,
	MoveVertical,
	RefreshCw,
	Sparkles,
	Workflow,
	XCircle,
	Zap,
} from 'lucide-react'
import { Fragment, useState } from 'react'

import { cn } from '@/lib/utils'

// ─── Task text (expandable + copyable) ───────────────────────────────────────

export function TaskText({ task }: { task: string }) {
	const [expanded, setExpanded] = useState(false)
	const [copied, setCopied] = useState(false)
	const LIMIT = 200
	const isLong = task.length > LIMIT
	const displayed = expanded || !isLong ? task : task.slice(0, LIMIT)

	const handleCopy = () => {
		navigator.clipboard.writeText(task)
		setCopied(true)
		setTimeout(() => setCopied(false), 1500)
	}

	return (
		<div>
			<div className="flex items-start justify-between gap-2">
				<p className="text-xs font-medium whitespace-pre-wrap break-words flex-1">
					{displayed}
					{isLong && !expanded && (
						<span className="text-muted-foreground">…</span>
					)}
				</p>
				<button
					type="button"
					onClick={handleCopy}
					className="shrink-0 text-[9px] text-muted-foreground hover:text-foreground border rounded px-1 py-px cursor-pointer transition-colors"
				>
					{copied ? '已复制' : '复制'}
				</button>
			</div>
			{isLong && (
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="mt-0.5 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
				>
					{expanded ? '收起' : `展开全部 (${task.length} 字符)`}
				</button>
			)}
		</div>
	)
}

// ─── Result Card ────────────────────────────────────────────────────────────

function ResultCard({
	success,
	text,
	children,
}: {
	success: boolean
	text: string
	children?: React.ReactNode
}) {
	return (
		<div
			className={cn(
				'rounded-lg border p-3',
				success ? 'border-green-500/30 bg-green-500/10' : 'border-destructive/30 bg-destructive/10'
			)}
		>
			<div className="flex items-center gap-2 mb-2">
				{success ? (
					<CheckCircle className="size-3.5 text-green-500" />
				) : (
					<XCircle className="size-3.5 text-destructive" />
				)}
				<span
					className={cn(
						'text-xs font-medium',
						success ? 'text-green-600 dark:text-green-400' : 'text-destructive'
					)}
				>
					Result: {success ? 'Success' : 'Failed'}
				</span>
			</div>
			<p className="text-xs text-[11px] text-muted-foreground pl-5 whitespace-pre-wrap">{text}</p>
			{children}
		</div>
	)
}

// ─── Reflection ──────────────────────────────────────────────────────────────

function ReflectionItem({ icon, value }: { icon: string; value: string }) {
	const [expanded, setExpanded] = useState(false)

	return (
		<Fragment>
			<span className="text-xs flex justify-center">{icon}</span>
			<span
				className={cn(
					'text-[11px] text-muted-foreground cursor-pointer hover:text-muted-foreground/70',
					!expanded && 'line-clamp-1'
				)}
				onClick={() => setExpanded(!expanded)}
			>
				{value}
			</span>
		</Fragment>
	)
}

function ReflectionSection({
	reflection,
}: {
	reflection: {
		evaluation_previous_goal?: string
		memory?: string
		next_goal?: string
	}
}) {
	const items = [
		{ icon: '☑️', label: 'eval', value: reflection.evaluation_previous_goal },
		{ icon: '🧠', label: 'memory', value: reflection.memory },
		{ icon: '🎯', label: 'goal', value: reflection.next_goal },
	].filter((item) => item.value)

	if (items.length === 0) return null

	return (
		<div className="mb-2.5 p-2 rounded bg-muted/60 border border-border/50">
			<div className="grid grid-cols-[14px_1fr] gap-x-2 gap-y-1.5">
				{items.map((item) => (
					<ReflectionItem key={item.label} icon={item.icon} value={item.value!} />
				))}
			</div>
		</div>
	)
}

// ─── Page State (element index list) ─────────────────────────────────────────

interface ParsedElement {
	index: number
	tag: string
	raw: string
}

function extractUserMessageText(rawRequest: unknown): string | null {
	const messages = (rawRequest as { messages?: { role: string; content?: unknown }[] })?.messages
	if (!messages) return null
	const lastUser = [...messages].reverse().find((m) => m.role === 'user')
	if (!lastUser?.content) return null
	if (typeof lastUser.content === 'string') return lastUser.content
	if (Array.isArray(lastUser.content)) {
		const block = (lastUser.content as { type: string; text?: string }[]).find(
			(c) => c.type === 'text'
		)
		return block?.text ?? null
	}
	return null
}

function parsePageElements(content: string): ParsedElement[] {
	const elements: ParsedElement[] = []
	for (const line of content.split('\n')) {
		const match = line.match(/^\[(\d+)\](.+)$/)
		if (match) {
			const tagMatch = match[2].match(/^<(\w+)/)
			elements.push({
				index: parseInt(match[1]),
				tag: tagMatch?.[1] ?? 'element',
				raw: match[2],
			})
		}
	}
	return elements
}

function extractPageMeta(content: string): { title: string; url: string } | null {
	const match = content.match(/Current Page:\s*\[([^\]]*)\]\(([^)]+)\)/)
	if (!match) return null
	return { title: match[1], url: match[2] }
}

/** Tag → short label for display */
function tagLabel(tag: string): string {
	const map: Record<string, string> = {
		a: 'link',
		button: 'btn',
		input: 'input',
		select: 'select',
		textarea: 'textarea',
		option: 'option',
		label: 'label',
		div: 'div',
		span: 'span',
		li: 'li',
	}
	return map[tag.toLowerCase()] ?? tag
}

/** Extract inner text or key attribute from raw element string */
function elementSummary(raw: string): string {
	// inner text
	const textMatch = raw.match(/>([^<]+)</)
	if (textMatch?.[1]?.trim()) return textMatch[1].trim()
	// placeholder / aria-label / value / name
	const attrMatch = raw.match(/(?:placeholder|aria-label|value|name)="([^"]+)"/)
	if (attrMatch?.[1]) return attrMatch[1]
	// href for links
	const hrefMatch = raw.match(/href="([^"]+)"/)
	if (hrefMatch?.[1]) return hrefMatch[1]
	return ''
}

function PageStateSection({ rawRequest }: { rawRequest?: unknown }) {
	const [expanded, setExpanded] = useState(false)

	if (!rawRequest) return null
	const content = extractUserMessageText(rawRequest)
	if (!content) return null
	const elements = parsePageElements(content)
	if (elements.length === 0) return null
	const meta = extractPageMeta(content)

	return (
		<div className="mb-2.5 rounded border border-dashed border-border/70">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center justify-between w-full px-2 py-1.5 text-left"
			>
				<div className="flex items-center gap-1.5">
					<Layers className="size-3 text-muted-foreground" />
					<span className="text-[11px] font-semibold text-foreground/80">
						页面元素
					</span>
					<span className="text-[10px] text-muted-foreground bg-muted rounded px-1">
						{elements.length} 个
					</span>
				</div>
				<ChevronDown
					className={cn(
						'size-3 text-muted-foreground transition-transform duration-150',
						expanded && 'rotate-180'
					)}
				/>
			</button>

			{expanded && (
				<div className="px-2 pb-2">
					{meta && (
						<div className="text-[10px] text-muted-foreground mb-1.5 flex items-center gap-1 truncate">
							<Globe className="size-2.5 shrink-0" />
							<span className="truncate">{meta.title || meta.url}</span>
						</div>
					)}
					<div className="space-y-0.5 max-h-64 overflow-y-auto pr-0.5">
						{elements.map((el) => {
							const summary = elementSummary(el.raw)
							return (
								<div
									key={el.index}
									className="flex items-start gap-1.5 text-[10px] leading-relaxed"
								>
									{/* index badge */}
									<span className="shrink-0 font-mono bg-blue-500/15 text-blue-400 rounded px-1 py-px min-w-[28px] text-center">
										{el.index}
									</span>
									{/* tag badge */}
									<span className="shrink-0 font-mono text-[9px] bg-muted text-muted-foreground rounded px-1 py-px">
										{tagLabel(el.tag)}
									</span>
									{/* summary text */}
									{summary && (
										<span className="text-foreground/70 truncate leading-relaxed">
											{summary}
										</span>
									)}
									{/* raw (if no summary) */}
									{!summary && (
										<code className="text-muted-foreground/60 truncate">{el.raw}</code>
									)}
								</div>
							)
						})}
					</div>
				</div>
			)}
		</div>
	)
}

// ─── Action icon ─────────────────────────────────────────────────────────────

function ActionIcon({ name, className }: { name: string; className?: string }) {
	const icons: Record<string, React.ReactNode> = {
		click_element_by_index: <Mouse className={className} />,
		click_blank_area: <Mouse className={className} />,
		input: <Keyboard className={className} />,
		scroll: <MoveVertical className={className} />,
		go_to_url: <Globe className={className} />,
	}
	return icons[name] || <Zap className={className} />
}

// ─── Action input formatting ──────────────────────────────────────────────────

function ActionParams({ name, input }: { name: string; input: unknown }) {
	const data = input as Record<string, unknown>

	if (name === 'click_element_by_index') {
		return (
			<div className="flex items-center gap-1.5 flex-wrap">
				<span className="text-[10px] text-muted-foreground">点击元素</span>
				<span className="font-mono text-[11px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-px">
					[{String(data.index)}]
				</span>
			</div>
		)
	}

	if (name === 'input') {
		return (
			<div className="flex items-start gap-1.5 flex-wrap">
				<span className="text-[10px] text-muted-foreground shrink-0">输入到元素</span>
				<span className="font-mono text-[11px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-px">
					[{String(data.index)}]
				</span>
				<span className="text-[10px] text-muted-foreground shrink-0">：</span>
				<span className="font-mono text-[11px] bg-green-500/10 text-green-400 rounded px-1.5 py-px max-w-full break-all">
					"{String(data.text)}"
				</span>
			</div>
		)
	}

	if (name === 'scroll') {
		const dir = data.down ? '↓ 向下' : '↑ 向上'
		const amount = data.pixels
			? `${data.pixels}px`
			: data.numPages
				? `${data.numPages} 页`
				: ''
		const target =
			data.index !== undefined ? (
				<span className="font-mono text-[11px] bg-blue-500/15 text-blue-400 rounded px-1.5 py-px ml-1">
					元素 [{String(data.index)}]
				</span>
			) : null
		return (
			<div className="flex items-center gap-1.5 flex-wrap">
				<span className="text-[10px] text-muted-foreground">
					{dir} {amount}
				</span>
				{target}
			</div>
		)
	}

	if (name === 'scroll_horizontally') {
		const dir = data.right ? '→ 向右' : '← 向左'
		return (
			<div className="text-[10px] text-muted-foreground">
				{dir} {data.pixels ? `${data.pixels}px` : ''}
			</div>
		)
	}

	if (name === 'go_to_url') {
		return (
			<div className="text-[11px] text-blue-400 break-all font-mono">
				{String(data.url)}
			</div>
		)
	}

	if (name === 'click_blank_area') {
		return (
			<div className="text-[10px] text-muted-foreground">
				selector: <code className="font-mono">{String(data.selector ?? '')}</code>
			</div>
		)
	}

	if (name === 'execute_javascript') {
		return (
			<pre className="text-[10px] text-muted-foreground bg-muted rounded p-1.5 max-h-20 overflow-y-auto break-all whitespace-pre-wrap">
				{String(data.script ?? data.code ?? JSON.stringify(data))}
			</pre>
		)
	}

	if (name === 'done') {
		return null
	}

	// fallback: key=value pairs
	const entries = Object.entries(data)
	if (entries.length === 0) return null
	return (
		<div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
			{entries.map(([k, v]) => (
				<Fragment key={k}>
					<span className="text-[10px] text-muted-foreground/60 font-mono">{k}</span>
					<span className="text-[10px] text-foreground/70 break-all">
						{typeof v === 'string' ? v : JSON.stringify(v)}
					</span>
				</Fragment>
			))}
		</div>
	)
}

// ─── Single action block ──────────────────────────────────────────────────────

function ActionBlock({
	action,
}: {
	action: { name: string; input: unknown; output: string; subHistory?: HistoricalEvent[] }
}) {
	const [outputExpanded, setOutputExpanded] = useState(false)
	const [subtaskExpanded, setSubtaskExpanded] = useState(false)
	const outputStr = action.output != null ? String(action.output) : ''
	const isSuccess = outputStr.startsWith('✅')
	const isFail = outputStr.startsWith('❌')

	return (
		<div className="rounded border bg-background/60 overflow-hidden">
			{/* Action header */}
			<div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/40">
				<ActionIcon name={action.name} className="size-3 text-blue-400 shrink-0" />
				<span className="text-[11px] font-mono font-medium text-foreground/90">
					{action.name}
				</span>
			</div>

			{/* Params */}
			<div className="px-2 py-1.5">
				<ActionParams name={action.name} input={action.input} />
			</div>

			{/* Output */}
			{outputStr && (
				<div
					className={cn(
						'px-2 py-1.5 border-t border-border/40 cursor-pointer',
						isSuccess && 'bg-green-500/5',
						isFail && 'bg-destructive/5'
					)}
					onClick={() => setOutputExpanded(!outputExpanded)}
				>
					<p
						className={cn(
							'text-[10px] leading-relaxed',
							isSuccess
								? 'text-green-600 dark:text-green-400'
								: isFail
									? 'text-destructive'
									: 'text-muted-foreground',
							!outputExpanded && 'line-clamp-2'
						)}
					>
						{outputStr}
					</p>
				</div>
			)}

			{/* Subtask detail (only for run_subtask with captured history) */}
			{action.name === 'run_subtask' && action.subHistory && action.subHistory.length > 0 && (
				<div className="border-t border-border/40">
					<button
						type="button"
						onClick={() => setSubtaskExpanded(!subtaskExpanded)}
						className="flex items-center justify-between w-full px-2 py-1.5 text-left hover:bg-muted/30 transition-colors"
					>
						<div className="flex items-center gap-1.5">
							<Workflow className="size-3 text-purple-400 shrink-0" />
							<span className="text-[10px] text-purple-400 font-medium">子任务详情</span>
							<span className="text-[9px] text-muted-foreground bg-muted rounded px-1">
								{action.subHistory.filter((e) => e.type === 'step').length} 步
							</span>
						</div>
						<ChevronDown
							className={cn(
								'size-3 text-muted-foreground transition-transform duration-150',
								subtaskExpanded && 'rotate-180'
							)}
						/>
					</button>
					{subtaskExpanded && (
						<div className="px-2 pb-2 space-y-1.5 border-t border-dashed border-border/40 pt-1.5">
							{action.subHistory.map((event, i) => (
								// eslint-disable-next-line react-x/no-array-index-key
								<EventCard key={i} event={event} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}

// ─── Actions section ──────────────────────────────────────────────────────────

function ActionsSection({
	actions,
}: {
	actions: { name: string; input: unknown; output: string; subHistory?: HistoricalEvent[] }[]
}) {
	if (!actions || actions.length === 0) return null

	// Filter out 'done' — rendered separately as ResultCard
	const visible = actions.filter((a) => a.name !== 'done')
	if (visible.length === 0) return null

	return (
		<div className="mb-2">
			<div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
				Actions
			</div>
			<div className="flex flex-col gap-1.5">
				{visible.map((action, i) => (
					<ActionBlock key={i} action={action} />
				))}
			</div>
		</div>
	)
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false)

	return (
		<button
			type="button"
			onClick={() => {
				navigator.clipboard.writeText(text)
				setCopied(true)
				setTimeout(() => setCopied(false), 1500)
			}}
			className="text-[9px] text-muted-foreground hover:text-foreground transition-colors border px-1 rounded shrink-0 cursor-pointer backdrop-blur-xs"
		>
			{copied ? 'Copied!' : label}
		</button>
	)
}

// ─── Raw request/response (debug) ─────────────────────────────────────────────

function extractPrompt(rawRequest: unknown, role: 'system' | 'user'): string | null {
	const messages = (rawRequest as { messages?: { role: string; content?: unknown }[] })?.messages
	if (!messages) return null
	const msg =
		role === 'system'
			? messages.find((m) => m.role === role)
			: messages.findLast((m) => m.role === role)
	if (!msg?.content) return null
	return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)
}

function RawSection({ rawRequest, rawResponse }: { rawRequest?: unknown; rawResponse?: unknown }) {
	const [activeTab, setActiveTab] = useState<'request' | 'response' | null>(null)

	if (!rawRequest && !rawResponse) return null

	const handleTabClick = (tab: 'request' | 'response') => {
		setActiveTab(activeTab === tab ? null : tab)
	}

	const content =
		activeTab === 'request' ? rawRequest : activeTab === 'response' ? rawResponse : null

	const systemPrompt = activeTab === 'request' ? extractPrompt(rawRequest, 'system') : null
	const userPrompt = activeTab === 'request' ? extractPrompt(rawRequest, 'user') : null

	return (
		<div className="mt-2 border-t border-dashed pt-2">
			<div className="flex items-center gap-3 -my-1">
				{rawRequest != null && (
					<button
						type="button"
						onClick={() => handleTabClick('request')}
						className={cn(
							'text-[10px] mt-0.5 transition-colors border-b cursor-pointer',
							activeTab === 'request'
								? 'text-foreground border-foreground'
								: 'text-muted-foreground border-transparent hover:text-foreground'
						)}
					>
						Raw Request
					</button>
				)}
				{rawResponse != null && (
					<button
						type="button"
						onClick={() => handleTabClick('response')}
						className={cn(
							'text-[10px] mt-0.5 transition-colors border-b cursor-pointer',
							activeTab === 'response'
								? 'text-foreground border-foreground'
								: 'text-muted-foreground border-transparent hover:text-foreground'
						)}
					>
						Raw Response
					</button>
				)}
			</div>
			{content != null && (
				<div className="relative mt-1.5">
					<div className="absolute top-1 right-1 flex gap-1">
						{systemPrompt && <CopyButton text={systemPrompt} label="Copy System" />}
						{userPrompt && <CopyButton text={userPrompt} label="Copy User" />}
						<CopyButton text={JSON.stringify(content, null, 4)} label="Copy" />
					</div>
					<pre className="p-2 pt-5 text-[10px] text-foreground/70 bg-muted rounded overflow-x-auto max-h-60 overflow-y-auto">
						{JSON.stringify(content, null, 4)}
					</pre>
				</div>
			)}
		</div>
	)
}

// ─── Step card ────────────────────────────────────────────────────────────────

function StepCard({ event }: { event: AgentStepEvent }) {
	return (
		<div className="rounded-lg border-l-2 border-l-blue-500/50 border bg-muted/40 p-2.5">
			{/* Header */}
			<div className="flex items-center justify-between mb-2">
				<span className="text-[11px] font-semibold text-foreground tracking-wide">
					Step #{event.stepIndex! + 1}
				</span>
				{event.usage && (
					<span className="text-[9px] text-muted-foreground/60 font-mono">
						{event.usage.totalTokens.toLocaleString()} tokens
					</span>
				)}
			</div>

			{/* Reflection */}
			{event.reflection && <ReflectionSection reflection={event.reflection} />}

			{/* Page element index list */}
			<PageStateSection rawRequest={event.rawRequest} />

			{/* Actions */}
			<ActionsSection actions={event.actions} />

			{/* Raw debug */}
			<RawSection rawRequest={event.rawRequest} rawResponse={event.rawResponse} />
		</div>
	)
}

// ─── Other event cards ────────────────────────────────────────────────────────

function ObservationCard({ event }: { event: ObservationEvent }) {
	return (
		<div className="rounded-lg border-l-2 border-l-green-500/50 border bg-muted/40 p-2.5">
			<div className="flex items-start gap-2">
				<Eye className="size-3.5 text-green-500 shrink-0 mt-0.5" />
				<span className="text-[11px] text-muted-foreground">{event.content}</span>
			</div>
		</div>
	)
}

function RetryCard({ event }: { event: RetryEvent }) {
	return (
		<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
			<div className="flex items-start gap-1.5">
				<RefreshCw className="size-3 text-amber-500 shrink-0 mt-0.5" />
				<span className="text-xs text-amber-600 dark:text-amber-400">
					{event.message} ({event.attempt}/{event.maxAttempts})
				</span>
			</div>
		</div>
	)
}

function ErrorCard({ event }: { event: AgentErrorEvent }) {
	// Extract a human-readable detail string from the raw error body
	const raw = event.rawResponse as
		| { error?: { message?: string; code?: string; type?: string }; message?: string }
		| undefined

	const detail =
		raw?.error?.message || raw?.message || null

	const code = raw?.error?.code || raw?.error?.type || null

	// Remaining fields to show as key/value (excluding already-shown ones)
	const extra = raw?.error
		? Object.entries(raw.error).filter(([k]) => !['message', 'code', 'type'].includes(k))
		: []

	return (
		<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5">
			{/* Main error message */}
			<div className="flex items-start gap-1.5 mb-2">
				<XCircle className="size-3 text-destructive shrink-0 mt-0.5" />
				<span className="text-xs text-destructive font-medium">{event.message}</span>
			</div>

			{/* Provider error detail */}
			{detail && (
				<div className="ml-4.5 mb-1.5 p-2 rounded bg-destructive/10 border border-destructive/20">
					<p className="text-[11px] text-destructive/90 whitespace-pre-wrap break-words">
						{detail}
					</p>
				</div>
			)}

			{/* Error code / type */}
			{code && (
				<div className="ml-4.5 mb-1.5">
					<span className="text-[10px] font-mono bg-destructive/15 text-destructive rounded px-1.5 py-px">
						{code}
					</span>
				</div>
			)}

			{/* Extra fields */}
			{extra.length > 0 && (
				<div className="ml-4.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
					{extra.map(([k, v]) => (
						<Fragment key={k}>
							<span className="text-[10px] text-destructive/50 font-mono">{k}</span>
							<span className="text-[10px] text-destructive/70 break-all">
								{typeof v === 'string' ? v : JSON.stringify(v)}
							</span>
						</Fragment>
					))}
				</div>
			)}

			{/* Raw fallback for unknown shapes */}
			{!detail && event.rawResponse && (
				<div className="ml-4.5">
					<pre className="text-[10px] text-destructive/70 bg-destructive/10 rounded p-1.5 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
						{JSON.stringify(event.rawResponse, null, 2)}
					</pre>
				</div>
			)}
		</div>
	)
}

// ─── Public exports ───────────────────────────────────────────────────────────

export function EventCard({ event }: { event: HistoricalEvent }) {
	if (event.type === 'step') {
		const doneAction = (event as AgentStepEvent).actions?.find((a) => a.name === 'done')
		if (doneAction) {
			const input = doneAction.input as { text?: string; success?: boolean }
			return (
				<>
					<StepCard event={event as AgentStepEvent} />
					<ResultCard
						success={input?.success ?? true}
						text={input?.text || doneAction.output || ''}
					/>
				</>
			)
		}
		return <StepCard event={event as AgentStepEvent} />
	}

	if (event.type === 'observation') return <ObservationCard event={event as ObservationEvent} />
	if (event.type === 'retry') return <RetryCard event={event as RetryEvent} />
	if (event.type === 'error') return <ErrorCard event={event as AgentErrorEvent} />

	return null
}

export function ActivityCard({ activity }: { activity: AgentActivity }) {
	const getActivityInfo = () => {
		switch (activity.type) {
			case 'thinking':
				return { text: 'Thinking...', color: 'text-blue-500' }
			case 'executing':
				return { text: `Executing ${activity.tool}...`, color: 'text-amber-500' }
			case 'executed':
				return { text: `Done: ${activity.tool}`, color: 'text-green-500' }
			case 'retrying':
				return {
					text: `Retrying (${activity.attempt}/${activity.maxAttempts})...`,
					color: 'text-amber-500',
				}
			case 'error':
				return { text: activity.message, color: 'text-destructive' }
		}
	}

	const info = getActivityInfo()

	return (
		<div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5 animate-pulse">
			<div className="relative">
				<Sparkles className={cn('size-3.5', info.color)} />
				<span
					className={cn(
						'absolute -top-0.5 -right-0.5 size-1.5 rounded-full animate-ping',
						activity.type === 'thinking'
							? 'bg-blue-500'
							: activity.type === 'executing'
								? 'bg-amber-500'
								: activity.type === 'retrying'
									? 'bg-amber-500'
									: activity.type === 'error'
										? 'bg-destructive'
										: 'bg-green-500'
					)}
				/>
			</div>
			<span className={cn('text-xs', info.color)}>{info.text}</span>
		</div>
	)
}
