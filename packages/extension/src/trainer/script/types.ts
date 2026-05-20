// Types for the JS-based trainer script system

export interface TrainerScript {
	id: string
	taskId: string
	name: string
	description: string
	/** Navigate here before running the script */
	entryUrl?: string
	/** Runtime param names, e.g. ["greeting", "jobTitle"] */
	params: string[]
	/** Async function body with access to `page` and `params` */
	code: string
	createdAt: string
	updatedAt: string
}

export interface ScriptRunResult {
	name: string
	params: Record<string, string>
	success: boolean
	/** Step-by-step log lines */
	output: string[]
	error?: string
}

export interface PageActionSender {
	send(action: string, tabId: number, payload: unknown[]): Promise<unknown>
}
