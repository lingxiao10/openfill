import { handlePageControlMessage } from '@/agent/RemotePageController.background'
import { handleTabControlMessage, setupTabChangeEvents } from '@/agent/TabsController.background'
import { bridgeClient } from '@/trainer/BridgeClient'

/** Tabs currently attached for CDP input */
const cdpAttached = new Set<number>()

async function ensureCdpAttached(tabId: number): Promise<void> {
	if (cdpAttached.has(tabId)) return
	await chrome.debugger.attach({ tabId }, '1.3')
	cdpAttached.add(tabId)
	chrome.tabs.onRemoved.addListener((id) => {
		if (id === tabId) cdpAttached.delete(tabId)
	})
}

async function handleCdpMessage(
	message: { type: 'CDP_INPUT'; action: string; payload: Record<string, unknown> },
	sendResponse: (r: unknown) => void
): Promise<void> {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
		const tabId = (message.payload.tabId as number | undefined) ?? tab?.id
		if (!tabId) throw new Error('No active tab')
		await ensureCdpAttached(tabId)
		if (message.action === 'insertText') {
			await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', {
				text: message.payload.text,
			})
		} else if (message.action === 'dispatchKey') {
			const KEY_CODES: Record<string, { code: string; keyCode: number }> = {
				Enter: { code: 'Enter', keyCode: 13 },
				Tab: { code: 'Tab', keyCode: 9 },
				Escape: { code: 'Escape', keyCode: 27 },
				Backspace: { code: 'Backspace', keyCode: 8 },
				Delete: { code: 'Delete', keyCode: 46 },
				ArrowUp: { code: 'ArrowUp', keyCode: 38 },
				ArrowDown: { code: 'ArrowDown', keyCode: 40 },
				ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
				ArrowRight: { code: 'ArrowRight', keyCode: 39 },
			}
			const combo = message.payload.combo as string
			const parts = combo.split('+')
			let ctrl = false,
				shift = false,
				alt = false,
				key = ''
			for (const p of parts) {
				if (p === 'Ctrl' || p === 'Control') ctrl = true
				else if (p === 'Shift') shift = true
				else if (p === 'Alt') alt = true
				else key = p
			}
			const def = KEY_CODES[key]
			const wvk = def?.keyCode ?? (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0)
			const code = def?.code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key)
			const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0)
			const base = { key, code, windowsVirtualKeyCode: wvk, nativeVirtualKeyCode: wvk, modifiers }
			await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
				type: 'keyDown',
				...base,
			})
			await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
				type: 'keyUp',
				...base,
			})
		}
		sendResponse({ success: true })
	} catch (err) {
		sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) })
	}
}

export default defineBackground(() => {
	console.log('[Background] Service Worker started')

	// Start bridge client from SW — connects to trainer at port 3002
	bridgeClient.start()

	// tab change events

	setupTabChangeEvents()

	// generate user auth token

	chrome.storage.local.get('PageAgentExtUserAuthToken').then((result) => {
		if (result.PageAgentExtUserAuthToken) return

		const userAuthToken = crypto.randomUUID()
		chrome.storage.local.set({ PageAgentExtUserAuthToken: userAuthToken })
	})

	// message proxy

	chrome.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type === 'TAB_CONTROL') {
			return handleTabControlMessage(message, sender, sendResponse)
		} else if (message.type === 'PAGE_CONTROL') {
			return handlePageControlMessage(message, sender, sendResponse)
		} else if (message.type === 'CDP_INPUT') {
			handleCdpMessage(message, sendResponse)
			return true
		} else {
			sendResponse({ error: 'Unknown message type' })
			return
		}
	})

	// setup

	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})
