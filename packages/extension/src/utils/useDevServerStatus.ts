import { useEffect, useState } from 'react'

export type DevServerStatus = 'connected' | 'disconnected'

const DEV_SERVER_URL = 'http://127.0.0.1:3000'
const CHECK_INTERVAL = 3000
const TIMEOUT = 1000

/**
 * Polls the WXT dev server to report connection status.
 * Uses mode:'no-cors' so no CORS headers are required — a network error
 * (ERR_CONNECTION_REFUSED) is the only signal we need to distinguish up/down.
 */
export function useDevServerStatus(): DevServerStatus {
	const [status, setStatus] = useState<DevServerStatus>('disconnected')

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null
		let unmounted = false

		const check = async () => {
			try {
				const ctrl = new AbortController()
				const timeout = setTimeout(() => ctrl.abort(), TIMEOUT)
				await fetch(DEV_SERVER_URL, { mode: 'no-cors', signal: ctrl.signal })
				clearTimeout(timeout)
				if (!unmounted) setStatus('connected')
			} catch {
				if (!unmounted) setStatus('disconnected')
			}
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
