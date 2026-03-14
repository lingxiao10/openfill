import TRANSLATIONS from './trans.json'

export interface TransText {
	en: string
	zh: string
}

type Lang = 'en' | 'zh'

const LANG_KEY = 'page-agent:lang'

/**
 * i18n utility — all translations in trans.json.
 * Usage:
 *   Trans.t('cancel')                    → "Cancel" / "取消"
 *   Trans.t('steps', { n: '3' })         → "3 steps" / "3 步"
 */
export class Trans {
	static #lang: Lang | null = null
	static #listeners = new Set<() => void>()

	static getLang(): Lang {
		if (this.#lang) return this.#lang
		try {
			const stored = localStorage.getItem(LANG_KEY) as Lang | null
			if (stored === 'en' || stored === 'zh') {
				this.#lang = stored
				return stored
			}
		} catch {
			/* SSR / extension context */
		}
		if (typeof navigator !== 'undefined') {
			return navigator.language.startsWith('zh') ? 'zh' : 'en'
		}
		return 'en'
	}

	static setLang(lang: Lang): void {
		this.#lang = lang
		try {
			localStorage.setItem(LANG_KEY, lang)
		} catch {
			/* ignore */
		}
		for (const fn of this.#listeners) fn()
	}

	/** Subscribe to language changes — returns unsubscribe fn */
	static subscribe(fn: () => void): () => void {
		this.#listeners.add(fn)
		return () => this.#listeners.delete(fn)
	}

	/** Translate by key. Unknown key falls back to the key itself. */
	static t(key: string, vars?: Record<string, string>): string {
		const entry = (TRANSLATIONS as Record<string, TransText>)[key]
		let result = entry ? (entry[this.getLang()] ?? entry.en) : key
		if (vars) {
			result = result.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
		}
		return result
	}
}
