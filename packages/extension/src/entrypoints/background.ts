import { handlePageControlMessage } from '@/agent/RemotePageController.background'
import { handleTabControlMessage, setupTabChangeEvents } from '@/agent/TabsController.background'
import { bridgeClient } from '@/trainer/BridgeClient'

export default defineBackground(() => {
	console.log('[Background] Service Worker started')

	// tab change events

	setupTabChangeEvents()

	// trainer bridge — connect to local trainer server for remote control
	bridgeClient.start()

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
		} else {
			sendResponse({ error: 'Unknown message type' })
			return
		}
	})

	// setup

	chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})
