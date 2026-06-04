import { useEffect, useState } from 'react'

export type TrainerStatus = 'connected' | 'disconnected'

const TRAINER_URLS = ['http://localhost:3002/health', 'http://127.0.0.1:3002/health']
const CHECK_INTERVAL = 3000
const TIMEOUT = 1500

async function pingTrainer(urls: string[]): Promise<boolean> {
	for (const url of urls) {
		try {
			const ctrl = new AbortController()
			const t = setTimeout(() => ctrl.abort(), TIMEOUT)
			const res = await fetch(url, { signal: ctrl.signal })
			clearTimeout(t)
			if (res.ok) return true
		} catch {
			// try next
		}
	}
	return false
}

export function useTrainerStatus(): TrainerStatus {
	const [status, setStatus] = useState<TrainerStatus>('disconnected')

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null
		let unmounted = false

		const check = async () => {
			const ok = await pingTrainer(TRAINER_URLS)
			if (!unmounted) setStatus(ok ? 'connected' : 'disconnected')
			if (!unmounted) timer = setTimeout(check, CHECK_INTERVAL)
		}

		check()
		return () => {
			unmounted = true
			if (timer) clearTimeout(timer)
		}
	}, [])

	return status
}
