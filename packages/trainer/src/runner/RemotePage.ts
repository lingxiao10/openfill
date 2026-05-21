/**
 * RemotePage — Node.js API for controlling the browser via trainer server bridge.
 *
 * Usage in training scripts:
 *   const page = new RemotePage()
 *   const html = await page.getCleanHtml('.job-list')
 *   await page.click('.btn-apply')
 */
import {
	buildClickJS,
	buildExistsJS,
	buildGetAttrJS,
	buildGetCleanHtmlJS,
	buildGetTextJS,
	buildInputJS,
	buildQueryAllJS,
	buildScrollJS,
} from './PageJsBuilder.js'

const BASE_URL = process.env.TRAINER_URL ?? 'http://127.0.0.1:3002'

export class RemotePage {
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

	private async js(
		code: string,
	): Promise<{ success: boolean; result?: unknown; error?: string }> {
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
		await this.cmd('navigate', { url })
		await this.wait(1500) // let page settle
	}

	async getCurrentUrl(): Promise<string> {
		const tab = (await this.cmd('get_active_tab')) as { url?: string }
		return tab.url ?? ''
	}

	// ─── Actions ───────────────────────────────────────────────────────────────

	async click(selector: string): Promise<void> {
		const r = await this.js(buildClickJS(selector))
		this.assertOk(r, `click(${selector})`)
	}

	async input(selector: string, value: string): Promise<void> {
		const r = await this.js(buildInputJS(selector, value, false))
		this.assertOk(r, `input(${selector})`)
	}

	async inputEnter(selector: string, value: string): Promise<void> {
		const r = await this.js(buildInputJS(selector, value, true))
		this.assertOk(r, `inputEnter(${selector})`)
	}

	async scroll(direction: 'up' | 'down' | 'left' | 'right', pages = 1): Promise<void> {
		const r = await this.js(buildScrollJS(direction, pages))
		this.assertOk(r, `scroll(${direction})`)
	}

	async sendKeys(key: string): Promise<void> {
		await this.js(`(function(){
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:${JSON.stringify(key)}}));
      document.activeElement?.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key:${JSON.stringify(key)}}));
      return {success:true};
    })()`)
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

	// ─── HTML snapshot ─────────────────────────────────────────────────────────

	async getCleanHtml(scope?: string, limit = 80000): Promise<string> {
		const r = await this.js(buildGetCleanHtmlJS(scope, limit))
		if (!(r as { success?: boolean }).success)
			throw new Error((r as { error?: string }).error ?? 'getCleanHtml failed')
		return (r as { result?: string }).result ?? ''
	}

	async getFullHtml(): Promise<string> {
		const r = await this.js(
			'(function(){return {success:true,result:document.documentElement.outerHTML}})()',
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
