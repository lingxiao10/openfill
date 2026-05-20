/**
 * SequenceExecutor — runs a SequenceSpec step by step.
 *
 * Depends only on:
 *   - SequenceParser (param substitution)
 *   - PageActionSender interface (injected — testable with a mock)
 *
 * Uses execute_javascript PAGE_CONTROL action to find elements on the live
 * page without needing highlight indices (which are session-specific).
 */
import { applyParams } from './SequenceParser'
import type { SequenceRunResult, SequenceSpec, StepResult, StepSpec } from './types'

// ─── Interface ────────────────────────────────────────────────────────────────

export interface PageActionSender {
	send(action: string, tabId: number, payload: unknown[]): Promise<unknown>
}

// ─── Executor ─────────────────────────────────────────────────────────────────

export async function execute(
	seq: SequenceSpec,
	params: Record<string, string>,
	tabId: number,
	sender: PageActionSender,
	onStep?: (r: StepResult) => void
): Promise<SequenceRunResult> {
	const resolved = applyParams(seq, params)
	const results: StepResult[] = []

	for (let i = 0; i < resolved.steps.length; i++) {
		const step = resolved.steps[i]
		const result = await runStep(step, i, tabId, sender)
		results.push(result)
		onStep?.(result)
		if (!result.success) break
	}

	return {
		name: seq.name,
		params,
		steps: results,
		success: results.every((r) => r.success),
	}
}

// ─── Step execution ───────────────────────────────────────────────────────────

async function runStep(
	step: StepSpec,
	index: number,
	tabId: number,
	sender: PageActionSender
): Promise<StepResult> {
	const base = { stepIndex: index, type: step.type, description: step.description }
	try {
		switch (step.type) {
			case 'wait': {
				await delay(step.ms ?? 1000)
				return { ...base, success: true }
			}
			case 'navigate': {
				if (!step.value) return { ...base, success: false, error: 'Missing url value' }
				await sender.send('navigate', tabId, [{ url: step.value }])
				await delay(1500)
				return { ...base, success: true }
			}
			case 'click': {
				if (!step.selector) return { ...base, success: false, error: 'Missing selector' }
				const js = buildClickJS(step.selector)
				const res = await sender.send('execute_javascript', tabId, [js])
				return parseJsResult(base, res)
			}
			case 'input':
			case 'input_enter': {
				if (!step.selector) return { ...base, success: false, error: 'Missing selector' }
				const js = buildInputJS(step.selector, step.value ?? '', step.type === 'input_enter')
				const res = await sender.send('execute_javascript', tabId, [js])
				return parseJsResult(base, res)
			}
			case 'send_keys': {
				const js = buildSendKeysJS(step.value ?? '')
				const res = await sender.send('execute_javascript', tabId, [js])
				return parseJsResult(base, res)
			}
			case 'scroll': {
				const js = buildScrollJS(step.selector, step.direction ?? 'down', step.pages ?? 1)
				const res = await sender.send('execute_javascript', tabId, [js])
				return parseJsResult(base, res)
			}
			default:
				return { ...base, success: false, error: `Unknown step type: ${step.type}` }
		}
	} catch (e) {
		return { ...base, success: false, error: e instanceof Error ? e.message : String(e) }
	}
}

// ─── JS builders ─────────────────────────────────────────────────────────────

/** Build JS that finds an element using the SelectorSpec strategy chain */
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
  // text: strategy (default)
  const textQuery = strategy === 'text' ? query : spec;
  return [...document.querySelectorAll('button,a,input,textarea,select,[role],[onclick],[tabindex]')]
    .find(e => e.textContent?.trim() === textQuery ||
               e.getAttribute('value')?.trim() === textQuery) ?? null;
})(\`${s}\`)
`
}

function buildClickJS(selector: string): string {
	return `
(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
  el.scrollIntoView({block:'center'});
  el.click();
  return {success:true};
})()`
}

function buildInputJS(selector: string, value: string, pressEnter: boolean): string {
	const v = value.replace(/`/g, '\\`')
	return `
(function(){
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
	return `
(function(){
  const el = document.activeElement || document.body;
  el.dispatchEvent(new KeyboardEvent('keydown',{key:\`${k}\`,bubbles:true}));
  el.dispatchEvent(new KeyboardEvent('keyup',{key:\`${k}\`,bubbles:true}));
  return {success:true};
})()`
}

function buildScrollJS(selector: string | undefined, direction: string, pages: number): string {
	const dy = direction === 'up' ? `-${pages * 600}` : `${pages * 600}`
	const dx =
		direction === 'left' ? `-${pages * 600}` : direction === 'right' ? `${pages * 600}` : '0'
	if (selector) {
		return `
(function(){
  const el = ${buildFindJS(selector)};
  if (!el) return {success:false,error:'Element not found for scroll'};
  el.scrollBy(${dx}, ${dy});
  return {success:true};
})()`
	}
	return `(function(){ window.scrollBy(${dx}, ${dy}); return {success:true}; })()`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsResult(base: Omit<StepResult, 'success'>, res: unknown): StepResult {
	if (res && typeof res === 'object' && 'success' in res) {
		const r = res as { success: boolean; error?: string }
		return { ...base, success: r.success, error: r.error }
	}
	// If execute_javascript returns a raw value, treat truthy as success
	return { ...base, success: Boolean(res) }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
