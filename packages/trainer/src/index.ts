import { createServer } from './server.js'

const PORT = Number(process.env.TRAINER_PORT ?? 3002)

const app = createServer()
app.listen(PORT, '127.0.0.1', () => {
	console.log(`[trainer] Server running at http://127.0.0.1:${PORT}`)
	console.log(`[trainer] Data stored in packages/trainer/data/`)
})
