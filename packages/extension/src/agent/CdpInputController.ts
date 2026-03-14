/**
 * CDP-based input controller for debugger mode.
 *
 * Uses chrome.debugger to dispatch truly trusted (isTrusted=true) input events
 * via the Chrome DevTools Protocol. Only included in debugger-mode builds.
 *
 * Requires "debugger" permission in manifest.
 */

const PREFIX = '[CdpInput]'

/** Tabs currently attached to the debugger */
const attachedTabs = new Set<number>()

async function ensureAttached(tabId: number): Promise<void> {
	if (attachedTabs.has(tabId)) return
	await chrome.debugger.attach({ tabId }, '1.3')
	attachedTabs.add(tabId)
	const onRemoved = (id: number) => {
		if (id === tabId) {
			attachedTabs.delete(tabId)
			chrome.tabs.onRemoved.removeListener(onRemoved)
		}
	}
	chrome.tabs.onRemoved.addListener(onRemoved)
	console.debug(PREFIX, `attached to tab ${tabId}`)
}

/** Key name → { windowsVirtualKeyCode, code } for CDP dispatch */
const KEY_DEFS: Record<string, { windowsVirtualKeyCode: number; code: string }> = {
	Enter:     { windowsVirtualKeyCode: 13, code: 'Enter' },
	Tab:       { windowsVirtualKeyCode: 9,  code: 'Tab' },
	Escape:    { windowsVirtualKeyCode: 27, code: 'Escape' },
	Backspace: { windowsVirtualKeyCode: 8,  code: 'Backspace' },
	Delete:    { windowsVirtualKeyCode: 46, code: 'Delete' },
	Space:     { windowsVirtualKeyCode: 32, code: 'Space' },
	Home:      { windowsVirtualKeyCode: 36, code: 'Home' },
	End:       { windowsVirtualKeyCode: 35, code: 'End' },
	PageUp:    { windowsVirtualKeyCode: 33, code: 'PageUp' },
	PageDown:  { windowsVirtualKeyCode: 34, code: 'PageDown' },
	ArrowUp:   { windowsVirtualKeyCode: 38, code: 'ArrowUp' },
	ArrowDown: { windowsVirtualKeyCode: 40, code: 'ArrowDown' },
	ArrowLeft: { windowsVirtualKeyCode: 37, code: 'ArrowLeft' },
	ArrowRight:{ windowsVirtualKeyCode: 39, code: 'ArrowRight' },
	// Letters (used in Ctrl+X combos)
	A: { windowsVirtualKeyCode: 65, code: 'KeyA' }, C: { windowsVirtualKeyCode: 67, code: 'KeyC' },
	D: { windowsVirtualKeyCode: 68, code: 'KeyD' }, F: { windowsVirtualKeyCode: 70, code: 'KeyF' },
	H: { windowsVirtualKeyCode: 72, code: 'KeyH' }, K: { windowsVirtualKeyCode: 75, code: 'KeyK' },
	L: { windowsVirtualKeyCode: 76, code: 'KeyL' }, N: { windowsVirtualKeyCode: 78, code: 'KeyN' },
	O: { windowsVirtualKeyCode: 79, code: 'KeyO' }, P: { windowsVirtualKeyCode: 80, code: 'KeyP' },
	R: { windowsVirtualKeyCode: 82, code: 'KeyR' }, S: { windowsVirtualKeyCode: 83, code: 'KeyS' },
	T: { windowsVirtualKeyCode: 84, code: 'KeyT' }, U: { windowsVirtualKeyCode: 85, code: 'KeyU' },
	V: { windowsVirtualKeyCode: 86, code: 'KeyV' }, W: { windowsVirtualKeyCode: 87, code: 'KeyW' },
	X: { windowsVirtualKeyCode: 88, code: 'KeyX' }, Y: { windowsVirtualKeyCode: 89, code: 'KeyY' },
	Z: { windowsVirtualKeyCode: 90, code: 'KeyZ' },
}

/**
 * Parse "Ctrl+A", "Ctrl+Shift+Z", "Delete" etc. into CDP fields.
 * CDP modifiers bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8
 */
function parseCdpCombo(combo: string) {
	const parts = combo.split('+')
	let ctrlKey = false, shiftKey = false, altKey = false
	let mainKey = ''
	for (const p of parts) {
		const t = p.trim()
		if (t === 'Ctrl' || t === 'Control') ctrlKey = true
		else if (t === 'Shift') shiftKey = true
		else if (t === 'Alt') altKey = true
		else mainKey = t
	}
	const def = KEY_DEFS[mainKey] ?? KEY_DEFS[mainKey.toUpperCase()]
	const windowsVirtualKeyCode = def?.windowsVirtualKeyCode ?? (mainKey.length === 1 ? mainKey.toUpperCase().charCodeAt(0) : 0)
	const code = def?.code ?? (mainKey.length === 1 ? `Key${mainKey.toUpperCase()}` : mainKey)
	const key  = mainKey.length === 1 ? (shiftKey ? mainKey.toUpperCase() : mainKey.toLowerCase()) : mainKey
	const modifiers = (altKey ? 1 : 0) | (ctrlKey ? 2 : 0) | (shiftKey ? 8 : 0)
	return { key, code, windowsVirtualKeyCode, modifiers }
}

/**
 * Insert text into the currently focused element via CDP Input.insertText.
 * Events dispatched this way have isTrusted=true.
 */
export async function cdpInsertText(tabId: number, text: string): Promise<void> {
	await ensureAttached(tabId)
	await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text })
	console.debug(PREFIX, `insertText on tab ${tabId}: "${text.slice(0, 30)}"`)
}

/**
 * Dispatch a key combo ("Enter", "Ctrl+A", "Ctrl+Shift+Z", etc.) via CDP.
 * Events dispatched this way have isTrusted=true.
 */
export async function cdpDispatchKey(tabId: number, combo: string): Promise<void> {
	await ensureAttached(tabId)
	const { key, code, windowsVirtualKeyCode, modifiers } = parseCdpCombo(combo)
	const base = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode, modifiers }
	await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', ...base })
	await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp',   ...base })
	console.debug(PREFIX, `dispatchKey "${combo}" (modifiers=${modifiers}) on tab ${tabId}`)
}
