/**
 * Debug log server for Page Agent development.
 *
 * Usage:
 *   node debug-log-server.js
 *
 * The extension (when DEBUG_LOG=true) will POST log entries here.
 * All logs are appended to debug.log in the project root.
 *
 * Read logs:  open debug.log in any editor, or ask Claude to read it.
 * Clear logs: delete debug.log (it will be recreated automatically).
 */

import http from 'http'
import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = 7373
const LOG_FILE = path.join(__dirname, 'debug.log')

const server = http.createServer((req, res) => {
	// CORS – allow requests from the extension
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

	if (req.method === 'OPTIONS') {
		res.writeHead(204)
		res.end()
		return
	}

	if (req.method === 'POST' && req.url === '/log') {
		let body = ''
		req.on('data', (chunk) => (body += chunk))
		req.on('end', () => {
			try {
				fs.appendFileSync(LOG_FILE, body)
				res.writeHead(200)
				res.end('ok')
			} catch (err) {
				console.error('[debug-log-server] write error:', err)
				res.writeHead(500)
				res.end('error')
			}
		})
		return
	}

	if (req.method === 'GET' && req.url === '/clear') {
		fs.writeFileSync(LOG_FILE, '')
		console.log('[debug-log-server] Log cleared.')
		res.writeHead(200)
		res.end('cleared')
		return
	}

	res.writeHead(404)
	res.end()
})

server.listen(PORT, '127.0.0.1', () => {
	console.log(`[debug-log-server] Listening on http://localhost:${PORT}`)
	console.log(`[debug-log-server] Writing logs to: ${LOG_FILE}`)
	console.log(`[debug-log-server] Clear logs: GET http://localhost:${PORT}/clear`)
})
