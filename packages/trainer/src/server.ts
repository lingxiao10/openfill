import cors from 'cors'
import express from 'express'
import type { Server } from 'node:http'

import * as tm from './TaskManager.js'
import { bridge } from './bridge/BridgeServer.js'
import { ScriptRunner } from './runner/ScriptRunner.js'
import { ScriptStore } from './runner/ScriptStore.js'
import type {
	AddLogsPayload,
	CompleteExecutionPayload,
	CreateTaskPayload,
	StartExecutionPayload,
} from './types.js'

export function attachBridge(httpServer: Server): void {
	bridge.attach(httpServer)
}

export function createServer() {
	const app = express()
	app.use(cors())
	app.use(express.json({ limit: '200mb' }))

	// ── Tasks ──────────────────────────────────────────────────────────────────

	app.get('/api/tasks', (_req, res) => {
		res.json(tm.listTasks())
	})

	app.post('/api/tasks', (req, res) => {
		const body = req.body as CreateTaskPayload
		if (!body.name || !body.url || !body.description) {
			res.status(400).json({ error: 'name, url, description are required' })
			return
		}
		res.status(201).json(tm.createTask(body))
	})

	app.get('/api/tasks/:id', (req, res) => {
		const task = tm.getTask(req.params.id)
		if (!task) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json(task)
	})

	app.patch('/api/tasks/:id', (req, res) => {
		const task = tm.updateTask(req.params.id, req.body)
		if (!task) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json(task)
	})

	// ── Executions ─────────────────────────────────────────────────────────────

	app.get('/api/tasks/:id/executions', (req, res) => {
		res.json(tm.listExecutions(req.params.id))
	})

	app.post('/api/tasks/:id/executions', (req, res) => {
		const body = req.body as StartExecutionPayload
		if (!body.userRequest) {
			res.status(400).json({ error: 'userRequest is required' })
			return
		}
		const exec = tm.startExecution(req.params.id, body)
		if (!exec) {
			res.status(404).json({ error: 'Task not found' })
			return
		}
		res.status(201).json(exec)
	})

	app.get('/api/tasks/:id/executions/:eid', (req, res) => {
		const exec = tm.getExecution(req.params.id, req.params.eid)
		if (!exec) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json(exec)
	})

	// Append log entries to an execution (called by extension after each step)
	app.post('/api/tasks/:id/executions/:eid/logs', (req, res) => {
		const body = req.body as AddLogsPayload
		const ok = tm.appendLogs(req.params.id, req.params.eid, body.logs ?? [])
		if (!ok) {
			res.status(404).json({ error: 'Execution not found' })
			return
		}
		res.json({ ok: true })
	})

	app.post('/api/tasks/:id/executions/:eid/complete', (req, res) => {
		const body = req.body as CompleteExecutionPayload
		const ok = tm.completeExecution(req.params.id, req.params.eid, body.success ?? false)
		if (!ok) {
			res.status(404).json({ error: 'Execution not found' })
			return
		}
		res.json({ ok: true })
	})

	// ── Scripts ────────────────────────────────────────────────────────────────

	app.get('/api/tasks/:id/scripts', (req, res) => {
		res.json(tm.listScripts(req.params.id))
	})

	app.get('/api/tasks/:id/scripts/:sid', (req, res) => {
		const script = tm.getScript(req.params.id, req.params.sid)
		if (!script) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json(script)
	})

	// Generate a script from the latest (or specified) execution
	app.post('/api/tasks/:id/generate-script', (req, res) => {
		const script = tm.generateScript(req.params.id, req.body?.executionId)
		if (!script) {
			res.status(400).json({ error: 'No completed executions to generate from' })
			return
		}
		res.status(201).json(script)
	})

	// ── Notes ──────────────────────────────────────────────────────────────────

	app.get('/api/tasks/:id/executions/:eid/notes', (req, res) => {
		res.json(tm.getNotes(req.params.id, req.params.eid))
	})

	app.post('/api/tasks/:id/executions/:eid/notes', (req, res) => {
		const { content } = req.body as { content: string }
		if (!content) {
			res.status(400).json({ error: 'content is required' })
			return
		}
		const note = tm.addNote(req.params.id, req.params.eid, content)
		if (!note) {
			res.status(404).json({ error: 'Execution not found' })
			return
		}
		res.status(201).json(note)
	})

	// ── AI Sequences ───────────────────────────────────────────────────────────

	app.get('/api/tasks/:id/sequences', (req, res) => {
		res.json(tm.listSequences(req.params.id))
	})

	app.post('/api/tasks/:id/sequences', (req, res) => {
		const { name, description, params, xml } = req.body as {
			name: string
			description: string
			params: string[]
			xml: string
		}
		if (!name || !xml) {
			res.status(400).json({ error: 'name and xml are required' })
			return
		}
		res.status(201).json(tm.saveSequence(req.params.id, name, description ?? '', params ?? [], xml))
	})

	app.delete('/api/tasks/:id/sequences/:sid', (req, res) => {
		const ok = tm.deleteSequence(req.params.id, req.params.sid)
		if (!ok) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json({ ok: true })
	})

	// ── AI Scripts ─────────────────────────────────────────────────────────────

	app.get('/api/tasks/:id/ai-scripts', (req, res) => {
		res.json(tm.listTrainerScripts(req.params.id))
	})

	app.post('/api/tasks/:id/ai-scripts', (req, res) => {
		const script = req.body as Parameters<typeof tm.saveTrainerScript>[1]
		if (!script?.name || !script?.code) {
			res.status(400).json({ error: 'name and code are required' })
			return
		}
		res.status(201).json(tm.saveTrainerScript(req.params.id, script))
	})

	app.delete('/api/tasks/:id/ai-scripts/:sid', (req, res) => {
		const ok = tm.deleteTrainerScript(req.params.id, req.params.sid)
		if (!ok) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json({ ok: true })
	})

	// Health check (also used by extension to detect trainer availability)
	app.get('/health', (_req, res) => {
		res.json({ ok: true, service: 'page-agent-trainer', version: '1.0.0' })
	})

	// ─── Bridge status ─────────────────────────────────────────────────────────
	app.get('/api/bridge/status', (_req, res) => {
		res.json({ connected: bridge.connected })
	})

	// ─── Browser commands ──────────────────────────────────────────────────────
	app.post('/api/browser/cmd', async (req, res) => {
		const { command, payload } = req.body as { command: string; payload?: unknown }
		if (!bridge.connected) {
			res.status(503).json({ error: 'Extension not connected' })
			return
		}
		try {
			const result = await bridge.send(command, payload)
			res.json(result)
		} catch (err) {
			res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
		}
	})

	// ─── Automation scripts ────────────────────────────────────────────────────
	app.get('/api/scripts', (_req, res) => {
		res.json(ScriptStore.list())
	})

	app.post('/api/scripts', (req, res) => {
		const { meta, code } = req.body as {
			meta: Parameters<typeof ScriptStore.save>[0]
			code: string
		}
		const saved = ScriptStore.save(meta, code)
		res.json(saved)
	})

	app.get('/api/scripts/:id', (req, res) => {
		const s = ScriptStore.get(req.params.id)
		if (!s) {
			res.status(404).json({ error: 'Not found' })
			return
		}
		res.json({ ...s, code: ScriptStore.getCode(req.params.id) })
	})

	app.delete('/api/scripts/:id', (req, res) => {
		const ok = ScriptStore.delete(req.params.id)
		res.json({ ok })
	})

	app.post('/api/scripts/:id/run', async (req, res) => {
		const params = (req.body as { params?: Record<string, string> })?.params ?? {}
		const runner = new ScriptRunner()
		try {
			const result = await runner.run(req.params.id, params)
			res.json(result)
		} catch (err) {
			res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
		}
	})

	return app
}
