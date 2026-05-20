import cors from 'cors'
import express from 'express'

import * as tm from './TaskManager.js'
import type {
	AddLogsPayload,
	CompleteExecutionPayload,
	CreateTaskPayload,
	StartExecutionPayload,
} from './types.js'

export function createServer() {
	const app = express()
	app.use(cors())
	app.use(express.json({ limit: '10mb' }))

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

	// Health check (also used by extension to detect trainer availability)
	app.get('/health', (_req, res) => {
		res.json({ ok: true, service: 'page-agent-trainer', version: '1.0.0' })
	})

	return app
}
