/**
 * BridgeClient — connects extension to trainer server for remote control.
 *
 * Runs in the background service worker.
 * Receives commands from trainer server and executes them via Chrome APIs.
 *
 * Commands handled:
 *   execute_js   { code }           → evaluate JS in active tab's content script
 *   navigate     { url, tabId? }    → navigate tab to URL, wait for load
 *   screenshot   {}                 → capture visible tab as base64 PNG
 *   get_active_tab {}               → { tabId, url, title }
 */

const SERVER_URL = 'ws://127.0.0.1:3002/ws'
const RECONNECT_DELAY = 3000

type BridgeMessage = { id: string; command: string; payload?: unknown }
type BridgeResponse = { id: string; result?: unknown; error?: string }

export class BridgeClient {
	private ws: WebSocket | null = null
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private connected = false

	start(): void {
		this.connect()
	}

	private connect(): void {
		try {
			this.ws = new WebSocket(SERVER_URL)

			this.ws.addEventListener('open', () => {
				this.connected = true
				console.log('[Bridge] Connected to trainer server')
				if (this.reconnectTimer) {
					clearTimeout(this.reconnectTimer)
					this.reconnectTimer = null
				}
			})

			this.ws.addEventListener('message', async (event) => {
				let msg: BridgeMessage
				try {
					msg = JSON.parse(event.data as string) as BridgeMessage
				} catch {
					return
				}
				const response: BridgeResponse = { id: msg.id }
				try {
					response.result = await this.execute(msg.command, msg.payload)
				} catch (err) {
					response.error = err instanceof Error ? err.message : String(err)
				}
				if (this.ws?.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify(response))
				}
			})

			this.ws.addEventListener('close', () => {
				this.connected = false
				console.log('[Bridge] Disconnected, reconnecting...')
				this.scheduleReconnect()
			})

			this.ws.addEventListener('error', () => {
				// error is followed by close, no need to handle separately
			})
		} catch {
			this.scheduleReconnect()
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			this.connect()
		}, RECONNECT_DELAY)
	}

	private async execute(command: string, payload: unknown): Promise<unknown> {
		switch (command) {
			case 'execute_js':
				return this.executeJs(payload as { code: string; tabId?: number })
			case 'navigate':
				return this.navigate(payload as { url: string; tabId?: number })
			case 'screenshot':
				return this.screenshot(payload as { tabId?: number } | undefined)
			case 'get_active_tab':
				return this.getActiveTab()
			default:
				throw new Error(`Unknown bridge command: ${command}`)
		}
	}

	private async getActiveTab(): Promise<{ tabId: number; url: string; title: string }> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab?.id) throw new Error('No active tab')
		return { tabId: tab.id, url: tab.url ?? '', title: tab.title ?? '' }
	}

	private async executeJs({
		code,
		tabId,
	}: {
		code: string
		tabId?: number
	}): Promise<unknown> {
		const tid = tabId ?? (await this.getActiveTab()).tabId
		// Use chrome.scripting.executeScript for reliable execution in MV3
		const results = await chrome.scripting.executeScript({
			target: { tabId: tid },
			func: (jsCode: string) => {
				try {
					// eslint-disable-next-line no-new-func
					return new Function(jsCode)()
				} catch (err) {
					return { success: false, error: err instanceof Error ? err.message : String(err) }
				}
			},
			args: [code],
			world: 'MAIN', // run in page's JS context (access to page's React/Vue state)
		})
		return results?.[0]?.result ?? { success: false, error: 'No result' }
	}

	private async navigate({
		url,
		tabId,
	}: {
		url: string
		tabId?: number
	}): Promise<{ success: boolean }> {
		const tid = tabId ?? (await this.getActiveTab()).tabId
		await chrome.tabs.update(tid, { url })
		// Wait for tab to finish loading
		await new Promise<void>((resolve) => {
			const listener = (changedTabId: number, info: chrome.tabs.TabChangeInfo) => {
				if (changedTabId === tid && info.status === 'complete') {
					chrome.tabs.onUpdated.removeListener(listener)
					resolve()
				}
			}
			chrome.tabs.onUpdated.addListener(listener)
			// Fallback timeout
			setTimeout(resolve, 10000)
		})
		await new Promise((r) => setTimeout(r, 500)) // extra settle time
		return { success: true }
	}

	private async screenshot({ tabId }: { tabId?: number } = {}): Promise<{ dataUrl: string }> {
		const windowId = tabId
			? (await chrome.tabs.get(tabId)).windowId
			: chrome.windows.WINDOW_ID_CURRENT
		const dataUrl = await chrome.tabs.captureVisibleTab(windowId!, { format: 'png' })
		return { dataUrl }
	}
}

export const bridgeClient = new BridgeClient()
