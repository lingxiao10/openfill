/**
 * PageJsBuilder — builds JS strings to execute inside browser pages.
 * These strings are sent via execute_js bridge command to the content script.
 */

// ─── Selector resolution ──────────────────────────────────────────────────────

export function buildFindJS(selector: string): string {
	// CSS-first: starts with . # [ → raw querySelector
	if (/^[.#[]/.test(selector) || /^[a-z]+[.#[\s]/.test(selector)) {
		return `(function(){
      const el = document.querySelector(${JSON.stringify(selector)});
      return el || null;
    })()`
	}
	const [strategy, ...rest] = selector.split(':')
	const value = rest.join(':')
	switch (strategy) {
		case 'css':
			return `document.querySelector(${JSON.stringify(value)})`
		case 'text':
			return `(function(){
        const needle=${JSON.stringify(value)};
        return [...document.querySelectorAll('*')].find(el=>
          el.children.length===0 && el.textContent?.trim()===needle
        ) || null;
      })()`
		case 'textContains':
			return `(function(){
        const needle=${JSON.stringify(value)};
        return [...document.querySelectorAll('*')].find(el=>
          el.children.length===0 && el.textContent?.trim().includes(needle)
        ) || null;
      })()`
		case 'aria':
			return `document.querySelector('[aria-label=${JSON.stringify(value)}]')`
		case 'placeholder':
			return `document.querySelector('[placeholder=${JSON.stringify(value)}]')`
		case 'role':
			return `document.querySelector('[role=${JSON.stringify(value)}]')`
		default:
			return `document.querySelector(${JSON.stringify(selector)})`
	}
}

// ─── Focus (used before CDP insert) ──────────────────────────────────────────

export function buildFocusJS(selector: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    el.scrollIntoView({block:'center',behavior:'instant'});
    el.focus();
    el.dispatchEvent(new FocusEvent('focus',{bubbles:true}));
    return {success:true};
  })()`
}

// ─── Click ────────────────────────────────────────────────────────────────────

export function buildClickJS(selector: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    el.scrollIntoView({block:'center',behavior:'instant'});
    el.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,cancelable:true}));
    el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,buttons:1}));
    el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true}));
    el.click();
    return {success:true};
  })()`
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function buildInputJS(selector: string, value: string, pressEnter = false): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    el.scrollIntoView({block:'center',behavior:'instant'});
    el.focus();
    el.dispatchEvent(new FocusEvent('focus',{bubbles:true}));
    if (el.isContentEditable) {
      // Draft.js / contenteditable: selectAll then insertText — preserves React/Draft.js state
      document.execCommand('selectAll');
      document.execCommand('insertText', false, ${JSON.stringify(value)});
    } else {
      // React textarea/input: use nativeInputValueSetter to bypass React's synthetic value
      const proto = el.tagName==='INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
      setter?.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    ${
			pressEnter
				? `
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13}));
    el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13}));
    `
				: ''
		}
    return {success:true};
  })()`
}

// ─── Exists ───────────────────────────────────────────────────────────────────

export function buildExistsJS(selector: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    return {success:true,result:!!el};
  })()`
}

// ─── GetText ──────────────────────────────────────────────────────────────────

export function buildGetTextJS(selector: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found'};
    return {success:true,result:(el.textContent||'').trim()};
  })()`
}

// ─── GetAttr ──────────────────────────────────────────────────────────────────

export function buildGetAttrJS(selector: string, attr: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found'};
    return {success:true,result:el.getAttribute(${JSON.stringify(attr)})};
  })()`
}

// ─── QueryAll ─────────────────────────────────────────────────────────────────

export function buildQueryAllJS(selector: string, fields: string[]): string {
	const css = /^[.#[]/.test(selector) ? selector : selector.replace(/^css:/, '')
	return `(function(){
    const els = [...document.querySelectorAll(${JSON.stringify(css)})];
    return {success:true,result:els.map(el=>({
      ${fields
				.map((f) => {
					if (f === 'text') return `text:(el.textContent||'').trim()`
					if (f === 'href') return `href:el.getAttribute('href')`
					return `${f}:el.getAttribute('${f}')`
				})
				.join(',')}
    }))};
  })()`
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export function buildClearJS(selector: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    el.scrollIntoView({block:'center',behavior:'instant'});
    el.focus();
    if (el.isContentEditable) {
      document.execCommand('selectAll');
      document.execCommand('delete');
    } else {
      const proto = el.tagName==='INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
      setter?.call(el, '');
      el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    }
    return {success:true};
  })()`
}

// ─── SendKey ──────────────────────────────────────────────────────────────────
// Parses combo at build-time (Node.js), emits resolved key values into page JS.
// Supports: "Enter", "Escape", "Tab", "Backspace", "Delete", "ArrowDown",
//           "Ctrl+A", "Ctrl+Shift+Z", "Shift+Enter", single chars, etc.

const KEY_DEFS: Record<string, { code: string; keyCode: number }> = {
	Enter: { code: 'Enter', keyCode: 13 },
	Tab: { code: 'Tab', keyCode: 9 },
	Escape: { code: 'Escape', keyCode: 27 },
	Backspace: { code: 'Backspace', keyCode: 8 },
	Delete: { code: 'Delete', keyCode: 46 },
	Space: { code: 'Space', keyCode: 32 },
	Home: { code: 'Home', keyCode: 36 },
	End: { code: 'End', keyCode: 35 },
	PageUp: { code: 'PageUp', keyCode: 33 },
	PageDown: { code: 'PageDown', keyCode: 34 },
	ArrowUp: { code: 'ArrowUp', keyCode: 38 },
	ArrowDown: { code: 'ArrowDown', keyCode: 40 },
	ArrowLeft: { code: 'ArrowLeft', keyCode: 37 },
	ArrowRight: { code: 'ArrowRight', keyCode: 39 },
	A: { code: 'KeyA', keyCode: 65 },
	B: { code: 'KeyB', keyCode: 66 },
	C: { code: 'KeyC', keyCode: 67 },
	D: { code: 'KeyD', keyCode: 68 },
	F: { code: 'KeyF', keyCode: 70 },
	G: { code: 'KeyG', keyCode: 71 },
	H: { code: 'KeyH', keyCode: 72 },
	K: { code: 'KeyK', keyCode: 75 },
	L: { code: 'KeyL', keyCode: 76 },
	N: { code: 'KeyN', keyCode: 78 },
	O: { code: 'KeyO', keyCode: 79 },
	P: { code: 'KeyP', keyCode: 80 },
	R: { code: 'KeyR', keyCode: 82 },
	S: { code: 'KeyS', keyCode: 83 },
	T: { code: 'KeyT', keyCode: 84 },
	U: { code: 'KeyU', keyCode: 85 },
	V: { code: 'KeyV', keyCode: 86 },
	W: { code: 'KeyW', keyCode: 87 },
	X: { code: 'KeyX', keyCode: 88 },
	Y: { code: 'KeyY', keyCode: 89 },
	Z: { code: 'KeyZ', keyCode: 90 },
}

function parseCombo(combo: string): {
	key: string
	code: string
	keyCode: number
	ctrlKey: boolean
	shiftKey: boolean
	altKey: boolean
} {
	let ctrlKey = false,
		shiftKey = false,
		altKey = false,
		mainKey = ''
	for (const part of combo.split('+')) {
		const p = part.trim()
		if (p === 'Ctrl' || p === 'Control') ctrlKey = true
		else if (p === 'Shift') shiftKey = true
		else if (p === 'Alt') altKey = true
		else mainKey = p
	}
	const def = KEY_DEFS[mainKey] ?? KEY_DEFS[mainKey.toUpperCase()]
	const code = def?.code ?? (mainKey.length === 1 ? `Key${mainKey.toUpperCase()}` : mainKey)
	const keyCode = def?.keyCode ?? (mainKey.length === 1 ? mainKey.toUpperCase().charCodeAt(0) : 0)
	const key =
		mainKey.length === 1 ? (shiftKey ? mainKey.toUpperCase() : mainKey.toLowerCase()) : mainKey
	return { key, code, keyCode, ctrlKey, shiftKey, altKey }
}

export function buildSendKeyJS(selector: string | null, combo: string): string {
	const { key, code, keyCode, ctrlKey, shiftKey, altKey } = parseCombo(combo)
	const elExpr = selector
		? `(${buildFindJS(selector)} || document.activeElement)`
		: `document.activeElement`
	const modInit = `{bubbles:true,cancelable:true,ctrlKey:${ctrlKey},shiftKey:${shiftKey},altKey:${altKey}}`
	const keyInit = `{key:${JSON.stringify(key)},code:${JSON.stringify(code)},keyCode:${keyCode},which:${keyCode},...modInit}`
	const pressModifiers = [
		ctrlKey
			? `el.dispatchEvent(new KeyboardEvent('keydown',{...modInit,key:'Control',code:'ControlLeft',keyCode:17,which:17}));`
			: '',
		shiftKey
			? `el.dispatchEvent(new KeyboardEvent('keydown',{...modInit,key:'Shift',code:'ShiftLeft',keyCode:16,which:16}));`
			: '',
		altKey
			? `el.dispatchEvent(new KeyboardEvent('keydown',{...modInit,key:'Alt',code:'AltLeft',keyCode:18,which:18}));`
			: '',
	]
		.filter(Boolean)
		.join('\n    ')
	const releaseModifiers = [
		altKey
			? `el.dispatchEvent(new KeyboardEvent('keyup',{...modInit,key:'Alt',code:'AltLeft',keyCode:18,which:18}));`
			: '',
		shiftKey
			? `el.dispatchEvent(new KeyboardEvent('keyup',{...modInit,key:'Shift',code:'ShiftLeft',keyCode:16,which:16}));`
			: '',
		ctrlKey
			? `el.dispatchEvent(new KeyboardEvent('keyup',{...modInit,key:'Control',code:'ControlLeft',keyCode:17,which:17}));`
			: '',
	]
		.filter(Boolean)
		.join('\n    ')
	const keypress =
		key.length === 1 || key === 'Enter'
			? `el.dispatchEvent(new KeyboardEvent('keypress',{...keyInit,charCode:${keyCode}}));`
			: ''
	return `(function(){
    const el = ${elExpr};
    if (!el) return {success:false,error:'No element to send key to'};
    const modInit = ${modInit};
    const keyInit = ${keyInit};
    ${pressModifiers}
    el.dispatchEvent(new KeyboardEvent('keydown',keyInit));
    ${keypress}
    el.dispatchEvent(new KeyboardEvent('keyup',keyInit));
    ${releaseModifiers}
    return {success:true};
  })()`
}

// ─── Select (dropdown) ────────────────────────────────────────────────────────

export function buildSelectJS(selector: string, optionText: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    if (!(el instanceof HTMLSelectElement)) return {success:false,error:'Element is not a <select>'};
    const opt = [...el.options].find(o=>o.textContent?.trim()===${JSON.stringify(optionText.trim())});
    if (!opt) return {success:false,error:'Option not found: ${optionText.replace(/'/g, "\\'")}'};
    el.value = opt.value;
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return {success:true,result:opt.value};
  })()`
}

// ─── UploadFile ───────────────────────────────────────────────────────────────
// Injects a local file (already read + base64-encoded by Node.js) into an
// input[type=file] element via DataTransfer, then dispatches a change event.

export function buildUploadFileJS(
	selector: string,
	b64: string,
	filename: string,
	mimeType: string
): string {
	return `(function(){
    // If selector points to a non-file element, walk up to find the nearest input[type=file]
    let el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    if (el.tagName !== 'INPUT' || el.type !== 'file') {
      el = el.querySelector('input[type=file]') || el.closest('input[type=file]') || el.parentElement?.querySelector('input[type=file]');
    }
    if (!el) return {success:false,error:'No input[type=file] found near: ${selector.replace(/'/g, "\\'")}'};
    const b64=${JSON.stringify(b64)};
    const byteStr=atob(b64);
    const arr=new Uint8Array(byteStr.length);
    for(let i=0;i<byteStr.length;i++) arr[i]=byteStr.charCodeAt(i);
    const file=new File([arr],${JSON.stringify(filename)},{type:${JSON.stringify(mimeType)}});
    const dt=new DataTransfer();
    dt.items.add(file);
    el.files=dt.files;
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('input',{bubbles:true}));
    return {success:true,result:{name:file.name,size:file.size,type:file.type}};
  })()`
}

// ─── PasteText ────────────────────────────────────────────────────────────────
// Use ClipboardEvent paste instead of execCommand('insertText') for large
// multi-line content in Draft.js editors — avoids truncation on long strings.

export function buildPasteTextJS(selector: string, value: string): string {
	return `(function(){
    const el = ${buildFindJS(selector)};
    if (!el) return {success:false,error:'Element not found: ${selector.replace(/'/g, "\\'")}'};
    el.scrollIntoView({block:'center',behavior:'instant'});
    el.focus();
    el.dispatchEvent(new FocusEvent('focus',{bubbles:true}));
    document.execCommand('selectAll');
    const dt = new DataTransfer();
    dt.setData('text/plain', ${JSON.stringify(value)});
    el.dispatchEvent(new ClipboardEvent('paste', {clipboardData:dt, bubbles:true, cancelable:true}));
    return {success:true};
  })()`
}

// ─── Scroll ───────────────────────────────────────────────────────────────────

export function buildScrollJS(direction: string, pages = 1): string {
	const dirMap: Record<string, number[]> = {
		down: [0, 1],
		up: [0, -1],
		right: [1, 0],
		left: [-1, 0],
	}
	const [dx, dy] = dirMap[direction] ?? [0, 1]
	return `(function(){
    const h = window.innerHeight * ${pages};
    window.scrollBy(${dx} * h, ${dy} * h);
    return {success:true};
  })()`
}

// ─── GetCleanHtml ─────────────────────────────────────────────────────────────

export function buildGetCleanHtmlJS(scope?: string, limit = 50000): string {
	const root = scope ? `document.querySelector(${JSON.stringify(scope)})` : `document.body`
	return `(function(){
    const root = ${root};
    if (!root) return {success:false,error:'Scope not found: ${(scope ?? '').replace(/'/g, "\\'")}'};
    const clone = root.cloneNode(true);
    // Remove noise tags
    ['script','style','svg','noscript','iframe','canvas','template'].forEach(tag=>{
      clone.querySelectorAll(tag).forEach(el=>el.remove());
    });
    // Remove noise attributes
    const HASH_RE = /^(css-|sc-|chakra-|emotion-)[a-zA-Z0-9_-]+$|^[a-zA-Z0-9_-]{20,}$/;
    const KEEP_ATTRS = new Set(['id','class','name','href','src','alt','placeholder',
      'role','type','value','checked','disabled','readonly','aria-label','aria-expanded',
      'aria-hidden','data-testid','data-id','data-index','data-key','data-type','data-name']);
    clone.querySelectorAll('*').forEach(el=>{
      // Clean attributes
      [...el.attributes].forEach(attr=>{
        const n = attr.name;
        if(n.startsWith('on') || n.startsWith('data-v-')) { el.removeAttribute(n); return; }
        if(!KEEP_ATTRS.has(n) && !n.startsWith('aria-') && !n.startsWith('data-')) { el.removeAttribute(n); return; }
      });
      // Clean hash class names
      const cls = el.getAttribute('class');
      if(cls){
        const cleaned = cls.split(/\\s+/).filter(c=>!HASH_RE.test(c)).join(' ').trim();
        if(cleaned) el.setAttribute('class',cleaned); else el.removeAttribute('class');
      }
      // Remove style attr
      el.removeAttribute('style');
    });
    const html = clone.innerHTML;
    if(html.length > ${limit}) {
      return {success:true,result:html.slice(0,${limit})+'\\n<!-- truncated, use getCleanHtml with a narrower scope -->'};
    }
    return {success:true,result:html};
  })()`
}
