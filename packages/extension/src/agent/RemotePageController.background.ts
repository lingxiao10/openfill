/**
 * background logics for RemotePageController
 * - redirect messages from RemotePageController(Agent, extension pages) to ContentScript
 * - in debugger mode: intercept input_text / send_keys and use CDP for isTrusted=true events
 */
import { cdpDispatchKey, cdpInsertText } from './CdpInputController'

export function handlePageControlMessage(
	message: { type: 'PAGE_CONTROL'; action: string; payload: any; targetTabId: number },
	sender: chrome.runtime.MessageSender,
	sendResponse: (response: unknown) => void
): true | undefined {
	const PREFIX = '[RemotePageController.background]'

	function debug(...messages: any[]) {
		console.debug(`\x1b[90m${PREFIX}\x1b[0m`, ...messages)
	}

	const { action, payload, targetTabId } = message

	if (action === 'get_my_tab_id') {
		debug('get_my_tab_id', sender.tab?.id)
		sendResponse({ tabId: sender.tab?.id || null })
		return
	}

	// ── Debugger-mode input interception ────────────────────────────────────
	// In debugger mode, input_text and send_keys are handled via CDP so that
	// the dispatched events have isTrusted=true.
	// Flow for input_text:
	//   1. content script: focus_element (lightweight click/focus, no typing)
	//   2. background: CDP Input.insertText → truly trusted input events
	if (__DEBUGGER_MODE__) {
		if (action === 'input_text') {
			const [index, text] = payload as [number, string]
			debug('cdp input_text', targetTabId, index, text)

			// Step 1 – focus element in the content script (no typing)
			chrome.tabs
				.sendMessage(targetTabId, { type: 'PAGE_CONTROL', action: 'focus_element', payload: [index] })
				.then(() => cdpInsertText(targetTabId, text))
				.then(() =>
					sendResponse({ success: true, message: `✅ Input "${text}" via CDP (isTrusted=true).` })
				)
				.catch((err) =>
					sendResponse({ success: false, message: `❌ CDP input_text failed: ${err}` })
				)
			return true
		}

		if (action === 'send_keys') {
			const [key, index] = payload as [string, number | undefined]
			debug('cdp send_keys', targetTabId, key)

			const focusFirst =
				index !== undefined
					? chrome.tabs.sendMessage(targetTabId, {
							type: 'PAGE_CONTROL',
							action: 'focus_element',
							payload: [index],
						})
					: Promise.resolve()

			focusFirst
				.then(() => cdpDispatchKey(targetTabId, key))
				.then(() =>
					sendResponse({ success: true, message: `✅ Sent key "${key}" via CDP (isTrusted=true).` })
				)
				.catch((err) =>
					sendResponse({ success: false, message: `❌ CDP send_keys failed: ${err}` })
				)
			return true
		}
	}
	// ────────────────────────────────────────────────────────────────────────

	// proxy to content script
	chrome.tabs
		.sendMessage(targetTabId, {
			type: 'PAGE_CONTROL',
			action,
			payload,
		})
		.then((result) => {
			sendResponse(result)
		})
		.catch((error) => {
			console.error(PREFIX, error)
			sendResponse({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			})
		})

	return true // async response
}
