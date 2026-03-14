import type { ChatSession } from '@/agent/SessionManager'
import type { AgentStatus } from '@page-agent/core'
import { Plus, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Trans } from '@/utils/Trans'

function SessionDot({ status }: { status: AgentStatus }) {
	const cls = {
		idle: 'bg-muted-foreground/50',
		running: 'bg-blue-500 animate-pulse',
		completed: 'bg-green-500',
		error: 'bg-destructive',
	}[status]
	return <span className={cn('size-1.5 rounded-full shrink-0', cls)} />
}

interface SessionTabsProps {
	sessions: ChatSession[]
	activeId: string | null
	onSelect: (id: string) => void
	onClose: (id: string) => void
	onCreate: () => void
}

export function SessionTabs({ sessions, activeId, onSelect, onClose, onCreate }: SessionTabsProps) {
	return (
		<div className="flex items-center gap-0.5 px-2 py-1 border-b overflow-x-auto scrollbar-none">
			{sessions.map((session) => {
				const isActive = session.id === activeId
				return (
					<div
						key={session.id}
						className={cn(
							'group flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer shrink-0 max-w-[120px] transition-colors',
							isActive
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
						)}
						role="tab"
						aria-selected={isActive}
						tabIndex={0}
						onClick={() => onSelect(session.id)}
						onKeyDown={(e) => e.key === 'Enter' && onSelect(session.id)}
					>
						<SessionDot status={session.status} />
						<span className="truncate">
							{session.task ? session.task.slice(0, 16) : session.name}
						</span>
						<button
							type="button"
							className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
							onClick={(e) => { e.stopPropagation(); onClose(session.id) }}
						>
							<X className="size-2.5" />
						</button>
					</div>
				)
			})}
			<button
				type="button"
				onClick={onCreate}
				title={Trans.t('new_session_title')}
				className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer whitespace-nowrap"
			>
				<Plus className="size-3 shrink-0" />
				{Trans.t('new_session')}
			</button>
		</div>
	)
}
