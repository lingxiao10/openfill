/**
 * RemotePage — Node.js API for controlling the browser via trainer server bridge.
 *
 * Usage in training scripts:
 *   const page = new RemotePage()
 *   const html = await page.getCleanHtml('.job-list')
 *   await page.click('.btn-apply')
 */
import {
	buildClearJS,
	buildClickJS,
	buildExistsJS,
	buildFocusJS,
	buildGetAttrJS,
	buildGetCleanHtmlJS,
	buildGetTextJS,
	buildInputJS,
	buildPasteTextJS,
	buildQueryAllJS,
	buildScrollJS,
	buildSelectJS,
	buildSendKeyJS,
	buildUploadFileJS,
} from './PageJsBuilder.js'

const BASE_URL = process.env.TRAINER_URL ?? 'http://127.0.0.1:3002'

let _autoShotEnabled = false
let _autoShotDelayMs = 1000
let _autoShotDir = 'packages/trainer/data/screenshots/auto'
let _autoShotSeq = 0

export class RemotePage {
	/**
	 * Enable auto-screenshot mode for testing.
	 * When enabled, every action (click/input/uploadFile/etc.) automatically takes
	 * a screenshot after `delayMs` ms, saving to `dir/NNN_action.png`.
	 * This captures transient UI states (popups, toasts) that disappear quickly.
	 *
	 * Call at the top of any exploration or test script:
	 *   page.autoScreenshot(true)          // default 1000ms delay
	 *   page.autoScreenshot(true, 600)     // faster capture for quick popups
	 *   page.autoScreenshot(false)         // disable
	 */
	autoScreenshot(
		enabled: boolean,
		delayMs = 1000,
		dir = 'packages/trainer/data/screenshots/auto'
	): void {
		_autoShotEnabled = enabled
		_autoShotDelayMs = delayMs
		_autoShotDir = dir
		_autoShotSeq = 0
		if (enabled) console.log(`[RemotePage] autoScreenshot ON — delay=${delayMs}ms dir=${dir}`)
	}

	private async snapIfAuto(label: string): Promise<void> {
		if (!_autoShotEnabled) return
		await this.wait(_autoShotDelayMs)
		const seq = String(++_autoShotSeq).padStart(3, '0')
		const safe = label.replace(/[^a-zA-Z0-9_一-鿿-]/g, '_').slice(0, 40)
		await this.screenshot(`${_autoShotDir}/${seq}_${safe}.png`)
	}

	private async cmd(command: string, payload?: unknown): Promise<unknown> {
		const res = await fetch(`${BASE_URL}/api/browser/cmd`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command, payload }),
		})
		if (!res.ok) {
			const text = await res.text()
			throw new Error(`Bridge HTTP ${res.status}: ${text}`)
		}
		return res.json()
	}

	private async js(code: string): Promise<{ success: boolean; result?: unknown; error?: string }> {
		const r = (await this.cmd('execute_js', { code })) as {
			success: boolean
			result?: unknown
			error?: string
		}
		return r
	}

	private assertOk(r: { success: boolean; error?: string }, label: string): void {
		if (!r.success) throw new Error(`${label} failed: ${r.error ?? 'unknown error'}`)
	}

	// ─── Navigation ────────────────────────────────────────────────────────────

	async navigate(url: string): Promise<void> {
		// Clear beforeunload handlers first to prevent native browser confirmation dialogs
		await this.js('(function(){ window.onbeforeunload = null; return {success:true}; })()')
		await this.cmd('navigate', { url })
		await this.wait(1500) // let page settle
	}

	async refresh(): Promise<void> {
		// Clear beforeunload handlers first to prevent native browser confirmation dialogs
		await this.js('(function(){ window.onbeforeunload = null; return {success:true}; })()')
		await this.js('(function(){ location.reload(); return {success:true}; })()')
		await this.wait(2000) // let page reload
	}

	async getCurrentUrl(): Promise<string> {
		const tab = (await this.cmd('get_active_tab')) as { url?: string }
		return tab.url ?? ''
	}

	// ─── Actions ───────────────────────────────────────────────────────────────

	async click(selector: string): Promise<void> {
		const r = await this.js(buildClickJS(selector))
		this.assertOk(r, `click(${selector})`)
		await this.snapIfAuto(`click_${selector}`)
	}

	async input(selector: string, value: string): Promise<void> {
		const r = await this.js(buildInputJS(selector, value, false))
		this.assertOk(r, `input(${selector})`)
		await this.snapIfAuto(`input_${selector}`)
	}

	async inputEnter(selector: string, value: string): Promise<void> {
		const r = await this.js(buildInputJS(selector, value, true))
		this.assertOk(r, `inputEnter(${selector})`)
		await this.snapIfAuto(`inputEnter_${selector}`)
	}

	async clear(selector: string): Promise<void> {
		const r = await this.js(buildClearJS(selector))
		this.assertOk(r, `clear(${selector})`)
		await this.snapIfAuto(`clear_${selector}`)
	}

	async inputAfterClear(selector: string, value: string): Promise<void> {
		await this.clear(selector)
		await this.wait(1000)
		await this.input(selector, value)
	}

	async scroll(direction: 'up' | 'down' | 'left' | 'right', pages = 1): Promise<void> {
		const r = await this.js(buildScrollJS(direction, pages))
		this.assertOk(r, `scroll(${direction})`)
		await this.snapIfAuto(`scroll_${direction}`)
	}

	async sendKey(selector: string | null, combo: string): Promise<void> {
		const r = await this.js(buildSendKeyJS(selector, combo))
		this.assertOk(r, `sendKey(${combo})`)
		await this.snapIfAuto(`sendKey_${combo}`)
	}

	/**
	 * Upload a local file to an input[type=file] element.
	 * This is the preferred method for any file upload — reads the file in Node.js,
	 * converts to base64, and injects via DataTransfer without opening an OS dialog.
	 *
	 * @param selector  CSS / text: / etc. selector pointing to the input[type=file]
	 * @param localPath Absolute or relative path to the local file
	 */
	async uploadFile(selector: string, localPath: string): Promise<void> {
		const { readFileSync } = await import('node:fs')
		const { basename, extname } = await import('node:path')
		const MIME: Record<string, string> = {
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.webp': 'image/webp',
			'.bmp': 'image/bmp',
			'.pdf': 'application/pdf',
			'.mp4': 'video/mp4',
			'.mov': 'video/quicktime',
		}
		const ext = extname(localPath).toLowerCase()
		const mimeType = MIME[ext] ?? 'application/octet-stream'
		const filename = basename(localPath)
		const b64 = readFileSync(localPath).toString('base64')
		const r = await this.js(buildUploadFileJS(selector, b64, filename, mimeType))
		this.assertOk(r as { success: boolean; error?: string }, `uploadFile(${selector})`)
		await this.snapIfAuto(`uploadFile_${filename}`)
	}

	/**
	 * Paste text into a contenteditable element via ClipboardEvent.
	 * Preferred over input() for Draft.js editors with large multi-line content,
	 * where execCommand('insertText') truncates long strings.
	 */
	async pasteText(selector: string, value: string): Promise<void> {
		const r = await this.js(buildPasteTextJS(selector, value))
		this.assertOk(r, `pasteText(${selector})`)
		await this.snapIfAuto(`pasteText_${selector}`)
	}

	async select(selector: string, optionText: string): Promise<void> {
		const r = await this.js(buildSelectJS(selector, optionText))
		this.assertOk(r, `select(${selector}, ${optionText})`)
		await this.snapIfAuto(`select_${optionText}`)
	}

	async wait(ms: number): Promise<void> {
		await new Promise((r) => setTimeout(r, ms))
	}

	// ─── Queries ───────────────────────────────────────────────────────────────

	async exists(selector: string): Promise<boolean> {
		const r = await this.js(buildExistsJS(selector))
		return !!(r as { result?: unknown }).result
	}

	async getText(selector: string): Promise<string> {
		const r = await this.js(buildGetTextJS(selector))
		this.assertOk(r as { success: boolean; error?: string }, `getText(${selector})`)
		return (r as { result?: string }).result ?? ''
	}

	async getAttr(selector: string, attr: string): Promise<string | null> {
		const r = await this.js(buildGetAttrJS(selector, attr))
		this.assertOk(r as { success: boolean; error?: string }, `getAttr(${selector})`)
		return (r as { result?: string | null }).result ?? null
	}

	async queryAll(selector: string, fields: string[]): Promise<Record<string, string>[]> {
		const r = await this.js(buildQueryAllJS(selector, fields))
		if (!(r as { success?: boolean }).success) return []
		return (r as { result?: Record<string, string>[] }).result ?? []
	}

	async clickNth(selector: string, index: number): Promise<void> {
		const css = /^[.#[]/.test(selector) ? selector : selector.replace(/^css:/, '')
		const r = await this.js(`(function(){
      const els = [...document.querySelectorAll(${JSON.stringify(css)})];
      const el = els[${index}];
      if (!el) return {success:false,error:'No element at index ${index}'};
      el.scrollIntoView({block:'center',behavior:'instant'});
      el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,cancelable:true}));
      el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,buttons:1}));
      el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
      el.click();
      return {success:true};
    })()`)
		this.assertOk(r as { success: boolean; error?: string }, `clickNth(${selector}, ${index})`)
	}

	// ─── Raw JS evaluation (advanced — use only when no higher-level API fits) ──

	async eval(code: string): Promise<unknown> {
		const r = await this.js(code)
		return (r as { result?: unknown }).result
	}

	// ─── HTML snapshot ─────────────────────────────────────────────────────────

	async getCleanHtml(scope?: string, limit = 80000): Promise<string> {
		const r = await this.js(buildGetCleanHtmlJS(scope, limit))
		if (!(r as { success?: boolean }).success)
			throw new Error((r as { error?: string }).error ?? 'getCleanHtml failed')
		return (r as { result?: string }).result ?? ''
	}

	async getFullHtml(): Promise<string> {
		const r = await this.js(
			'(function(){return {success:true,result:document.documentElement.outerHTML}})()'
		)
		return (r as { result?: string }).result ?? ''
	}

	// ─── Screenshot ────────────────────────────────────────────────────────────

	async screenshot(savePath?: string): Promise<string> {
		const r = (await this.cmd('screenshot')) as { dataUrl: string }
		if (savePath) {
			const { writeFileSync, mkdirSync } = await import('node:fs')
			const { dirname } = await import('node:path')
			mkdirSync(dirname(savePath), { recursive: true })
			const base64 = r.dataUrl.replace(/^data:image\/\w+;base64,/, '')
			writeFileSync(savePath, Buffer.from(base64, 'base64'))
			console.log(`[RemotePage] Screenshot saved: ${savePath}`)
		}
		return r.dataUrl
	}
}
