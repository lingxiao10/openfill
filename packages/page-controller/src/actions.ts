/**
 * Copyright (C) 2025 Alibaba Group Holding Limited
 * All rights reserved.
 */
import type { InteractiveElementDomNode } from './dom/dom_tree/type'
import { TYPING_DELAY } from './config'
// ======= general utils =======

async function waitFor(seconds: number): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
}

// ======= dom utils =======

export async function movePointerToElement(element: HTMLElement) {
	const rect = element.getBoundingClientRect()
	const x = rect.left + rect.width / 2
	const y = rect.top + rect.height / 2

	window.dispatchEvent(new CustomEvent('PageAgent::MovePointerTo', { detail: { x, y } }))

	await waitFor(0.3)
}

/**
 * Get the HTMLElement by index from a selectorMap.
 */
export function getElementByIndex(
	selectorMap: Map<number, InteractiveElementDomNode>,
	index: number
): HTMLElement {
	const interactiveNode = selectorMap.get(index)
	if (!interactiveNode) {
		throw new Error(`No interactive element found at index ${index}`)
	}

	const element = interactiveNode.ref
	if (!element) {
		throw new Error(`Element at index ${index} does not have a reference`)
	}

	if (!(element instanceof HTMLElement)) {
		throw new Error(`Element at index ${index} is not an HTMLElement`)
	}

	return element
}

let lastClickedElement: HTMLElement | null = null

function blurLastClickedElement() {
	if (lastClickedElement) {
		lastClickedElement.blur()
		lastClickedElement.dispatchEvent(
			new MouseEvent('mouseout', { bubbles: true, cancelable: true })
		)
		lastClickedElement = null
	}
}

/**
 * Simulate a click on the element
 */
export async function clickElement(element: HTMLElement) {
	blurLastClickedElement()

	lastClickedElement = element
	await scrollIntoViewIfNeeded(element)
	await movePointerToElement(element)
	window.dispatchEvent(new CustomEvent('PageAgent::ClickPointer'))
	await waitFor(0.1)

	// hover it
	element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }))
	element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }))

	// dispatch a sequence of events to ensure all listeners are triggered
	element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

	// focus it to ensure it gets the click event
	element.focus()

	element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
	element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

	// dispatch a click event
	// element.click()

	await waitFor(0.2) // Wait to ensure click event processing completes
}

// eslint-disable-next-line @typescript-eslint/unbound-method
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
	window.HTMLInputElement.prototype,
	'value'
)!.set!

// eslint-disable-next-line @typescript-eslint/unbound-method
const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
	window.HTMLTextAreaElement.prototype,
	'value'
)!.set!

/** Comprehensive key definitions: { code, keyCode } for all supported named keys */
const KEY_DEFS: Record<string, { code: string; keyCode: number }> = {
	// Control
	Enter:     { code: 'Enter',     keyCode: 13 },
	Tab:       { code: 'Tab',       keyCode: 9  },
	Escape:    { code: 'Escape',    keyCode: 27 },
	Backspace: { code: 'Backspace', keyCode: 8  },
	Delete:    { code: 'Delete',    keyCode: 46 },
	Space:     { code: 'Space',     keyCode: 32 },
	// Navigation
	Home:      { code: 'Home',      keyCode: 36 },
	End:       { code: 'End',       keyCode: 35 },
	PageUp:    { code: 'PageUp',    keyCode: 33 },
	PageDown:  { code: 'PageDown',  keyCode: 34 },
	ArrowUp:   { code: 'ArrowUp',   keyCode: 38 },
	ArrowDown: { code: 'ArrowDown', keyCode: 40 },
	ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
	ArrowRight:{ code: 'ArrowRight',keyCode: 39 },
	// Letters (for Ctrl+X shortcuts)
	A: { code: 'KeyA', keyCode: 65 }, B: { code: 'KeyB', keyCode: 66 },
	C: { code: 'KeyC', keyCode: 67 }, D: { code: 'KeyD', keyCode: 68 },
	F: { code: 'KeyF', keyCode: 70 }, G: { code: 'KeyG', keyCode: 71 },
	H: { code: 'KeyH', keyCode: 72 }, K: { code: 'KeyK', keyCode: 75 },
	L: { code: 'KeyL', keyCode: 76 }, N: { code: 'KeyN', keyCode: 78 },
	O: { code: 'KeyO', keyCode: 79 }, P: { code: 'KeyP', keyCode: 80 },
	R: { code: 'KeyR', keyCode: 82 }, S: { code: 'KeyS', keyCode: 83 },
	T: { code: 'KeyT', keyCode: 84 }, U: { code: 'KeyU', keyCode: 85 },
	V: { code: 'KeyV', keyCode: 86 }, W: { code: 'KeyW', keyCode: 87 },
	X: { code: 'KeyX', keyCode: 88 }, Y: { code: 'KeyY', keyCode: 89 },
	Z: { code: 'KeyZ', keyCode: 90 },
}

// Convenience aliases used internally by dispatchCharKeyEvent
const NAMED_KEY_CODE: Record<string, number>     = Object.fromEntries(Object.entries(KEY_DEFS).map(([k, v]) => [k, v.keyCode]))
const NAMED_KEY_CODE_STR: Record<string, string> = Object.fromEntries(Object.entries(KEY_DEFS).map(([k, v]) => [k, v.code]))

/**
 * Parse a key combo string like "Ctrl+A", "Ctrl+Shift+Z", "Delete", "Home" into
 * a structured KeyboardEventInit-compatible object.
 */
export interface KeyCombo {
	key: string
	code: string
	keyCode: number
	ctrlKey: boolean
	shiftKey: boolean
	altKey: boolean
}

export function parseKeyCombo(combo: string): KeyCombo {
	const parts = combo.split('+')
	let ctrlKey = false, shiftKey = false, altKey = false
	let mainKey = ''

	for (const part of parts) {
		const p = part.trim()
		if (p === 'Ctrl' || p === 'Control') ctrlKey = true
		else if (p === 'Shift') shiftKey = true
		else if (p === 'Alt') altKey = true
		else mainKey = p
	}

	const def = KEY_DEFS[mainKey] ?? KEY_DEFS[mainKey.toUpperCase()]
	const code    = def?.code    ?? (mainKey.length === 1 ? `Key${mainKey.toUpperCase()}` : mainKey)
	const keyCode = def?.keyCode ?? (mainKey.length === 1 ? mainKey.toUpperCase().charCodeAt(0) : 0)
	// event.key: lowercase when only Ctrl held, uppercase when Shift also held
	const key = mainKey.length === 1
		? (shiftKey ? mainKey.toUpperCase() : mainKey.toLowerCase())
		: mainKey

	return { key, code, keyCode, ctrlKey, shiftKey, altKey }
}

/**
 * Dispatch a full key combo on an element, simulating the real browser sequence:
 *   modifier-keydowns → main keydown → keypress → main keyup → modifier-keyups
 */
function dispatchKeyCombo(element: HTMLElement, combo: string): void {
	const { key, code, keyCode, ctrlKey, shiftKey, altKey } = parseKeyCombo(combo)
	const modInit = { bubbles: true, cancelable: true, ctrlKey, shiftKey, altKey }

	// Press modifiers first (same order as real hardware)
	if (ctrlKey) element.dispatchEvent(new KeyboardEvent('keydown', { ...modInit, key: 'Control', code: 'ControlLeft', keyCode: 17, which: 17 }))
	if (shiftKey) element.dispatchEvent(new KeyboardEvent('keydown', { ...modInit, key: 'Shift',   code: 'ShiftLeft',   keyCode: 16, which: 16 }))
	if (altKey)   element.dispatchEvent(new KeyboardEvent('keydown', { ...modInit, key: 'Alt',     code: 'AltLeft',     keyCode: 18, which: 18 }))

	const keyInit: KeyboardEventInit = { key, code, keyCode, which: keyCode, ...modInit }

	element.dispatchEvent(new KeyboardEvent('keydown', keyInit))
	// keypress fires for printable single chars or Enter
	if (key.length === 1 || key === 'Enter') {
		element.dispatchEvent(new KeyboardEvent('keypress', { ...keyInit, charCode: keyCode }))
	}
	element.dispatchEvent(new KeyboardEvent('keyup', keyInit))

	// Release modifiers in reverse order
	if (altKey)   element.dispatchEvent(new KeyboardEvent('keyup', { ...modInit, key: 'Alt',     code: 'AltLeft',     keyCode: 18, which: 18 }))
	if (shiftKey) element.dispatchEvent(new KeyboardEvent('keyup', { ...modInit, key: 'Shift',   code: 'ShiftLeft',   keyCode: 16, which: 16 }))
	if (ctrlKey)  element.dispatchEvent(new KeyboardEvent('keyup', { ...modInit, key: 'Control', code: 'ControlLeft', keyCode: 17, which: 17 }))
}

/** Map a single printable character to its KeyboardEvent.keyCode */
function charToKeyCode(char: string): number {
	if (!char || char.length !== 1) return 0
	const upper = char.toUpperCase()
	const code = upper.charCodeAt(0)
	if (code >= 65 && code <= 90) return code // A–Z
	if (code >= 48 && code <= 57) return code // 0–9
	if (char === ' ') return 32
	return char.charCodeAt(0)
}

/** Map a single printable character to its KeyboardEvent.code string */
function charToCodeStr(char: string): string {
	if (char.length === 1) {
		if (/[a-zA-Z]/.test(char)) return `Key${char.toUpperCase()}`
		if (/[0-9]/.test(char)) return `Digit${char}`
		const codeMap: Record<string, string> = {
			' ': 'Space', '.': 'Period', ',': 'Comma', ';': 'Semicolon', "'": 'Quote',
			'[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
			'`': 'Backquote', '-': 'Minus', '=': 'Equal', '/': 'Slash',
		}
		return codeMap[char] ?? ''
	}
	return NAMED_KEY_CODE_STR[char] ?? ''
}

/**
 * Dispatch a keyboard event for a single character, with isTrusted spoofed to true.
 * Fires keydown/keypress/keyup with correct key, code, keyCode, and shiftKey.
 */
function dispatchCharKeyEvent(
	element: HTMLElement,
	char: string,
	type: 'keydown' | 'keypress' | 'keyup'
): void {
	const isNamed = char.length > 1
	const keyCode = isNamed ? (NAMED_KEY_CODE[char] ?? 0) : charToKeyCode(char)
	const code = charToCodeStr(char)
	const shiftKey = !isNamed && char !== char.toLowerCase()

	const init: KeyboardEventInit = {
		key: char,
		keyCode,
		which: keyCode,
		charCode: type === 'keypress' ? (isNamed ? (NAMED_KEY_CODE[char] ?? 0) : char.charCodeAt(0)) : 0,
		shiftKey,
		bubbles: true,
		cancelable: true,
	}
	if (code) init.code = code

	element.dispatchEvent(new KeyboardEvent(type, init))
}

/**
 * Type text into an input/textarea element character by character,
 * simulating a real keyboard sequence:
 *   keydown → keypress → (native value update) → input → keyup
 * per character. This is significantly more compatible with:
 *   - Autocomplete / dropdown triggers (rely on keydown)
 *   - Numeric/pattern validators (intercept keypress)
 *   - Bot-detection heuristics (check for keyboard event sequences)
 *   - React/Vue controlled inputs (track input events per char)
 */
async function typeCharByChar(
	element: HTMLInputElement | HTMLTextAreaElement,
	text: string
): Promise<void> {
	const setter =
		element instanceof HTMLTextAreaElement ? nativeTextAreaValueSetter : nativeInputValueSetter

	// Clear existing content first
	setter.call(element, '')
	element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))

	// Type each character with a full keyboard event sequence
	let currentValue = ''
	for (const char of text) {
		if (char === '\n') {
			// Newline: simulate pressing Enter (keydown + keypress + keyup, no value change)
			dispatchCharKeyEvent(element, 'Enter', 'keydown')
			dispatchCharKeyEvent(element, 'Enter', 'keypress')
			// For textarea, append the newline to value
			if (element instanceof HTMLTextAreaElement) {
				currentValue += '\n'
				setter.call(element, currentValue)
				element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }))
			}
			dispatchCharKeyEvent(element, 'Enter', 'keyup')
		} else {
			dispatchCharKeyEvent(element, char, 'keydown')

			// keypress fires only for printable (non-control) characters
			if (char >= ' ') {
				dispatchCharKeyEvent(element, char, 'keypress')
			}

			currentValue += char
			setter.call(element, currentValue)

			element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: char }))

			dispatchCharKeyEvent(element, char, 'keyup')
		}

		await new Promise((r) => setTimeout(r, TYPING_DELAY * 1000))
	}

	element.dispatchEvent(new Event('change', { bubbles: true }))
}

export async function inputTextElement(element: HTMLElement, text: string) {
	const isContentEditable = element.isContentEditable
	if (
		!(element instanceof HTMLInputElement) &&
		!(element instanceof HTMLTextAreaElement) &&
		!isContentEditable
	) {
		throw new Error('Element is not an input, textarea, or contenteditable')
	}

	await clickElement(element)

	if (isContentEditable) {
		// Contenteditable support
		// Strategy: use execCommand('insertText') which fires browser-native trusted events.
		// This is the most reliable approach for rich text editors (ProseMirror, Quill, Slate,
		// Zhihu, LinkedIn, etc.) because:
		//  1. Events have isTrusted=true — editors/buttons that gate on this will respond.
		//  2. The browser fires beforeinput + DOM mutation + input in the correct order.
		//  3. MutationObservers inside editors are triggered naturally.
		//
		// Not supported: Monaco/CodeMirror (require direct JS instance access), Draft.js (unmaintained).
		//
		// Step 1: Select all existing content in the element via Selection/Range API.
		const selection = window.getSelection()
		if (selection) {
			const range = document.createRange()
			range.selectNodeContents(element)
			selection.removeAllRanges()
			selection.addRange(range)
		}

		// Step 2: Replace selected content with the new text via execCommand.
		// execCommand('insertText') fires: beforeinput (trusted) → DOM mutation → input (trusted)
		//
		// IMPORTANT: execCommand('insertText') silently drops \n in contenteditable.
		// Line-by-line insertText+insertLineBreak fires multiple event cycles and causes
		// React-based editors (Draft.js, Slate, etc.) to re-render between each call,
		// making subsequent calls fail with DOM/Range errors.
		// Fix: use execCommand('insertHTML') for multiline text — inserts everything in one
		// atomic event sequence so the editor only re-renders once.
		let inserted: boolean
		if (!text.includes('\n')) {
			inserted = document.execCommand('insertText', false, text)
		} else {
			const html = text
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/\n/g, '<br>')
			inserted = document.execCommand('insertHTML', false, html)
		}

		if (!inserted) {
			// Fallback: synthetic events + direct DOM mutation.
			// Works for simpler React/Vue contenteditable components that don't use execCommand.
			element.dispatchEvent(
				new InputEvent('beforeinput', {
					bubbles: true,
					cancelable: true,
					inputType: 'insertReplacementText',
					data: text,
				})
			)
			element.innerText = text

			// Place caret at end so editors know where the cursor is
			const sel = window.getSelection()
			if (sel) {
				const range = document.createRange()
				range.selectNodeContents(element)
				range.collapse(false)
				sel.removeAllRanges()
				sel.addRange(range)
			}

			element.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					inputType: 'insertReplacementText',
					data: text,
				})
			)
		}

		element.dispatchEvent(new Event('change', { bubbles: true }))
	} else {
		// HTMLInputElement or HTMLTextAreaElement — simulate keyboard character by character
		await typeCharByChar(element as HTMLInputElement | HTMLTextAreaElement, text)
	}

	await waitFor(0.1)
	// Note: intentionally NOT blurring here.
	// Keeping focus allows send_keys (e.g. Enter) to work immediately after.
	// The element will be blurred naturally when the next click action starts.
}

/**
 * @todo browser-use version is very complex and supports menu tags, need to follow up
 */
export async function selectOptionElement(selectElement: HTMLSelectElement, optionText: string) {
	if (!(selectElement instanceof HTMLSelectElement)) {
		throw new Error('Element is not a select element')
	}

	const options = Array.from(selectElement.options)
	const option = options.find((opt) => opt.textContent?.trim() === optionText.trim())

	if (!option) {
		throw new Error(`Option with text "${optionText}" not found in select element`)
	}

	selectElement.value = option.value
	selectElement.dispatchEvent(new Event('change', { bubbles: true }))

	await waitFor(0.1) // Wait to ensure change event processing completes
}

/**
 * Type text into a tag/chip input and confirm with Enter.
 */
export async function inputTextAndEnterElement(element: HTMLElement, text: string): Promise<string> {
	if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
		throw new Error('Element is not an input or textarea')
	}
	element.focus()
	nativeInputValueSetter.call(element, text)
	element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
	await new Promise((r) => setTimeout(r, 50))
	dispatchKeyCombo(element, 'Enter')
	await waitFor(0.2)
	return `✅ Typed "${text}" and pressed Enter.`
}

/**
 * Send a key combo to an element.
 * Supports plain keys ("Enter", "Delete", "Home") and modifier combos ("Ctrl+A", "Ctrl+Shift+Z").
 * Fires the complete realistic sequence: modifier-downs → keydown → keypress → keyup → modifier-ups.
 */
export async function sendKeysToElement(element: HTMLElement, combo: string): Promise<string> {
	element.focus()
	// Let React flush current input state before the key lands
	if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
		element.dispatchEvent(new Event('input', { bubbles: true }))
		await new Promise((r) => setTimeout(r, 50))
	}
	dispatchKeyCombo(element, combo)
	await waitFor(0.1)
	return `✅ Sent "${combo}" to element.`
}

/**
 * Click an element matched by CSS selector.
 * Used for non-indexed elements like overlays, custom components, and blank areas.
 */
export async function clickElementBySelector(selector: string): Promise<string> {
	const element = document.querySelector<HTMLElement>(selector)
	if (!element) {
		throw new Error(`No element found matching selector: "${selector}"`)
	}
	await clickElement(element)
	const tag = element.tagName.toLowerCase()
	const label = element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 30) || ''
	return `✅ Clicked <${tag}>${label ? ` "${label}"` : ''} via selector "${selector}".`
}

export async function scrollIntoViewIfNeeded(element: HTMLElement) {
	const el = element as any
	if (el.scrollIntoViewIfNeeded) {
		el.scrollIntoViewIfNeeded()
		// await waitFor(0.5) // Animation playback
	} else {
		// @todo visibility check
		el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
		// await waitFor(0.5) // Animation playback
	}
}

export async function scrollVertically(
	down: boolean,
	scroll_amount: number,
	element?: HTMLElement | null
) {
	// Element-specific scrolling if element is provided
	if (element) {
		const targetElement = element
		let currentElement = targetElement as HTMLElement | null
		let scrollSuccess = false
		let scrolledElement: HTMLElement | null = null
		let scrollDelta = 0
		let attempts = 0
		const dy = scroll_amount

		while (currentElement && attempts < 10) {
			const computedStyle = window.getComputedStyle(currentElement)
			const hasScrollableY = /(auto|scroll|overlay)/.test(computedStyle.overflowY)
			const canScrollVertically = currentElement.scrollHeight > currentElement.clientHeight

			if (hasScrollableY && canScrollVertically) {
				const beforeScroll = currentElement.scrollTop
				const maxScroll = currentElement.scrollHeight - currentElement.clientHeight

				let scrollAmount = dy / 3

				if (scrollAmount > 0) {
					scrollAmount = Math.min(scrollAmount, maxScroll - beforeScroll)
				} else {
					scrollAmount = Math.max(scrollAmount, -beforeScroll)
				}

				currentElement.scrollTop = beforeScroll + scrollAmount

				const afterScroll = currentElement.scrollTop
				const actualScrollDelta = afterScroll - beforeScroll

				if (Math.abs(actualScrollDelta) > 0.5) {
					scrollSuccess = true
					scrolledElement = currentElement
					scrollDelta = actualScrollDelta
					break
				}
			}

			if (currentElement === document.body || currentElement === document.documentElement) {
				break
			}
			currentElement = currentElement.parentElement
			attempts++
		}

		if (scrollSuccess) {
			return `Scrolled container (${scrolledElement?.tagName}) by ${scrollDelta}px`
		} else {
			return `No scrollable container found for element (${targetElement.tagName})`
		}
	}

	// Page-level scrolling (default or fallback)

	const dy = scroll_amount
	const bigEnough = (el: HTMLElement) => el.clientHeight >= window.innerHeight * 0.5
	const canScroll = (el: HTMLElement | null) =>
		el &&
		/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY) &&
		el.scrollHeight > el.clientHeight &&
		bigEnough(el)

	let el: HTMLElement | null = document.activeElement as HTMLElement | null
	while (el && !canScroll(el) && el !== document.body) el = el.parentElement

	el = canScroll(el)
		? el
		: Array.from(document.querySelectorAll<HTMLElement>('*')).find(canScroll) ||
			(document.scrollingElement as HTMLElement) ||
			(document.documentElement as HTMLElement)

	if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
		// Page-level scroll
		const scrollBefore = window.scrollY
		const scrollMax = document.documentElement.scrollHeight - window.innerHeight

		window.scrollBy(0, dy)

		const scrollAfter = window.scrollY
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dy > 0
				? `⚠️ Already at the bottom of the page, cannot scroll down further.`
				: `⚠️ Already at the top of the page, cannot scroll up further.`
		}

		const reachedBottom = dy > 0 && scrollAfter >= scrollMax - 1
		const reachedTop = dy < 0 && scrollAfter <= 1

		if (reachedBottom) return `✅ Scrolled page by ${scrolled}px. Reached the bottom of the page.`
		if (reachedTop) return `✅ Scrolled page by ${scrolled}px. Reached the top of the page.`
		return `✅ Scrolled page by ${scrolled}px.`
	} else {
		// Container scroll
		const scrollBefore = el!.scrollTop
		const scrollMax = el!.scrollHeight - el!.clientHeight

		el!.scrollBy({ top: dy, behavior: 'smooth' })
		await waitFor(0.1)

		const scrollAfter = el!.scrollTop
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dy > 0
				? `⚠️ Already at the bottom of container (${el!.tagName}), cannot scroll down further.`
				: `⚠️ Already at the top of container (${el!.tagName}), cannot scroll up further.`
		}

		const reachedBottom = dy > 0 && scrollAfter >= scrollMax - 1
		const reachedTop = dy < 0 && scrollAfter <= 1

		if (reachedBottom)
			return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the bottom.`
		if (reachedTop)
			return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the top.`
		return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px.`
	}
}

export async function scrollHorizontally(
	right: boolean,
	scroll_amount: number,
	element?: HTMLElement | null
) {
	// Element-specific scrolling if element is provided
	if (element) {
		const targetElement = element
		let currentElement = targetElement as HTMLElement | null
		let scrollSuccess = false
		let scrolledElement: HTMLElement | null = null
		let scrollDelta = 0
		let attempts = 0
		const dx = right ? scroll_amount : -scroll_amount

		while (currentElement && attempts < 10) {
			const computedStyle = window.getComputedStyle(currentElement)
			const hasScrollableX = /(auto|scroll|overlay)/.test(computedStyle.overflowX)
			const canScrollHorizontally = currentElement.scrollWidth > currentElement.clientWidth

			if (hasScrollableX && canScrollHorizontally) {
				const beforeScroll = currentElement.scrollLeft
				const maxScroll = currentElement.scrollWidth - currentElement.clientWidth

				let scrollAmount = dx / 3

				if (scrollAmount > 0) {
					scrollAmount = Math.min(scrollAmount, maxScroll - beforeScroll)
				} else {
					scrollAmount = Math.max(scrollAmount, -beforeScroll)
				}

				currentElement.scrollLeft = beforeScroll + scrollAmount

				const afterScroll = currentElement.scrollLeft
				const actualScrollDelta = afterScroll - beforeScroll

				if (Math.abs(actualScrollDelta) > 0.5) {
					scrollSuccess = true
					scrolledElement = currentElement
					scrollDelta = actualScrollDelta
					break
				}
			}

			if (currentElement === document.body || currentElement === document.documentElement) {
				break
			}
			currentElement = currentElement.parentElement
			attempts++
		}

		if (scrollSuccess) {
			return `Scrolled container (${scrolledElement?.tagName}) horizontally by ${scrollDelta}px`
		} else {
			return `No horizontally scrollable container found for element (${targetElement.tagName})`
		}
	}

	// Page-level scrolling (default or fallback)

	const dx = right ? scroll_amount : -scroll_amount
	const bigEnough = (el: HTMLElement) => el.clientWidth >= window.innerWidth * 0.5
	const canScroll = (el: HTMLElement | null) =>
		el &&
		/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowX) &&
		el.scrollWidth > el.clientWidth &&
		bigEnough(el)

	let el: HTMLElement | null = document.activeElement as HTMLElement | null
	while (el && !canScroll(el) && el !== document.body) el = el.parentElement

	el = canScroll(el)
		? el
		: Array.from(document.querySelectorAll<HTMLElement>('*')).find(canScroll) ||
			(document.scrollingElement as HTMLElement) ||
			(document.documentElement as HTMLElement)

	if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
		// Page-level scroll
		const scrollBefore = window.scrollX
		const scrollMax = document.documentElement.scrollWidth - window.innerWidth

		window.scrollBy(dx, 0)

		const scrollAfter = window.scrollX
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dx > 0
				? `⚠️ Already at the right edge of the page, cannot scroll right further.`
				: `⚠️ Already at the left edge of the page, cannot scroll left further.`
		}

		const reachedRight = dx > 0 && scrollAfter >= scrollMax - 1
		const reachedLeft = dx < 0 && scrollAfter <= 1

		if (reachedRight)
			return `✅ Scrolled page by ${scrolled}px. Reached the right edge of the page.`
		if (reachedLeft) return `✅ Scrolled page by ${scrolled}px. Reached the left edge of the page.`
		return `✅ Scrolled page horizontally by ${scrolled}px.`
	} else {
		// Container scroll
		const scrollBefore = el!.scrollLeft
		const scrollMax = el!.scrollWidth - el!.clientWidth

		el!.scrollBy({ left: dx, behavior: 'smooth' })
		await waitFor(0.1)

		const scrollAfter = el!.scrollLeft
		const scrolled = scrollAfter - scrollBefore

		if (Math.abs(scrolled) < 1) {
			return dx > 0
				? `⚠️ Already at the right edge of container (${el!.tagName}), cannot scroll right further.`
				: `⚠️ Already at the left edge of container (${el!.tagName}), cannot scroll left further.`
		}

		const reachedRight = dx > 0 && scrollAfter >= scrollMax - 1
		const reachedLeft = dx < 0 && scrollAfter <= 1

		if (reachedRight)
			return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the right edge.`
		if (reachedLeft)
			return `✅ Scrolled container (${el!.tagName}) by ${scrolled}px. Reached the left edge.`
		return `✅ Scrolled container (${el!.tagName}) horizontally by ${scrolled}px.`
	}
}
