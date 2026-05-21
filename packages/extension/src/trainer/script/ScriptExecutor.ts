/**
 * ScriptExecutor — runs AI-written JS scripts in trainer mode only.
 *
 * Script body receives:
 *   page   — PageAPI (DOM helpers via execute_javascript, incl. getCleanHtml)
 *   params — runtime key/value substitutions
 *
 * Selector formats supported:
 *   .class, #id, [attr="val"]  → raw CSS (preferred, no prefix needed)
 *   text:visible text           → exact text match
 *   textContains:partial        → partial text match
 *   aria:label                  → aria-label attribute
 *   placeholder:hint            → placeholder attribute
 *   role:button[text:Apply]     → ARIA role with optional text hint
 *   css:any-selector            → explicit CSS (same as unprefixed)
 *
 * This module is TRAINER-ONLY. Normal agent tasks use the core page tools.
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

		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const fn = new Function('page', 'params', `"use strict";\nreturn (async () => {\n${code}\n})()`)
		await (fn as (p: typeof page, q: Record<string, string>) => Promise<void>)(page, params)

		log('✓ Script completed')
		return { name: spec.name, params, success: true, output: logs }
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		log(`✗ Error: ${msg}`)
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
		/** Click an element. Dispatches full mouse event sequence for React/Vue compatibility. */
		async click(selector: string): Promise<void> {
			log(`click(${selector})`)
			assertOk(await js(buildClickJS(selector)), `click(${selector})`)
		},

		/** Fill an input or textarea. Uses native setter + React/Vue-friendly events. */
		async input(selector: string, value: string): Promise<void> {
			log(`input(${selector}, "${value}")`)
			assertOk(await js(buildInputJS(selector, value, false)), `input(${selector})`)
		},

		/** Fill an input and press Enter. */
		async inputEnter(selector: string, value: string): Promise<void> {
			log(`inputEnter(${selector}, "${value}")`)
			assertOk(await js(buildInputJS(selector, value, true)), `inputEnter(${selector})`)
		},

		/** Navigate to a URL and wait for page load. */
		async navigate(url: string): Promise<void> {
			log(`navigate → ${url}`)
			await sender.send('navigate', tabId, [{ url }])
			await delay(1500)
		},

		/** Wait for a number of milliseconds. */
		async wait(ms: number): Promise<void> {
			log(`wait(${ms}ms)`)
			await delay(ms)
		},

		/** Scroll the page or a specific element. */
		async scroll(
			direction: 'up' | 'down' | 'left' | 'right' = 'down',
			pages = 1,
			selector?: string
		): Promise<void> {
			log(`scroll(${direction}, ${pages}${selector ? `, ${selector}` : ''})`)
			assertOk(await js(buildScrollJS(selector, direction, pages)), 'scroll')
		},

		/** Dispatch keyboard events on the active element. */
		async sendKeys(key: string): Promise<void> {
			log(`sendKeys(${key})`)
			assertOk(await js(buildSendKeysJS(key)), 'sendKeys')
		},

		/** Returns true if the element exists, never throws. */
		async exists(selector: string): Promise<boolean> {
			const res = await js(`(function(){ return !!(${buildFindJS(selector)}); })()`)
			return Boolean(res)
		},

		/** Get trimmed text content of an element. */
		async getText(selector: string): Promise<string> {
			log(`getText(${selector})`)
			const res = (await js(
				`(function(){ const el=${buildFindJS(selector)}; if(!el) return {success:false,error:'not found'}; return {success:true,text:el.textContent?.trim()??''}; })()`
			)) as { success: boolean; text?: string; error?: string } | null
			assertOk(res, `getText(${selector})`)
			return res?.text ?? ''
		},

		/** Get an attribute value from an element. */
		async getAttr(selector: string, attr: string): Promise<string> {
			log(`getAttr(${selector}, ${attr})`)
			const a = attr.replace(/`/g, '\\`')
			const res = (await js(
				`(function(){ const el=${buildFindJS(selector)}; if(!el) return {success:false,error:'not found'}; return {success:true,value:el.getAttribute(\`${a}\`)??''}; })()`
			)) as { success: boolean; value?: string; error?: string } | null
			assertOk(res, `getAttr(${selector})`)
			return res?.value ?? ''
		},

		/** Get all matching elements as data objects. fields defaults to ['text']. */
		async queryAll(
			selector: string,
			fields: string[] = ['text']
		): Promise<Array<Record<string, string>>> {
			log(`queryAll(${selector}, [${fields.join(',')}])`)
			const res = await js(buildQueryAllJS(selector, fields))
			return Array.isArray(res) ? (res as Array<Record<string, string>>) : []
		},

		/** Click the nth (0-indexed) match of a selector. */
		async clickNth(selector: string, index: number): Promise<void> {
			log(`clickNth(${selector}, ${index})`)
			assertOk(await js(buildClickNthJS(selector, index)), `clickNth(${selector}, ${index})`)
		},

		/** Get the current page URL. */
		async getCurrentUrl(): Promise<string> {
			const res = await js('window.location.href')
			return typeof res === 'string' ? res : ''
		},

		/**
		 * Get a cleaned snapshot of the page HTML for selector discovery.
		 * Strips <script>, <style>, <svg>, inline styles, event handlers, and hash class names.
		 * Use during exploration to find stable CSS selectors (id, class, data-* attributes).
		 *
		 * @param scope  Optional CSS selector to limit the snapshot (e.g. '.job-list')
		 * @param limit  Max chars returned (default 50000)
		 */
		async getCleanHtml(scope?: string, limit = 50000): Promise<string> {
			log(`getCleanHtml(${scope ?? 'body'})`)
			const res = (await js(buildGetCleanHtmlJS(scope, limit))) as {
				success: boolean
				html?: string
				error?: string
			} | null
			assertOk(res, 'getCleanHtml')
			return res?.html ?? ''
		},
	}
}

// ─── JS builders ─────────────────────────────────────────────────────────────

/**
 * Build a JS expression that locates ONE element.
 *
 * Selector dispatch:
 *   starts with . # [  → raw CSS querySelector (most reliable, preferred)
 *   css:query          → explicit CSS
 *   text:exact         → exact textContent match
 *   textContains:part  → partial textContent match
 *   aria:label         → aria-label attribute
 *   placeholder:hint   → placeholder attribute
 *   role:r[text:hint]  → ARIA role with optional text hint
 *   (bare word)        → text fallback
 */
function buildFindJS(selector: string): string {
	const s = selector.replace(/`/g, '\\`')

	// CSS shorthand: starts with ., #, or [
	if (/^[.#[]/.test(selector)) {
		return `document.querySelector(\`${s}\`)`
	}

	return `
(function findEl(spec) {
  const colon = spec.indexOf(':');
  const strategy = colon >= 0 ? spec.slice(0, colon) : '';
  const query = colon >= 0 ? spec.slice(colon + 1).trim() : spec;
  if (strategy === 'css' || strategy === '') return document.querySelector(query);
  if (strategy === 'text') {
    return [...document.querySelectorAll('button,a,input,textarea,select,[role],[onclick],[tabindex],li,span,div')]
      .find(e => e.textContent?.trim() === query) ?? null;
  }
  if (strategy === 'textContains') {
    return [...document.querySelectorAll('button,a,input,textarea,select,[role],[onclick],[tabindex],li,span,div')]
      .find(e => e.textContent?.trim().includes(query)) ?? null;
  }
  if (strategy === 'aria') {
    return [...document.querySelectorAll('[aria-label]')]
      .find(e => e.getAttribute('aria-label')?.trim() === query) ?? null;
  }
  if (strategy === 'placeholder') {
    return document.querySelector(\`[placeholder="\${query}"]\`) ??
           document.querySelector(\`[placeholder*="\${query}"]\`) ?? null;
  }
  if (strategy === 'role') {
    const [role, textHint] = query.split('[text:');
    const candidates = [...document.querySelectorAll(\`[role="\${role.trim()}"]\`)];
    if (textHint) {
      const t = textHint.replace(']', '').trim();
      return candidates.find(e => e.textContent?.includes(t)) ?? null;
    }
    return candidates[0] ?? null;
  }
  // bare word — treat as text
  return [...document.querySelectorAll('button,a,input,textarea,select,[role],[tabindex]')]
    .find(e => e.textContent?.trim() === spec) ?? null;
})(\`${s}\`)`
}

/**
 * Build a JS expression that returns an ARRAY of elements matching the selector.
 */
function buildFindAllJS(selector: string): string {
	const s = selector.replace(/`/g, '\\`')

	// CSS shorthand
	if (/^[.#[]/.test(selector)) {
		return `[...document.querySelectorAll(\`${s}\`)]`
	}

	return `
(function findAll(spec) {
  const colon = spec.indexOf(':');
  const strategy = colon >= 0 ? spec.slice(0, colon) : '';
  const query = colon >= 0 ? spec.slice(colon + 1).trim() : spec;
  if (strategy === 'css' || strategy === '') return [...document.querySelectorAll(query)];
  if (strategy === 'text') {
    return [...document.querySelectorAll('button,a,li,div,span,td')]
      .filter(e => e.textContent?.trim() === query);
  }
  if (strategy === 'textContains') {
    return [...document.querySelectorAll('button,a,li,div,span,td')]
      .filter(e => e.textContent?.trim().includes(query));
  }
  if (strategy === 'aria') {
    return [...document.querySelectorAll('[aria-label]')]
      .filter(e => e.getAttribute('aria-label')?.trim() === query);
  }
  return [...document.querySelectorAll(spec)];
})(\`${s}\`)`
}

function buildClickJS(selector: string): string {
	const err = selector.replace(/'/g, "\\'")
	return `(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found: ${err}'};
  el.scrollIntoView({block:'center',behavior:'instant'});
  el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,cancelable:true}));
  el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,buttons:1}));
  el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
  el.click();
  return {success:true};
})()`
}

function buildClickNthJS(selector: string, index: number): string {
	const err = selector.replace(/'/g, "\\'")
	return `(function(){
  const els = ${buildFindAllJS(selector)};
  const el = els[${index}];
  if (!el) return {success:false,error:'No element at index ${index}: ${err}'};
  el.scrollIntoView({block:'center',behavior:'instant'});
  el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,cancelable:true}));
  el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,buttons:1}));
  el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
  el.click();
  return {success:true};
})()`
}

function buildInputJS(selector: string, value: string, pressEnter: boolean): string {
	const v = value.replace(/`/g, '\\`')
	const err = selector.replace(/'/g, "\\'")
	const enterEvents = pressEnter
		? `el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,bubbles:true,cancelable:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,bubbles:true}));`
		: ''
	return `(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found: ${err}'};
  el.focus();
  el.dispatchEvent(new FocusEvent('focus',{bubbles:true}));
  const proto = el.tagName==='INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
  setter?.call(el,\`${v}\`);
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  ${enterEvents}
  el.dispatchEvent(new FocusEvent('blur',{bubbles:true}));
  return {success:true};
})()`
}

function buildSendKeysJS(keys: string): string {
	const k = keys.replace(/`/g, '\\`')
	return `(function(){
  const el = document.activeElement || document.body;
  el.dispatchEvent(new KeyboardEvent('keydown',{key:\`${k}\`,code:\`${k}\`,bubbles:true,cancelable:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:\`${k}\`,code:\`${k}\`,bubbles:true}));
  return {success:true};
})()`
}

function buildScrollJS(selector: string | undefined, direction: string, pages: number): string {
	const dy = direction === 'up' ? `-${pages * 600}` : direction === 'down' ? `${pages * 600}` : '0'
	const dx =
		direction === 'left' ? `-${pages * 600}` : direction === 'right' ? `${pages * 600}` : '0'
	if (selector) {
		return `(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found for scroll'};
  el.scrollBy(${dx},${dy});
  return {success:true};
})()`
	}
	return `(function(){ window.scrollBy(${dx},${dy}); return {success:true}; })()`
}

function buildQueryAllJS(selector: string, fields: string[]): string {
	const fieldEntries = fields
		.map((f) => {
			if (f === 'text') return `text: e.textContent?.trim() ?? ''`
			if (f === 'value') return `value: (e.value ?? '')`
			if (f === 'href') return `href: e.getAttribute('href') ?? ''`
			return `'${f}': e.getAttribute('${f}') ?? ''`
		})
		.join(', ')
	return `(function(){
  const els = ${buildFindAllJS(selector)};
  return els.map(e => ({ ${fieldEntries} }));
})()`
}

/**
 * Extracts a cleaned, compact HTML snapshot from the live page.
 * Removes: <script>, <style>, <svg>, <noscript>, <iframe>, <canvas>,
 *          inline styles, on* event handlers, Vue scoping attrs,
 *          hash-only class names (css-abc123, sc-XyzAbc, etc.)
 * Keeps:   id, class (semantic only), name, href, src, alt, placeholder,
 *          data-*, role, aria-*, type, value, checked, disabled, readonly
 * Result is truncated to `limit` chars to avoid overwhelming the AI.
 */
function buildGetCleanHtmlJS(scope: string | undefined, limit: number): string {
	const rootExpr = scope
		? `document.querySelector(${JSON.stringify(scope)})`
		: `document.body`

	return `(function(){
  const root = ${rootExpr};
  if (!root) return {success:false,error:'Scope not found: ${(scope ?? '').replace(/'/g, "\\'")}'};
  const clone = root.cloneNode(true);
  // Remove noisy subtrees
  clone.querySelectorAll('script,style,svg,noscript,iframe,canvas,picture').forEach(e=>e.remove());
  // Clean each element's attributes
  const KEEP = new Set(['id','class','name','href','src','alt','placeholder','type','value',
    'checked','disabled','readonly','role','for','action','method','target','rel','download']);
  const HASH_CLASS = /^(css-|sc-|chakra-|emotion-)[a-zA-Z0-9_-]+$|^[a-zA-Z]+-[A-Z][a-zA-Z0-9]+$/;
  clone.querySelectorAll('*').forEach(el => {
    const toRemove = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith('on') || /^data-v-[a-f0-9]+$/.test(attr.name)) {
        toRemove.push(attr.name);
      } else if (attr.name === 'style') {
        toRemove.push('style');
      } else if (!KEEP.has(attr.name) && !attr.name.startsWith('data-') && !attr.name.startsWith('aria-')) {
        toRemove.push(attr.name);
      }
    }
    toRemove.forEach(a => el.removeAttribute(a));
    // Filter out hash-only class tokens
    if (el.className && typeof el.className === 'string') {
      const clean = el.className.split(' ').filter(c => c && !HASH_CLASS.test(c)).join(' ');
      clean ? el.setAttribute('class', clean) : el.removeAttribute('class');
    }
  });
  const html = clone.outerHTML;
  return {success:true, html: html.length > ${limit} ? html.slice(0,${limit}) + '\\n...(truncated, use a narrower scope)' : html};
})()`
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
