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
    el.focus();
    el.dispatchEvent(new FocusEvent('focus',{bubbles:true}));
    const proto = el.tagName==='INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
    setter?.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    ${
			pressEnter
				? `
    el.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13}));
    el.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13}));
    `
				: ''
		}
    el.dispatchEvent(new FocusEvent('blur',{bubbles:true}));
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
