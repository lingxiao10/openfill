/**
 * content script for RemotePageController
 */
import { PageController } from '@page-agent/page-controller'

export function initPageController() {
	let pageController: PageController | null = null
	let intervalID: number | null = null

	const myTabIdPromise = chrome.runtime
		.sendMessage({ type: 'PAGE_CONTROL', action: 'get_my_tab_id' })
		.then((response) => {
			return (response as { tabId: number | null }).tabId
		})
		.catch((error) => {
			console.log('[RemotePageController.ContentScript]: Failed to get my tab id', error)
			return null
		})

	function getPC(): PageController {
		if (!pageController) {
			pageController = new PageController({ enableMask: false, viewportExpansion: 400 })
		}
		return pageController
	}

	intervalID = window.setInterval(async () => {
		try {
			// Accessing chrome.runtime.id throws synchronously when context is invalidated
			void chrome.runtime.id
		} catch {
			window.clearInterval(intervalID!)
			intervalID = null
			return
		}

		try {
			const agentHeartbeat = (await chrome.storage.local.get('agentHeartbeat')).agentHeartbeat
			const now = Date.now()
			const agentInTouch = typeof agentHeartbeat === 'number' && now - agentHeartbeat < 2_000

			const isAgentRunning = (await chrome.storage.local.get('isAgentRunning')).isAgentRunning
			const currentTabId = (await chrome.storage.local.get('currentTabId')).currentTabId

			const shouldShowMask = isAgentRunning && agentInTouch && currentTabId === (await myTabIdPromise)

			if (shouldShowMask) {
				const pc = getPC()
				pc.initMask()
				await pc.showMask()
			} else {
				// await getPC().hideMask()
				if (pageController) {
					pageController.hideMask()
					pageController.cleanUpHighlights()
				}
			}

			if (!isAgentRunning && agentInTouch) {
				if (pageController) {
					pageController.dispose()
					pageController = null
				}
			}
		} catch (error) {
			// Extension context invalidated (e.g. after reload) — stop the interval
			if (intervalID !== null) {
				window.clearInterval(intervalID)
				intervalID = null
			}
		}
	}, 500)

	chrome.runtime.onMessage.addListener((message, sender, sendResponse): true | undefined => {
		if (message.type !== 'PAGE_CONTROL') {
			// sendResponse({
			// 	success: false,
			// 	error: `[RemotePageController.ContentScript]: Invalid message type: ${message.type}`,
			// })
			return
		}

		const { action, payload } = message
		const methodName = getMethodName(action)

		const pc = getPC() as any

		switch (action) {
			case 'get_last_update_time':
			case 'get_browser_state':
			case 'update_tree':
			case 'clean_up_highlights':
			case 'click_element':
			case 'focus_element':
			case 'input_text':
			case 'input_text_and_enter':
			case 'select_option':
			case 'send_keys':
			case 'scroll':
			case 'scroll_horizontally':
			case 'execute_javascript':
			case 'click_blank_area':
				pc[methodName](...(payload || []))
					.then((result: any) => sendResponse(result))
					.catch((error: any) =>
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : String(error),
						})
					)
				break

			default:
				sendResponse({
					success: false,
					error: `Unknown PAGE_CONTROL action: ${action}`,
				})
		}

		return true
	})
}

function getMethodName(action: string): string {
	switch (action) {
		case 'get_last_update_time':
			return 'getLastUpdateTime' as const
		case 'get_browser_state':
			return 'getBrowserState' as const
		case 'update_tree':
			return 'updateTree' as const
		case 'clean_up_highlights':
			return 'cleanUpHighlights' as const

		// DOM actions

		case 'click_element':
			return 'clickElement' as const
		case 'focus_element':
			return 'focusElement' as const
		case 'input_text':
			return 'inputText' as const
		case 'input_text_and_enter':
			return 'inputTextAndEnter' as const
		case 'select_option':
			return 'selectOption' as const
		case 'scroll':
			return 'scroll' as const
		case 'scroll_horizontally':
			return 'scrollHorizontally' as const
		case 'execute_javascript':
			return 'executeJavascript' as const
		case 'click_blank_area':
			return 'clickBlankArea' as const
		case 'send_keys':
			return 'sendKeys' as const

		default:
			return action
	}
}
