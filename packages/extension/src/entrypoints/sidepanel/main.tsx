import React from 'react'
import ReactDOM from 'react-dom/client'

import { logStartupError } from '@/lib/startupLog'

import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

import '@/assets/index.css'

const NOISE_PATTERNS = ['ResizeObserver loop']
const isNoise = (msg: string) => NOISE_PATTERNS.some((p) => msg.includes(p))

// Capture global JS errors
window.addEventListener('error', (e) => {
	const msg = e.message || 'Unknown error'
	if (isNoise(msg)) return
	logStartupError({
		type: 'error',
		message: msg,
		stack: e.error?.stack,
		detail: { filename: e.filename, lineno: e.lineno, colno: e.colno },
	})
})

// Capture unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
	const msg = String(e.reason?.message ?? e.reason ?? 'Unhandled rejection')
	if (isNoise(msg)) return
	logStartupError({
		type: 'unhandledrejection',
		message: msg,
		stack: e.reason?.stack,
	})
})

// Sync dark mode with system preference
const syncDarkMode = () => {
	document.documentElement.classList.toggle(
		'dark',
		matchMedia('(prefers-color-scheme: dark)').matches
	)
}
syncDarkMode()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncDarkMode)

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</React.StrictMode>
)
