import { Trans } from '@/utils/Trans'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

const NOTICED_KEY = 'page-agent:multi-session-noticed'

function hasBeenNoticed(): boolean {
	try { return localStorage.getItem(NOTICED_KEY) === '1' } catch { return true }
}

function markNoticed(): void {
	try { localStorage.setItem(NOTICED_KEY, '1') } catch { /* ignore */ }
}

export function MultiSessionNotice() {
	const [visible, setVisible] = useState(false)

	useEffect(() => {
		if (!hasBeenNoticed()) setVisible(true)
	}, [])

	if (!visible) return null

	const handleDismiss = () => { markNoticed(); setVisible(false) }

	return (
		<div className="mx-3 mt-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 relative">
			<button
				type="button"
				onClick={handleDismiss}
				className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
				aria-label={Trans.t('dismiss')}
			>
				<X className="size-3.5" />
			</button>
			<p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mb-1">
				{Trans.t('multi_session_title')}
			</p>
			<p className="text-[11px] text-muted-foreground leading-relaxed pr-4">
				{Trans.t('multi_session_desc')}
			</p>
			<button
				type="button"
				onClick={handleDismiss}
				className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
			>
				{Trans.t('got_it')}
			</button>
		</div>
	)
}
