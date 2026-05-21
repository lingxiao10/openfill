/**
 * ScriptRunner — executes a saved automation script using RemotePage.
 *
 * Scripts export a function: async (page: RemotePage, params: Record<string,string>, runner: ScriptRunner) => void
 * Scripts can call other scripts via runner.run(scriptId, params).
 */
import { RemotePage } from './RemotePage.js'
import { ScriptStore } from './ScriptStore.js'

export interface RunResult {
	scriptId: string
	success: boolean
	error?: string
	durationMs: number
}

export class ScriptRunner {
	private readonly page: RemotePage

	constructor() {
		this.page = new RemotePage()
	}

	async run(scriptId: string, params: Record<string, string> = {}): Promise<RunResult> {
		const meta = ScriptStore.get(scriptId)
		if (!meta) throw new Error(`Script not found: ${scriptId}`)

		const code = ScriptStore.getCode(scriptId)
		if (!code) throw new Error(`Script file missing: ${scriptId}`)

		const start = Date.now()
		try {
			if (meta.entryUrl) {
				await this.page.navigate(meta.entryUrl)
				await this.page.wait(1000)
			}
			// Build a module from the script code and execute it
			const fn = new Function(
				'page',
				'params',
				'runner',
				`"use strict";\nreturn (async()=>{\n${code}\n})()`,
			)
			await fn(this.page, params, this)
			return { scriptId, success: true, durationMs: Date.now() - start }
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err)
			return { scriptId, success: false, error, durationMs: Date.now() - start }
		}
	}
}
