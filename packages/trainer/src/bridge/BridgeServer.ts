/**
 * BridgeServer — WebSocket server that relays commands to the Chrome extension.
 *
 * Protocol:
 *   Server → Extension: { id: string, command: string, payload?: unknown }
 *   Extension → Server: { id: string, result?: unknown, error?: string }
 */
import { IncomingMessage, Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'

interface PendingRequest {
	resolve: (value: unknown) => void
	reject: (reason: Error) => void
	timer: ReturnType<typeof setTimeout>
}

const TIMEOUT_MS = 120_000 // 2min — large video uploads need time

export class BridgeServer {
	private wss: WebSocketServer | null = null
	private client: WebSocket | null = null
	private readonly pending = new Map<string, PendingRequest>()

	get connected(): boolean {
		return this.client !== null && this.client.readyState === WebSocket.OPEN
	}

	attach(server: Server): void {
		this.wss = new WebSocketServer({ server, path: '/ws', maxPayload: 200 * 1024 * 1024 })
		this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
			console.log(`[Bridge] Extension connected from ${req.socket.remoteAddress}`)
			// Only one client at a time
			if (this.client && this.client.readyState === WebSocket.OPEN) {
				this.client.close()
			}
			this.client = ws

			ws.on('message', (data: Buffer) => {
				try {
					const msg = JSON.parse(data.toString()) as {
						id: string
						result?: unknown
						error?: string
					}
					const p = this.pending.get(msg.id)
					if (!p) return
					clearTimeout(p.timer)
					this.pending.delete(msg.id)
					if (msg.error) p.reject(new Error(msg.error))
					else p.resolve(msg.result)
				} catch {
					// ignore malformed messages
				}
			})

			ws.on('close', () => {
				console.log('[Bridge] Extension disconnected')
				if (this.client === ws) this.client = null
			})

			ws.on('error', (err) => {
				console.error('[Bridge] WebSocket error:', err.message)
			})
		})
	}

	async send(command: string, payload?: unknown): Promise<unknown> {
		if (!this.connected) throw new Error('Extension not connected to bridge')
		const id = crypto.randomUUID()
		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(new Error(`Bridge command timeout: ${command}`))
			}, TIMEOUT_MS)
			this.pending.set(id, { resolve, reject, timer })
			this.client!.send(JSON.stringify({ id, command, payload }))
		})
	}

	close(): void {
		this.wss?.close()
	}
}

export const bridge = new BridgeServer()
