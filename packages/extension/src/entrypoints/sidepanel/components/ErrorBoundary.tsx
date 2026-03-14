import { AlertTriangle, Download, Eraser, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { downloadAgentLogs } from '@/lib/downloadLogs'
import { logStartupError } from '@/lib/startupLog'
import { Trans } from '@/utils/Trans'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
	state: State = { hasError: false, error: null }

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.log('[ErrorBoundary]', error, errorInfo.componentStack)
		logStartupError({
			type: 'react',
			message: error.message,
			stack: error.stack,
			detail: errorInfo.componentStack,
		})
	}

	handleReload = () => window.location.reload()

	handleResetConfig = async () => {
		await chrome.storage.local.remove(['llmConfig', 'language', 'advancedConfig'])
		window.location.reload()
	}

	render() {
		if (!this.state.hasError) return this.props.children

		return (
			<div className="flex flex-col items-center justify-center h-screen bg-background p-6 text-center">
				<AlertTriangle className="size-12 text-destructive mb-4" />
				<h2 className="text-lg font-semibold mb-2">{Trans.t('error_title')}</h2>
				<p className="text-sm text-muted-foreground mb-4 max-w-xs">
					{this.state.error?.message || Trans.t('error_desc')}
				</p>
				<div className="flex gap-2 flex-wrap justify-center">
					<Button variant="outline" size="sm" onClick={() => downloadAgentLogs('', [])}>
						<Download className="size-3.5 mr-2" />
						{Trans.t('download_logs_btn')}
					</Button>
					<Button variant="outline" size="sm" onClick={this.handleResetConfig}>
						<Eraser className="size-3.5 mr-2" />
						{Trans.t('reset_config')}
					</Button>
					<Button variant="outline" size="sm" onClick={this.handleReload}>
						<RotateCcw className="size-3.5 mr-2" />
						{Trans.t('reload_panel')}
					</Button>
				</div>
			</div>
		)
	}
}
