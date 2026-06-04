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
	logs: string[]
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

		const logs: string[] = []
		const scriptConsole = {
			log: (...args: unknown[]) => {
				const line = args.map(String).join(' ')
				logs.push(line)
				console.log('[script]', line)
			},
			error: (...args: unknown[]) => {
				const line = args.map(String).join(' ')
				logs.push('[error] ' + line)
				console.error('[script:error]', line)
			},
		}

		const start = Date.now()
		try {
			if (meta.entryUrl) {
				await this.page.navigate(meta.entryUrl)
				await this.page.wait(1000)
			}
			// eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
			const fn = new Function(
				'page',
				'params',
				'runner',
				'console',
				`"use strict";\nreturn (async()=>{\n${code}\n})()`
			)
			await fn(this.page, params, this, scriptConsole)
			return { scriptId, success: true, durationMs: Date.now() - start, logs }
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err)
			logs.push('[error] ' + error)
			return { scriptId, success: false, error, durationMs: Date.now() - start, logs }
		}
	}
}
