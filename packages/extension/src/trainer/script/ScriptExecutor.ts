/**
 * ScriptExecutor — runs an AI-written JS script against the live page.
 *
 * The script is an async function body that receives:
 *   page   — PageAPI with semantic DOM helpers (each call → execute_javascript)
 *   params — runtime key/value substitutions
 *
 * All page.* calls are non-index: they use text/aria/placeholder/css selectors
 * so scripts remain stable across page refreshes.
 */
import type { PageActionSender, ScriptRunResult, TrainerScript } from './types'

// ─── Param substitution ───────────────────────────────────────────────────────

function applyParams(code: string, params: Record<string, string>): string {
	return code.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`)
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function execute(
	spec: TrainerScript,
	params: Record<string, string>,
	tabId: number,
	sender: PageActionSender,
	onLog?: (msg: string) => void
): Promise<ScriptRunResult> {
	const logs: string[] = []
	const log = (msg: string) => {
		logs.push(msg)
		onLog?.(msg)
	}

	try {
		if (spec.entryUrl) {
			log(`navigate → ${spec.entryUrl}`)
			await sender.send('navigate', tabId, [{ url: spec.entryUrl }])
			await delay(2000)
		}

		const code = applyParams(spec.code, params)
		const page = buildPageAPI(tabId, sender, log)

		// Run script as AsyncFunction — receives `page` and `params`
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const fn = new Function('page', 'params', `"use strict";\nreturn (async () => {\n${code}\n})()`)
		await (fn as (p: typeof page, q: Record<string, string>) => Promise<void>)(page, params)

		log('✓ Script completed')
		return { name: spec.name, params, success: true, output: logs }
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		log(`✗ ${msg}`)
		return { name: spec.name, params, success: false, output: logs, error: msg }
	}
}

// ─── PageAPI ──────────────────────────────────────────────────────────────────

function buildPageAPI(tabId: number, sender: PageActionSender, log: (msg: string) => void) {
	const js = async (code: string) => sender.send('execute_javascript', tabId, [code])

	const assertOk = (res: unknown, label: string) => {
		const r = res as { success?: boolean; error?: string } | null
		if (!r?.success) throw new Error(r?.error ?? `${label} failed`)
	}

	return {
		async click(selector: string): Promise<void> {
			log(`click(${selector})`)
			assertOk(await js(buildClickJS(selector)), `click(${selector})`)
		},

		async input(selector: string, value: string): Promise<void> {
			log(`input(${selector}, "${value}")`)
			assertOk(await js(buildInputJS(selector, value, false)), `input(${selector})`)
		},

		async inputEnter(selector: string, value: string): Promise<void> {
			log(`inputEnter(${selector}, "${value}")`)
			assertOk(await js(buildInputJS(selector, value, true)), `inputEnter(${selector})`)
		},

		async navigate(url: string): Promise<void> {
			log(`navigate → ${url}`)
			await sender.send('navigate', tabId, [{ url }])
			await delay(1500)
		},

		async wait(ms: number): Promise<void> {
			log(`wait(${ms}ms)`)
			await delay(ms)
		},

		async scroll(direction: 'up' | 'down' | 'left' | 'right' = 'down', pages = 1, selector?: string): Promise<void> {
			log(`scroll(${direction}, ${pages}${selector ? `, ${selector}` : ''})`)
			assertOk(await js(buildScrollJS(selector, direction, pages)), 'scroll')
		},

		async sendKeys(key: string): Promise<void> {
			log(`sendKeys(${key})`)
			assertOk(await js(buildSendKeysJS(key)), 'sendKeys')
		},

		async exists(selector: string): Promise<boolean> {
			log(`exists(${selector})`)
			const res = await js(`(function(){ const el = ${buildFindJS(selector)}; return !!el; })()`)
			return Boolean(res)
		},

		async getText(selector: string): Promise<string> {
			log(`getText(${selector})`)
			const res = await js(`(function(){ const el = ${buildFindJS(selector)}; if(!el) return {success:false,error:'not found'}; return {success:true,text:el.textContent?.trim()??''}; })()`) as { success: boolean; text?: string; error?: string } | null
			assertOk(res, `getText(${selector})`)
			return res?.text ?? ''
		},

		async getAttr(selector: string, attr: string): Promise<string> {
			log(`getAttr(${selector}, ${attr})`)
			const a = attr.replace(/`/g, '\\`')
			const res = await js(`(function(){ const el = ${buildFindJS(selector)}; if(!el) return {success:false,error:'not found'}; return {success:true,value:el.getAttribute(\`${a}\`)??''}; })()`) as { success: boolean; value?: string; error?: string } | null
			assertOk(res, `getAttr(${selector})`)
			return res?.value ?? ''
		},

		async queryAll(selector: string, fields: string[] = ['text']): Promise<Array<Record<string, string>>> {
			log(`queryAll(${selector}, [${fields.join(',')}])`)
			const res = await js(buildQueryAllJS(selector, fields))
			return Array.isArray(res) ? (res as Array<Record<string, string>>) : []
		},

		async clickNth(selector: string, index: number): Promise<void> {
			log(`clickNth(${selector}, ${index})`)
			assertOk(await js(buildClickNthJS(selector, index)), `clickNth(${selector}, ${index})`)
		},

		async getCurrentUrl(): Promise<string> {
			const res = await js('window.location.href')
			return typeof res === 'string' ? res : ''
		},
	}
}

// ─── JS builders ─────────────────────────────────────────────────────────────

function buildFindJS(selector: string): string {
	const s = selector.replace(/`/g, '\\`')
	return `
(function findEl(spec) {
  const [strategy, ...rest] = spec.split(':');
  const query = rest.join(':').trim();
  if (strategy === 'css') return document.querySelector(query);
  if (strategy === 'aria') {
    return [...document.querySelectorAll('[aria-label]')]
      .find(e => e.getAttribute('aria-label')?.trim() === query) ?? null;
  }
  if (strategy === 'placeholder') {
    return document.querySelector(\`[placeholder="\${query}"]\`) ??
           document.querySelector(\`[placeholder*="\${query}"]\`);
  }
  if (strategy === 'role') {
    const [role, textHint] = query.split('[text:');
    const candidates = [...document.querySelectorAll(\`[role="\${role.trim()}"]\`)];
    if (textHint) {
      const t = textHint.replace(']','').trim();
      return candidates.find(e => e.textContent?.includes(t)) ?? null;
    }
    return candidates[0] ?? null;
  }
  const textQuery = strategy === 'text' ? query : spec;
  return [...document.querySelectorAll('button,a,input,textarea,select,[role],[onclick],[tabindex]')]
    .find(e => e.textContent?.trim() === textQuery ||
               e.getAttribute('value')?.trim() === textQuery) ?? null;
})(\`${s}\`)`
}

function buildFindAllJS(selector: string): string {
	const s = selector.replace(/`/g, '\\`')
	return `
(function findAll(spec) {
  const [strategy, ...rest] = spec.split(':');
  const query = rest.join(':').trim();
  if (strategy === 'css') return [...document.querySelectorAll(query)];
  if (strategy === 'aria') {
    return [...document.querySelectorAll('[aria-label]')]
      .filter(e => e.getAttribute('aria-label')?.trim() === query);
  }
  if (strategy === 'text') {
    return [...document.querySelectorAll('button,a,li,div,span,td')]
      .filter(e => e.textContent?.trim() === query);
  }
  return [...document.querySelectorAll(spec)];
})(\`${s}\`)`
}

function buildClickJS(selector: string): string {
	return `(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
  el.scrollIntoView({block:'center'});
  el.click();
  return {success:true};
})()`
}

function buildClickNthJS(selector: string, index: number): string {
	return `(function(){
  const els = ${buildFindAllJS(selector)};
  const el = els[${index}];
  if (!el) return {success:false,error:'No element at index ${index} for: ${selector.replace(/'/g, "\\'")}'};
  el.scrollIntoView({block:'center'});
  el.click();
  return {success:true};
})()`
}

function buildInputJS(selector: string, value: string, pressEnter: boolean): string {
	const v = value.replace(/`/g, '\\`')
	return `(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
  el.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el.tagName==='INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set;
  nativeSetter?.call(el, \`${v}\`);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  ${pressEnter ? "el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));" : ''}
  return {success:true};
})()`
}

function buildSendKeysJS(keys: string): string {
	const k = keys.replace(/`/g, '\\`')
	return `(function(){
  const el = document.activeElement || document.body;
  el.dispatchEvent(new KeyboardEvent('keydown',{key:\`${k}\`,bubbles:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:\`${k}\`,bubbles:true}));
  return {success:true};
})()`
}

function buildScrollJS(selector: string | undefined, direction: string, pages: number): string {
	const dy = direction === 'up' ? `-${pages * 600}` : direction === 'down' ? `${pages * 600}` : '0'
	const dx = direction === 'left' ? `-${pages * 600}` : direction === 'right' ? `${pages * 600}` : '0'
	if (selector) {
		return `(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found for scroll'};
  el.scrollBy(${dx}, ${dy});
  return {success:true};
})()`
	}
	return `(function(){ window.scrollBy(${dx}, ${dy}); return {success:true}; })()`
}

function buildQueryAllJS(selector: string, fields: string[]): string {
	const fieldEntries = fields
		.map((f) => {
			if (f === 'text') return `text: e.textContent?.trim() ?? ''`
			if (f === 'value') return `value: (e.value ?? '')`
			if (f === 'href') return `href: e.getAttribute('href') ?? ''`
			return `${f}: e.getAttribute('${f}') ?? ''`
		})
		.join(', ')
	return `(function(){
  const els = ${buildFindAllJS(selector)};
  return els.map(e => ({ ${fieldEntries} }));
})()`
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
