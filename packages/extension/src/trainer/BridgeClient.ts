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

// Bridge connects extension SW to trainer at port 3002
const SERVER_URL = 'ws://127.0.0.1:3002/ws'
const RECONNECT_DELAY = 3000

// Track tabs we've attached the debugger to (for CSP-bypass JS evaluate).
const cdpAttachedTabs = new Set<number>()
async function ensureCdpAttachedForBridge(tabId: number): Promise<void> {
	if (cdpAttachedTabs.has(tabId)) return
	try {
		await chrome.debugger.attach({ tabId }, '1.3')
	} catch (e) {
		// 'Another debugger is already attached' is OK — debugger is shared per-tab.
		if (!String(e).includes('already attached')) throw e
	}
	cdpAttachedTabs.add(tabId)
	chrome.tabs.onRemoved.addListener((id) => {
		if (id === tabId) cdpAttachedTabs.delete(tabId)
	})
}

interface BridgeMessage {
	id: string
	command: string
	payload?: unknown
}
interface BridgeResponse {
	id: string
	result?: unknown
	error?: string
}

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
			case 'cdp_insert_text':
				return this.cdpInsertText(payload as { text: string; tabId?: number })
			case 'cdp_dispatch_key':
				return this.cdpDispatchKey(payload as { combo: string; tabId?: number })
			default:
				throw new Error(`Unknown bridge command: ${command}`)
		}
	}

	private async getActiveTab(): Promise<{ tabId: number; url: string; title: string }> {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		if (!tab?.id) throw new Error('No active tab')
		return { tabId: tab.id, url: tab.url ?? '', title: tab.title ?? '' }
	}

	private async executeJs({ code, tabId }: { code: string; tabId?: number }): Promise<unknown> {
		const tid = tabId ?? (await this.getActiveTab()).tabId
		const runIn = async (world: 'MAIN' | 'ISOLATED') => {
			const results = await chrome.scripting.executeScript({
				target: { tabId: tid },
				func: (jsCode: string) => {
					try {
						// eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
						return new Function('return (' + jsCode + ')')()
					} catch (err) {
						return {
							__bridgeError: true,
							success: false,
							error: err instanceof Error ? err.message : String(err),
						}
					}
				},
				args: [code],
				world,
			})
			return results?.[0]?.result ?? { __bridgeError: true, success: false, error: 'No result' }
		}
		const looksLikeCspError = (err: unknown): boolean =>
			typeof err === 'string' && /Content Security Policy|unsafe-eval/i.test(err)
		// Try MAIN first (needed for React/Vue internal state); on CSP failure fall back to ISOLATED, then CDP.
		const main = (await runIn('MAIN')) as Record<string, unknown>
		if (
			main &&
			typeof main === 'object' &&
			(main as { __bridgeError?: boolean }).__bridgeError === true &&
			looksLikeCspError((main as { error?: unknown }).error)
		) {
			const iso = (await runIn('ISOLATED')) as Record<string, unknown>
			if (
				iso &&
				typeof iso === 'object' &&
				(iso as { __bridgeError?: boolean }).__bridgeError === true &&
				looksLikeCspError((iso as { error?: unknown }).error)
			) {
				// Last resort: CDP Runtime.evaluate — not subject to page CSP.
				return await this.cdpEvaluate(tid, code)
			}
			return iso
		}
		return main
	}

	private async cdpEvaluate(tabId: number, code: string): Promise<unknown> {
		await ensureCdpAttachedForBridge(tabId)
		// Wrap as expression so we can use returnByValue. The generated JS already
		// is `(function(){...})()` so it's a valid expression.
		const expr = `(${code})`
		const res = (await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
			expression: expr,
			returnByValue: true,
			awaitPromise: true,
			allowUnsafeEvalBlockedByCSP: true,
		})) as {
			result?: { value?: unknown }
			exceptionDetails?: { text?: string; exception?: { description?: string } }
		}
		if (res.exceptionDetails) {
			const msg =
				res.exceptionDetails.exception?.description ??
				res.exceptionDetails.text ??
				'CDP evaluate failed'
			return { __bridgeError: true, success: false, error: msg }
		}
		return res.result?.value
	}

	private async navigate({
		url,
		tabId,
	}: {
		url: string
		tabId?: number
	}): Promise<{ success: boolean }> {
		const tid = tabId ?? (await this.getActiveTab()).tabId
		// If the tab is already on the target URL (or its canonical form), skip navigation
		// to avoid waiting for an onUpdated 'complete' that will never fire.
		try {
			const cur = await chrome.tabs.get(tid)
			const same =
				cur.url && (cur.url === url || cur.url.replace(/\/$/, '') === url.replace(/\/$/, ''))
			if (same) return { success: true }
		} catch {
			// tab lookup failed — fall through to normal navigation
		}
		await chrome.tabs.update(tid, { url })
		// Wait for tab to finish loading
		await new Promise<void>((resolve) => {
			let done = false
			const finish = () => {
				if (done) return
				done = true
				chrome.tabs.onUpdated.removeListener(listener)
				resolve()
			}
			const listener = (changedTabId: number, info: chrome.tabs.TabChangeInfo) => {
				if (changedTabId === tid && info.status === 'complete') finish()
			}
			chrome.tabs.onUpdated.addListener(listener)
			// Fallback timeout — trip in 8s so we're well under the bridge 30s timeout
			setTimeout(finish, 8000)
		})
		await new Promise((r) => setTimeout(r, 500)) // extra settle time
		return { success: true }
	}

	private async screenshot({ tabId }: { tabId?: number } = {}): Promise<{ dataUrl: string }> {
		const tid = tabId ?? (await this.getActiveTab()).tabId
		const tab = await chrome.tabs.get(tid)
		const windowId = tab.windowId ?? chrome.windows.WINDOW_ID_CURRENT
		const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' })
		return { dataUrl }
	}

	// ── CDP input — routed through background SW (only SW has chrome.debugger) ──

	private async cdpInsertText({
		text,
		tabId,
	}: {
		text: string
		tabId?: number
	}): Promise<{ success: boolean }> {
		return chrome.runtime.sendMessage({
			type: 'CDP_INPUT',
			action: 'insertText',
			payload: { text, tabId },
		})
	}

	private async cdpDispatchKey({
		combo,
		tabId,
	}: {
		combo: string
		tabId?: number
	}): Promise<{ success: boolean }> {
		return chrome.runtime.sendMessage({
			type: 'CDP_INPUT',
			action: 'dispatchKey',
			payload: { combo, tabId },
		})
	}
}

export const bridgeClient = new BridgeClient()
